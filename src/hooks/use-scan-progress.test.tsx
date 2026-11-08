// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScanProgress } from '@/shared/library';
import { useScanProgress } from './use-scan-progress';

const step = { index: 2, count: 4, name: 'covers', folder: '' } as const;
const atLaunch: ScanProgress = { phase: 'importing', processed: 3, total: 10, currentFile: '/bd/a.cbz', step };

/** A stand-in for `window.tankobon.library`: `push` plays the main process sending a progress. */
function installApi(status: Promise<ScanProgress | null>) {
  let listener: ((progress: ScanProgress) => void) | null = null;
  const library = {
    onScanProgress: vi.fn((next: (progress: ScanProgress) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    }),
    resyncStatus: vi.fn(() => status),
  };
  Object.assign(window, { tankobon: { library } });
  return { push: (progress: ScanProgress) => listener?.(progress), library };
}

afterEach(() => vi.restoreAllMocks());

describe('useScanProgress', () => {
  it('starts from the resynchronization already going when the window loads', async () => {
    installApi(Promise.resolve(atLaunch));
    const { result } = renderHook(() => useScanProgress());
    await waitFor(() => expect(result.current).toEqual(atLaunch));
  });

  it('keeps a progress pushed before the status answers', async () => {
    let answer: (status: ScanProgress | null) => void = () => undefined;
    const { push } = installApi(new Promise((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useScanProgress());
    const newer = { ...atLaunch, processed: 7 };

    act(() => push(newer));
    await act(async () => answer(atLaunch));

    expect(result.current).toEqual(newer);
  });

  it('is null once the run is done, and with nothing running', async () => {
    const { push } = installApi(Promise.resolve(null));
    const { result } = renderHook(() => useScanProgress());
    await waitFor(() => expect(result.current).toBeNull());

    act(() => push(atLaunch));
    expect(result.current).toEqual(atLaunch);
    act(() => push({ phase: 'done', processed: 0, total: 0, currentFile: '', step }));
    expect(result.current).toBeNull();
  });
});
