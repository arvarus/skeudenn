import { CircleStop, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { ScanProgress } from '@/shared/library';

/**
 * The folder scan's progress (with the folder it is on when several are being added): a button that stops the run while it goes (`library.cancelRun()`: the
 * scan stops between two files and keeps what it added), and a close button once it is done.
 */
export function ScanProgressBar({ progress, onClose }: { progress: ScanProgress; onClose: () => void }) {
  // The walk reports no total yet, so the bar stays empty until the first file is opened.
  const scanning = progress.phase === 'scanning';
  const done = progress.phase === 'done';
  const { t } = useTranslation(['library', 'common']);
  const [stopping, setStopping] = useState(false);
  // A run that ended answered the stop: the next one starts with a working button.
  if (done && stopping) setStopping(false);

  const stop = () => {
    setStopping(true);
    // False when nothing holds the lock any more (the run just ended): nothing to wait for.
    void window.tankobon.library
      .cancelRun()
      .then((asked) => {
        if (!asked) setStopping(false);
      })
      .catch(() => setStopping(false));
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>
          {progress.folder && `${t('scanFolderLabel', { ...progress.folder })} · `}
          {scanning ? t('scanning') : `${progress.processed} / ${progress.total}`}
        </span>
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={progress.currentFile}>
          {progress.currentFile}
        </span>
        {done ? (
          <Button variant="ghost" size="icon" aria-label={t('scanClose')} title={t('scanClose')} onClick={onClose}>
            <X />
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={stop} disabled={stopping}>
            <CircleStop />
            {stopping ? t('common:run.stopping') : t('common:run.stop')}
          </Button>
        )}
      </div>
      <Progress value={progress.processed} max={progress.total} label={t('scanProgress')} />
    </div>
  );
}
