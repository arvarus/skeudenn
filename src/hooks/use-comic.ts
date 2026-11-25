/**
 * Single-page reader state.
 * @module
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { createRecoveryGuard } from '@/lib/recovery-guard';
import type { ComicInfo } from '@/shared/comic';
import { errorText } from '@/shared/errors';

interface ComicState {
  comic: ComicInfo | null;
  page: number;
  /** Blob URL of the current page, null while loading. */
  pageUrl: string | null;
  /**
   * `<archive id>:<page index>` of the page `pageUrl` shows. `page` moves on before the new image
   * has arrived, so it can't name the image on screen; this does. Null while there is none.
   */
  pageKey: string | null;
  error: string | null;
  loading: boolean;
}

const initialState: ComicState = { comic: null, page: 0, pageUrl: null, pageKey: null, error: null, loading: false };

/** Options of {@link useComic}. */
export interface UseComicOptions {
  /**
   * Whether the hook fetches the current page's image (default `true`). The continuous reader
   * loads its own pages, so it passes `false` to avoid a redundant render of the resume page.
   */
  loadPages?: boolean;
}

/** Owns the currently opened comic: file picking, page loading, cleanup. */
export function useComic({ loadPages = true }: UseComicOptions = {}) {
  const [state, setState] = useState<ComicState>(initialState);
  const currentUrl = useRef<string | null>(null);
  const mounted = useRef(false);
  const openRequest = useRef(0);
  // What was opened last, to open it again if the decoder process lost the archive.
  const lastRef = useRef<string | null>(null);
  const [recovery] = useState(createRecoveryGuard);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const revokeCurrentUrl = () => {
    if (currentUrl.current) {
      URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = null;
    }
  };

  const close = useCallback(async () => {
    revokeCurrentUrl();
    const id = state.comic?.id;
    setState(initialState);
    if (id) {
      await window.tankobon.comic.close(id);
    }
  }, [state.comic?.id]);

  const openFile = useCallback(async (ref: string, startPage?: number) => {
    lastRef.current = ref;
    const request = ++openRequest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await window.tankobon.comic.open(ref);
      const stale = !mounted.current || request !== openRequest.current;
      if (result.status === 'error') {
        if (!stale) setState((s) => ({ ...s, loading: false, error: result.message }));
        return;
      }
      const { comic } = result;
      if (stale) {
        // The reader was left or another open started meanwhile: nobody will use this archive.
        void window.tankobon.comic.close(comic.id);
        return;
      }
      revokeCurrentUrl();
      // Reopening keeps the reader where it was; a first opening resumes where the library says.
      const opened = startPage === undefined ? comic : { ...comic, resumePage: startPage };
      setState({ comic: opened, page: opened.resumePage, pageUrl: null, pageKey: null, error: null, loading: loadPages });
    } catch (error) {
      if (!mounted.current || request !== openRequest.current) return;
      setState((s) => ({ ...s, loading: false, error: errorText(error) }));
    }
  }, [loadPages]);

  const pickAndOpen = useCallback(async () => {
    const token = await window.tankobon.comic.pickFile(false);
    if (token) {
      await openFile(token);
    }
  }, [openFile]);

  /** Opens the book again, at `page` (the decoder process may have restarted and lost the archive). */
  const reopen = useCallback(
    (page: number) => {
      if (lastRef.current) void openFile(lastRef.current, page);
    },
    [openFile],
  );

  const goTo = useCallback((page: number) => {
    setState((s) => {
      if (!s.comic) return s;
      const clamped = Math.max(0, Math.min(page, s.comic.pageCount - 1));
      return clamped === s.page ? s : { ...s, page: clamped, loading: true };
    });
  }, []);

  // Load the page image whenever the comic or page index changes.
  const comicId = state.comic?.id;
  const page = state.page;
  useEffect(() => {
    if (!comicId || !loadPages) return;
    let cancelled = false;

    window.tankobon.comic
      .readPage(comicId, page)
      .then(({ data, mimeType }) => {
        if (cancelled) return;
        recovery.succeeded();
        revokeCurrentUrl();
        const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
        currentUrl.current = url;
        setState((s) => ({ ...s, pageUrl: url, pageKey: `${comicId}:${page}`, loading: false }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Most likely the decoder process restarted and forgot the archive: open the book again, once.
        if (recovery.tryRecover() && lastRef.current) {
          void openFile(lastRef.current, page);
          return;
        }
        setState((s) => ({ ...s, loading: false, error: errorText(error) }));
      });

    return () => {
      cancelled = true;
    };
  }, [comicId, page, loadPages, openFile, recovery]);

  // Persist reading progress to the library database so it can be resumed later.
  const libraryId = state.comic?.libraryId;
  useEffect(() => {
    if (!libraryId) return;
    void window.tankobon.library.updateProgress(libraryId, page);
  }, [libraryId, page]);

  // Release the archive and blob URL on unmount.
  useEffect(() => {
    return () => {
      revokeCurrentUrl();
      if (comicId) {
        void window.tankobon.comic.close(comicId);
      }
    };
  }, [comicId]);

  return {
    ...state,
    /** Shows the native file picker, then opens the chosen file (nothing happens if cancelled). */
    pickAndOpen,
    /** Opens a comic at its saved page; on failure, sets `error` and keeps the previous comic. */
    openFile,
    /** Opens the current book again at a page (0-based), e.g. after the decoder process lost the archive. */
    reopen,
    /** Closes the current comic and resets the state. */
    close,
    /** Goes to a page (0-based), clamped to the comic's range. */
    goTo,
    /** Page index + 1, regardless of the reading direction. */
    next: () => goTo(state.page + 1),
    /** Page index - 1, regardless of the reading direction. */
    prev: () => goTo(state.page - 1),
  };
}
