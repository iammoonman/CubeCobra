import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { CopyObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import dotenv from 'dotenv';

dotenv.config();

// Mirrors the ML model from the data bucket (where the recommender service
// downloads it on boot) into the assets bucket so it's reachable through
// CloudFront at https://assets.<domain>/model/...
//
// Source and dest live in different regions: data bucket is us-east-2,
// assets bucket is us-east-1 (CloudFront cert region). CopyObject supports
// cross-region — we issue the call from a client in the dest region.
//
// Idempotent in two ways:
//   1. Files whose ETag already matches the destination are skipped, so most
//      deploys do zero copies (the model is updated roughly once a year).
//   2. CloudFront invalidation only fires when we actually wrote new bytes.
//
// Cache: 30-day max-age. The model rarely changes; when it does we issue a
// `/model/*` invalidation in the same run.
//
// Env:
//   CUBECOBRA_ASSETS_BUCKET   — destination bucket (required; same one used by upload-assets)
//   CUBECOBRA_ASSETS_REGION   — destination region (defaults to us-east-1)
//   CDN_DISTRIBUTION_ID       — required to invalidate after a real change; warns and skips if unset
//   DATA_BUCKET               — source bucket (defaults to cubecobra-data)
//   DATA_BUCKET_REGION        — source region (defaults to us-east-2, falls back to AWS_REGION)

const SOURCE_PREFIX = 'model/';
const DEST_PREFIX = 'model/';
const MONTH_CACHE = 'public, max-age=2592000';

const sourceBucket = process.env.DATA_BUCKET || 'cubecobra-data';
const destBucket = process.env.CUBECOBRA_ASSETS_BUCKET;
if (!destBucket) {
  console.error('CUBECOBRA_ASSETS_BUCKET is required');
  process.exit(1);
}

const sourceRegion = process.env.DATA_BUCKET_REGION || process.env.AWS_REGION || 'us-east-2';
const destRegion = process.env.CUBECOBRA_ASSETS_REGION || 'us-east-1';

const sourceS3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT || undefined,
  forcePathStyle: !!process.env.AWS_ENDPOINT,
  credentials: fromNodeProviderChain(),
  region: sourceRegion,
});

const destS3 = new S3Client({
  endpoint: process.env.AWS_ENDPOINT || undefined,
  forcePathStyle: !!process.env.AWS_ENDPOINT,
  credentials: fromNodeProviderChain(),
  region: destRegion,
});

const contentTypeFor = (key: string): string =>
  key.endsWith('.json') ? 'application/json' : 'application/octet-stream';

interface ObjectInfo {
  key: string;
  etag: string;
}

const listAll = async (s3: S3Client, bucket: string, prefix: string): Promise<ObjectInfo[]> => {
  const out: ObjectInfo[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of res.Contents || []) {
      if (!o.Key || o.Key.endsWith('/')) continue;
      out.push({ key: o.Key, etag: o.ETag || '' });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
};

const invalidateModelPaths = async (): Promise<void> => {
  const distributionId = process.env.CDN_DISTRIBUTION_ID;
  if (!distributionId) {
    console.warn('CDN_DISTRIBUTION_ID not set — skipping CloudFront invalidation. Cached model may be stale for up to 30 days.');
    return;
  }
  const client = new CloudFrontClient({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: fromNodeProviderChain(),
  });
  const result = await client.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `cubecobra-model-${Date.now()}`,
        Paths: { Quantity: 1, Items: ['/model/*'] },
      },
    }),
  );
  console.log(`Invalidation ${result.Invalidation?.Id} submitted for /model/* (${result.Invalidation?.Status}).`);
};

const main = async (): Promise<void> => {
  console.log(
    `Mirroring s3://${sourceBucket}/${SOURCE_PREFIX} (${sourceRegion}) → s3://${destBucket}/${DEST_PREFIX} (${destRegion})`,
  );

  const [sourceObjects, destObjects] = await Promise.all([
    listAll(sourceS3, sourceBucket, SOURCE_PREFIX),
    listAll(destS3, destBucket, DEST_PREFIX),
  ]);

  if (sourceObjects.length === 0) {
    console.log('No model files in source — nothing to do.');
    return;
  }

  const destEtagByKey = new Map<string, string>();
  for (const o of destObjects) destEtagByKey.set(o.key, o.etag);

  let copied = 0;
  let skipped = 0;
  for (const src of sourceObjects) {
    const destEtag = destEtagByKey.get(src.key);
    if (destEtag && destEtag === src.etag) {
      skipped += 1;
      continue;
    }

    // CopySource must be URI-encoded but with '/' preserved as path separator.
    const copySource = `${sourceBucket}/${src.key.split('/').map(encodeURIComponent).join('/')}`;

    await destS3.send(
      new CopyObjectCommand({
        Bucket: destBucket,
        Key: src.key,
        CopySource: copySource,
        MetadataDirective: 'REPLACE',
        CacheControl: MONTH_CACHE,
        ContentType: contentTypeFor(src.key),
      }),
    );
    copied += 1;
    if (copied % 10 === 0) console.log(`  copied ${copied}…`);
  }

  console.log(`Done. Copied ${copied}, skipped ${skipped} (already up-to-date).`);

  if (copied > 0) {
    console.log('Model files changed — invalidating CloudFront /model/*');
    await invalidateModelPaths();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
