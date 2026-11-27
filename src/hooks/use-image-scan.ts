/**
 * The state of the background measure of the pages' sizes, for the status bar.
 * @module
 */
import { useEffect, useState } from 'react';

import type { ImageScanProgress } from '@/shared/library';

/** Progress of the background page-size scan, pushed by the main process; `running` is false when idle. */
export function useImageScan(): ImageScanProgress {
  const [progress, setProgress] = useState<ImageScanProgress>({ running: false, processed: 0, total: 0 });

  useEffect(() => {
    // Subscribed first: a push arriving before the status reply is the newer of the two.
    let live = false;
    const unsubscribe = window.skeudenn.library.onImageScanProgress((next) => {
      live = true;
      setProgress(next);
    });
    // The scan may have started before this window loaded.
    void window.skeudenn.library.imageScanStatus().then((current) => {
      if (!live) setProgress(current);
    });
    return unsubscribe;
  }, []);

  return progress;
}
