import { useEffect, useState } from 'react';

// Card-catalog files mirrored to the assets bucket by `update_cards`. The
// manifest at `${cdnBaseUrl}/cards/manifest.json` maps each canonical filename
// to a content-hashed S3 key.
export type CatalogFile = 'imagedict.json' | 'full_names.json' | 'cardtree.json' | 'cardimages.json';

export interface CatalogManifest {
  generatedAt: string;
  files: Record<string, string>;
}

let manifestPromise: Promise<CatalogManifest> | null = null;

const getCdnBaseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  // Injected by server-side render (see render.ts → reactProps.cdnBaseUrl).
  return ((window as any).reactProps?.cdnBaseUrl as string | undefined) || '';
};

export const loadCatalogManifest = (): Promise<CatalogManifest> => {
  if (manifestPromise) return manifestPromise;
  const base = getCdnBaseUrl();
  if (!base) {
    manifestPromise = Promise.reject(new Error('cdnBaseUrl is not set'));
    return manifestPromise;
  }
  manifestPromise = fetch(`${base}/cards/manifest.json`).then((r) => {
    if (!r.ok) throw new Error(`card catalog manifest fetch failed: ${r.status}`);
    return r.json();
  });
  return manifestPromise;
};

export const getCardCatalogUrl = async (name: CatalogFile): Promise<string> => {
  const base = getCdnBaseUrl();
  // No CDN configured (dev/local) → the Express server serves these unhashed
  // under /cards/* directly from the private dir.
  if (!base) return `/cards/${name}`;
  const manifest = await loadCatalogManifest();
  const key = manifest.files[name];
  if (!key) throw new Error(`card catalog manifest missing entry for ${name}`);
  return `${base}/${key}`;
};

const useCardCatalogUrl = (name: CatalogFile): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCardCatalogUrl(name)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((err) => {
        console.error(`useCardCatalogUrl(${name})`, err);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);
  return url;
};

export default useCardCatalogUrl;
