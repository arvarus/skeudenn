// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComicInfo, OpenComicResult } from '@/shared/comic';
import { useComic } from './use-comic';

function comicInfo(id: string, resumePage = 0): ComicInfo {
  return { id, path: '/bd/a.cbz', title: 'A', pageCount: 10, fileCount: 10, libraryId: 'lib-1', resumePage };
}

/** A stand-in for `window.tankobon`: opening hands out a new archive id each time. */
function installApi(readPage: (id: string, page: number) => Promise<{ data: Uint8Array; mimeType: string }>) {
  let opened = 0;
  const open = vi.fn(async (): Promise<OpenComicResult> => ({ status: 'ok', comic: comicInfo(`archive-${++opened}`, 3) }));
  const api = {
    comic: { open, readPage: vi.fn(readPage), close: vi.fn(async () => undefined), pickFile: vi.fn() },
    library: { updateProgress: vi.fn(async () => undefined) },
  };
  Object.assign(window, { tankobon: api });
  return api;
}

const page = { data: new Uint8Array([1]), mimeType: 'image/png' };

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:page');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('useComic', () => {
  it('resumes at the saved page on a first opening', async () => {
    const api = installApi(async () => page);
    const { result } = renderHook(() => useComic());
    await act(() => result.current.openFile('lib-1'));
    await waitFor(() => expect(result.current.pageUrl).toBe('blob:page'));
    expect(result.current.page).toBe(3);
    expect(api.comic.open).toHaveBeenCalledTimes(1);
  });

  it('opens the book again once, at the current page, when the decoder forgot the archive', async () => {
    const api = installApi(async (id) => {
      if (id === 'archive-1') throw new Error('Unknown archive');
      return page;
    });
    const { result } = renderHook(() => useComic());
    await act(() => result.current.openFile('lib-1'));

    await waitFor(() => expect(result.current.comic?.id).toBe('archive-2'));
    await waitFor(() => expect(result.current.pageUrl).toBe('blob:page'));
    expect(api.comic.open).toHaveBeenCalledTimes(2);
    expect(result.current.page).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it('shows the error instead of reopening forever when the book really cannot be read', async () => {
    const api = installApi(async () => {
      throw new Error('broken page');
    });
    const { result } = renderHook(() => useComic());
    await act(() => result.current.openFile('lib-1'));

    await waitFor(() => expect(result.current.error).toBe('broken page'));
    expect(api.comic.open).toHaveBeenCalledTimes(2);
  });

  it('reopen() keeps the page it is given instead of the saved one', async () => {
    const api = installApi(async () => page);
    const { result } = renderHook(() => useComic({ loadPages: false }));
    await act(() => result.current.openFile('lib-1'));
    act(() => result.current.reopen(7));

    await waitFor(() => expect(result.current.comic?.id).toBe('archive-2'));
    expect(result.current.comic?.resumePage).toBe(7);
    expect(api.comic.open).toHaveBeenCalledTimes(2);
  });

  it('hands a position over to the page-by-page reader: goTo() moves the page without fetching it, dropping the old image', async () => {
    const api = installApi(async () => page);
    const { result, rerender } = renderHook(({ loadPages }) => useComic({ loadPages }), { initialProps: { loadPages: true } });
    await act(() => result.current.openFile('lib-1'));
    await waitFor(() => expect(result.current.pageUrl).toBe('blob:page'));

    // A reader that loads its own pages (continuous, book) is on screen.
    rerender({ loadPages: false });
    api.comic.readPage.mockClear();
    act(() => result.current.goTo(8));
    expect(result.current.page).toBe(8);
    expect(result.current.pageUrl).toBeNull();
    expect(api.comic.readPage).not.toHaveBeenCalled();

    // Back to page by page: the page handed over is the one fetched.
    rerender({ loadPages: true });
    await waitFor(() => expect(result.current.pageUrl).toBe('blob:page'));
    expect(api.comic.readPage).toHaveBeenCalledWith('archive-1', 8);
  });
});
