/**
 * Fetching and decoding several pages at once, for the readers that show more than one.
 * @module
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { createRecoveryGuard } from '@/lib/recovery-guard';
import type { Size } from '@/lib/reader-zoom';

/** A page read and decoded: a `blob:` URL and the image's own size. */
export interface PageImage extends Size {
  /** `blob:` URL of the page's image, revoked when the page is no longer needed. */
  url: string;
}

/** What {@link usePageImages} returns: the pages that arrived, and those that could not be read. */
export interface PageImages {
  /** The pages decoded so far, by index. */
  images: ReadonlyMap<number, PageImage>;
  /** The wanted pages that could not be read. */
  failed: ReadonlySet<number>;
}

const EMPTY: PageImages = { images: new Map(), failed: new Set() };

/** Reads page `page` of the open archive `comicId` and decodes it, to know its size. */
async function readImage(comicId: string, page: number): Promise<PageImage> {
  const { data, mimeType } = await window.tankobon.comic.readPage(comicId, page);
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { url, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Keeps the pages `wanted` (what is on screen) and `prefetch` (what is likely next) of an opened
 * archive read and decoded, wanted ones first, and nothing else: a page that falls out of both lists
 * has its `blob:` URL revoked, so memory follows the reader's position, not the pages read.
 *
 * A wanted page that can't be read is reported in `failed`. The first such failure after a page was
 * read is taken for the decoder process having restarted and lost the archive: `onLost` is then
 * called with that page, so the caller can open the book again (once; a book that really can't be read
 * shows its error instead of reopening forever, see {@link createRecoveryGuard}). A prefetched page
 * that fails is simply tried again when it becomes wanted.
 *
 * The hook is meant for one archive: give it a `key` on the reader, so another book remounts it.
 */
export function usePageImages(
  comicId: string,
  wanted: readonly number[],
  prefetch: readonly number[],
  onLost: (page: number) => void,
): PageImages {
  const [snapshot, setSnapshot] = useState<PageImages>(EMPTY);
  const store = useRef(new Map<number, PageImage>());
  const failedPages = useRef(new Set<number>());
  const inflight = useRef(new Set<number>());
  const alive = useRef(false);
  const needed = useRef({ wanted: new Set<number>(), all: new Set<number>() });
  const [recovery] = useState(createRecoveryGuard);
  const onLostRef = useRef(onLost);
  useEffect(() => {
    onLostRef.current = onLost;
  });

  const publish = useCallback(() => {
    setSnapshot({ images: new Map(store.current), failed: new Set(failedPages.current) });
  }, []);

  useEffect(() => {
    alive.current = true;
    const pages = store.current;
    return () => {
      alive.current = false;
      for (const image of pages.values()) URL.revokeObjectURL(image.url);
      pages.clear();
    };
  }, []);

  const wantedKey = wanted.join(',');
  const prefetchKey = prefetch.join(',');
  useEffect(() => {
    const wantedSet = new Set(wanted);
    const all = new Set([...wanted, ...prefetch]);
    needed.current = { wanted: wantedSet, all };

    let changed = false;
    for (const [page, image] of store.current) {
      if (all.has(page)) continue;
      URL.revokeObjectURL(image.url);
      store.current.delete(page);
      changed = true;
    }
    for (const page of failedPages.current) {
      if (wantedSet.has(page)) continue;
      failedPages.current.delete(page);
      changed = true;
    }
    if (changed) publish();

    // Wanted pages first.
    for (const page of [...wanted, ...prefetch]) {
      if (store.current.has(page) || failedPages.current.has(page) || inflight.current.has(page)) continue;
      inflight.current.add(page);
      readImage(comicId, page)
        .then((image) => {
          inflight.current.delete(page);
          recovery.succeeded();
          if (!alive.current || !needed.current.all.has(page) || store.current.has(page)) {
            URL.revokeObjectURL(image.url);
            return;
          }
          store.current.set(page, image);
          publish();
        })
        .catch(() => {
          inflight.current.delete(page);
          if (!alive.current || !needed.current.wanted.has(page)) return;
          failedPages.current.add(page);
          publish();
          if (recovery.tryRecover()) onLostRef.current(page);
        });
    }
    // The keys stand for the lists, which are rebuilt on every render.
  }, [comicId, wantedKey, prefetchKey, publish, recovery]);

  return snapshot;
}
