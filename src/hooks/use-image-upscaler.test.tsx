// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The upscale calls in flight, resolved or rejected by the tests when they choose. */
const runs: { resolve: (url: string) => void; reject: (error: unknown) => void; signal: AbortSignal }[] = [];

vi.mock('upscaler', () => ({
  default: class {
    upscale(_image: unknown, options: { signal: AbortSignal }) {
      return new Promise<string>((resolve, reject) => runs.push({ resolve, reject, signal: options.signal }));
    }
  },
}));
vi.mock('@upscalerjs/default-model', () => ({ default: {} }));

import { useImageUpscaler } from './use-image-upscaler';

beforeEach(() => {
  runs.length = 0;
  HTMLImageElement.prototype.decode = vi.fn(async () => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('useImageUpscaler', () => {
  it('clears the spinner when going back to a cached page while another page is being upscaled', async () => {
    const { result, rerender } = renderHook(({ src, key }) => useImageUpscaler(src, true, key), {
      initialProps: { src: 'blob:a', key: 'book:0' },
    });
    await waitFor(() => expect(runs).toHaveLength(1));
    await act(async () => runs[0].resolve('data:upscaled-a'));
    await waitFor(() => expect(result.current.upscaledUrl).toBe('data:upscaled-a'));
    expect(result.current.isUpscaling).toBe(false);

    // Next page: a run starts and is left in flight.
    rerender({ src: 'blob:b', key: 'book:1' });
    await waitFor(() => expect(runs).toHaveLength(2));
    expect(result.current.isUpscaling).toBe(true);

    // Back to the first page, found in the cache (its blob URL is a new one).
    rerender({ src: 'blob:a2', key: 'book:0' });
    expect(result.current.upscaledUrl).toBe('data:upscaled-a');
    expect(result.current.isUpscaling).toBe(false);
    expect(runs[1].signal.aborted).toBe(true);

    // The aborted run settling afterwards changes nothing.
    await act(async () => runs[1].reject(new Error('aborted')));
    expect(result.current.isUpscaling).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.upscaledUrl).toBe('data:upscaled-a');
  });
});
