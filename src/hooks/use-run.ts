/**
 * The state of a run over the library files started from a dialog: whether it runs, its progress,
 * and the stop request, for `RunDialog` (`src/components/run-dialog.tsx`).
 * @module
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ScanProgress } from '@/shared/library';

/** What a dialog's run is, which decides the progress it takes and how it is stopped. */
export interface RunOptions {
  /**
   * True for a resynchronization: only the progress carrying a `step` is its own, and it is stopped
   * through `library.cancelResync()`. Otherwise a progress carrying a `step` (the resynchronization
   * started at launch, sent to every window) is ignored.
   */
  resync?: boolean;
  /** How to stop the run: `library.cancelRun()` by default (`cancelResync()` for a resynchronization). Resolves false when nothing was running. */
  cancel?: () => Promise<boolean>;
}

/** A dialog's run, from {@link useRun}. */
export interface Run {
  /** One of the dialog's steps is running. */
  running: boolean;
  /** A stop was asked and the step hasn't answered yet. */
  stopping: boolean;
  /** The latest progress of the step running (`library:scan-progress`), null before the first one and between steps. */
  progress: ScanProgress | null;
  /**
   * Runs `task` as one step: the progress pushed meanwhile is taken as its own, from `initial` when given
   * (a resynchronization already going when the dialog opened). Resolves or rejects as `task` does.
   */
  start: <T>(task: () => Promise<T>, initial?: ScanProgress | null) => Promise<T>;
  /** Asks the step running to stop (it stops before its next item and resolves with what was done). */
  stop: () => void;
}

/**
 * The run of a dialog: a progress is only taken while one of its steps runs (the channel also carries
 * the other runs of the window), and dropped when the step ends.
 */
export function useRun({ resync = false, cancel }: RunOptions = {}): Run {
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  // Whether a step runs, read by the listener; and whether the dialog is still there when a step ends.
  const armed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.skeudenn.library.onScanProgress((p) => {
      if (!armed.current || Boolean(p.step) !== resync) return;
      setProgress(p.phase === 'done' ? null : p);
    });
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [resync]);

  const start = useCallback(async <T>(task: () => Promise<T>, initial: ScanProgress | null = null): Promise<T> => {
    armed.current = true;
    setRunning(true);
    setStopping(false);
    setProgress(initial);
    try {
      return await task();
    } finally {
      armed.current = false;
      if (mounted.current) {
        setRunning(false);
        setStopping(false);
        setProgress(null);
      }
    }
  }, []);

  const stop = useCallback(() => {
    setStopping(true);
    const library = window.skeudenn.library;
    const request = cancel ?? (() => (resync ? library.cancelResync() : library.cancelRun()));
    // False when the step ended meanwhile: its answer is on its way.
    void request()
      .catch(() => false)
      .then((stopped) => {
        if (!stopped && mounted.current) setStopping(false);
      });
  }, [resync, cancel]);

  return { running, stopping, progress, start, stop };
}
