import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Catalog files that are mirrored to the assets bucket and served through CloudFront
// at `${CDN_BASE_URL}/cards/<name>.<sha>.json`. The client resolves which hashed file
// to fetch via `cards/manifest.json` (re-fetched on a 60s TTL).
//
// Mirroring lives here rather than in the deploy pipeline because these files are
// rebuilt by the daily card update job, not on deploy.
const CDN_CATALOG_FILES = ['imagedict.json', 'full_names.json', 'cardtree.json', 'cardimages.json'];

const HASHED_PREFIX = 'cards/';
const MANIFEST_KEY = 'cards/manifest.json';
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
// Short TTL on the manifest so a fresh card update is visible within a minute
// without needing a CloudFront invalidation (which requires cross-region wiring
// to reach the us-east-1 distribution from the us-east-2 jobs task).
const MANIFEST_CACHE = 'public, max-age=60';

export interface CatalogManifest {
  generatedAt: string;
  files: Record<string, string>;
}

export const mirrorCatalogToCdn = async (sourceDir: string): Promise<CatalogManifest | null> => {
  const bucket = process.env.CUBECOBRA_ASSETS_BUCKET;
  if (!bucket) {
    console.log('CDN mirror: CUBECOBRA_ASSETS_BUCKET not set, skipping.');
    return null;
  }

  const region = process.env.CUBECOBRA_ASSETS_REGION || 'us-east-1';
  const client = new S3Client({
    endpoint: process.env.AWS_ENDPOINT || undefined,
    forcePathStyle: !!process.env.AWS_ENDPOINT,
    credentials: fromNodeProviderChain(),
    region,
  });

  console.log(`CDN mirror: target s3://${bucket}/ (${region})`);

  const files: Record<string, string> = {};
  for (const file of CDN_CATALOG_FILES) {
    const localPath = path.join(sourceDir, file);
    if (!fs.existsSync(localPath)) {
      console.warn(`CDN mirror: ${file} not present at ${localPath}, skipping.`);
      continue;
    }

    const body = fs.readFileSync(localPath);
    const sha = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
    const ext = path.extname(file);
    const stem = path.basename(file, ext);
    const hashedKey = `${HASHED_PREFIX}${stem}.${sha}${ext}`;

    console.log(`CDN mirror: ${file} → s3://${bucket}/${hashedKey} (${body.length} bytes)`);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: hashedKey,
        Body: body,
        CacheControl: IMMUTABLE_CACHE,
        ContentType: 'application/json',
      }),
    );
    files[file] = hashedKey;
  }

  const manifest: CatalogManifest = {
    generatedAt: new Date().toISOString(),
    files,
  };

  console.log(`CDN mirror: writing s3://${bucket}/${MANIFEST_KEY}`);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: MANIFEST_KEY,
      Body: JSON.stringify(manifest, null, 2),
      CacheControl: MANIFEST_CACHE,
      ContentType: 'application/json',
    }),
  );

  console.log(`CDN mirror: complete (${Object.keys(files).length} files).`);
  return manifest;
};
