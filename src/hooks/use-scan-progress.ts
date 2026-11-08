/**
 * The progress of the library scans (folder scan, resynchronization, organization), for the sidebar.
 * @module
 */
import { useEffect, useState } from 'react';

import type { ScanProgress } from '@/shared/library';

/**
 * The latest progress pushed by the main process while a scan runs, `null` when none does. Follows
 * every run of this window, and the resynchronization started at launch: a window that loads during it
 * starts from `library.resyncStatus()`, unless a progress arrived first.
 */
export function useScanProgress(): ScanProgress | null {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  useEffect(() => {
    let pushed = false;
    const unsubscribe = window.tankobon.library.onScanProgress((p) => {
      pushed = true;
      setProgress(p.phase === 'done' ? null : p);
    });
    void window.tankobon.library.resyncStatus().then((status) => {
      if (!pushed) setProgress(status);
    });
    return unsubscribe;
  }, []);
  return progress;
}
