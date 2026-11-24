import { useTranslation } from 'react-i18next';

import { Progress } from '@/components/ui/progress';
import type { ScanProgress } from '@/shared/library';

/**
 * A run's progress (a `library:scan-progress` push): the bar, the count of books done ("n / total",
 * once the total is known) and the file being handled, cut to one line with the full path as tooltip.
 * `fileNameOnly` shows only the file's name, so it stays readable in a narrow dialog.
 */
export function RunProgress({
  progress,
  label,
  fileNameOnly = false,
}: {
  progress: ScanProgress;
  label: string;
  fileNameOnly?: boolean;
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  const file = fileNameOnly ? (progress.currentFile.split(/[\\/]/).pop() ?? '') : progress.currentFile;
  return (
    <div className="flex flex-col gap-1">
      <Progress value={progress.processed} max={progress.total} label={label} />
      <p className="truncate text-xs text-muted-foreground" title={progress.currentFile}>
        {progress.total > 0 && t('runProgress', { processed: progress.processed, total: progress.total })}
        {file && `${progress.total > 0 ? ' · ' : ''}${file}`}
      </p>
    </div>
  );
}
