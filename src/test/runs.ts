// A test helper, not a test: Vitest only runs `*.test.*` files.
/**
 * Fakes for the tests of the dialogs that start a run over the library files: a promise the test
 * settles, and a `library.onScanProgress` the test pushes progress through.
 * @module
 */
import { act } from '@testing-library/react';
import { vi } from 'vitest';

import type { ScanProgress } from '@/shared/library';

/** A promise the test settles. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

/**
 * A fake `library.onScanProgress` that keeps every listener subscribed, and `push`, which sends a
 * progress to all of them inside `act()`.
 */
export function scanProgressChannel(): {
  onScanProgress: (listener: (progress: ScanProgress) => void) => () => void;
  push: (progress: ScanProgress) => void;
} {
  const listeners = new Set<(progress: ScanProgress) => void>();
  const onScanProgress = vi.fn((listener: (progress: ScanProgress) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const push = (progress: ScanProgress) =>
    act(() => {
      for (const listener of [...listeners]) listener(progress);
    });
  return { onScanProgress, push };
}
