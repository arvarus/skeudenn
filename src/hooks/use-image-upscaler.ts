/**
 * On-device AI upscaling of reader pages.
 * @module
 */
import { useEffect, useState } from 'react';
import type Upscaler from 'upscaler';

import { createLruCache } from '@/lib/lru-cache';

// TensorFlow.js and the model are only pulled in (as a separate chunk) the first time
// upscaling actually runs, so opening the reader never pays for this unless it's used.
// A single instance is then reused for the app's lifetime — loading it is the slow part.
let sharedUpscaler: Promise<InstanceType<typeof Upscaler>> | null = null;

function getUpscaler() {
  sharedUpscaler ??= Promise.all([import('upscaler'), import('@upscalerjs/default-model')]).then(
    ([{ default: UpscalerCtor }, { default: defaultModel }]) =>
      // Point at the copy served locally (see vite.renderer.config.mts) instead of the
      // package's default CDN lookup, so this works fully offline.
      new UpscalerCtor({ model: { ...defaultModel, path: 'models/default-model/model.json' } }),
  );
  return sharedUpscaler;
}

// Small cache so flipping zoom on/off or going back to a page doesn't re-run inference. Entries are
// data URLs of upscaled pages (tens of megabytes each), hence the small capacity.
const MAX_CACHE_ENTRIES = 4;
const cache = createLruCache<string>(MAX_CACHE_ENTRIES);

/** State returned by {@link useImageUpscaler}. */
export interface ImageUpscalerResult {
  /** Data URL of the AI-upscaled image, or null while disabled/unavailable. */
  upscaledUrl: string | null;
  /** True while the model is loading or running on the current image. */
  isUpscaling: boolean;
  /** Set when the last attempt failed; the caller falls back to the original image either way. */
  error: string | null;
}

/**
 * Runs `src` through a local super-resolution model (ESRGAN via TensorFlow.js) when `enabled`.
 * `pageKey` names the page `src` shows (`<archive id>:<page index>`): a page's blob URL is made again
 * each time it is loaded, so only the page identifies a result worth keeping when the reader comes
 * back to it. Without one, the URL itself is the key.
 */
export function useImageUpscaler(src: string | null, enabled: boolean, pageKey: string | null = null): ImageUpscalerResult {
  const [upscaledUrl, setUpscaledUrl] = useState<string | null>(null);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!src || !enabled) {
      setUpscaledUrl(null);
      setIsUpscaling(false);
      setError(null);
      return;
    }

    const cacheKey = pageKey ?? src;
    const cached = cache.get(cacheKey);
    if (cached) {
      // A run for another page may have been in flight: its cleanup stopped it from clearing the
      // flag itself, so it is cleared here or the spinner would stay on.
      setUpscaledUrl(cached);
      setIsUpscaling(false);
      setError(null);
      return;
    }

    let cancelled = false;
    // Aborts the inference itself (not just the state update) when the page changes or the
    // option is unchecked, so a stale page doesn't keep the CPU busy.
    const controller = new AbortController();
    setUpscaledUrl(null);
    setIsUpscaling(true);
    setError(null);

    const image = new Image();
    image.src = src;
    Promise.all([image.decode(), getUpscaler()])
      // Tile the image so large comic pages don't blow up GPU/CPU memory in one pass.
      // TensorFlow.js runs on the renderer's main thread: `awaitNextFrame` makes it yield
      // to the browser between patches, so the UI stays responsive instead of freezing.
      .then(([, upscaler]) =>
        upscaler.upscale(image, {
          patchSize: 64,
          padding: 4,
          signal: controller.signal,
          awaitNextFrame: true,
        }),
      )
      .then((dataUrl) => {
        if (cancelled) return;
        cache.put(cacheKey, dataUrl);
        setUpscaledUrl(dataUrl);
      })
      .catch((err: unknown) => {
        // Best-effort enhancement: fall back to the original image on failure.
        console.error('Image upscaling failed:', err);
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setIsUpscaling(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [src, enabled, pageKey]);

  return { upscaledUrl, isUpscaling, error };
}
