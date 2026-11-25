import { ChevronDown, ChevronRight, CircleStop } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { RunProgress } from '@/components/run-progress';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { Run } from '@/hooks/use-run';
import { resyncStepLabel } from '@/lib/resync-step';
import type { ScanFailure } from '@/shared/library';

/** A foldable list of the files that failed, with the reason. `total` is the exact count: the list is cut at `MAX_REPORTED_FAILURES`. */
export function FailureDetail({ failures, total }: { failures: ScanFailure[]; total: number }) {
  const { t } = useTranslation(['common', 'library']);
  const [unfolded, setUnfolded] = useState(false);
  if (failures.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="flex items-center gap-1 self-start rounded text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={unfolded}
        onClick={() => setUnfolded(!unfolded)}
      >
        {unfolded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {unfolded ? t('common:run.hideDetail') : t('common:run.showDetail')}
      </button>
      {unfolded && (
        <ul className="flex max-h-60 flex-col gap-1.5 overflow-auto">
          {failures.map((failure) => (
            <li key={failure.path} className="rounded-md border p-2">
              <span className="block font-mono text-xs break-all">{failure.path}</span>
              <span className="block text-xs break-all text-muted-foreground">{failure.reason}</span>
            </li>
          ))}
          {total > failures.length && (
            <li className="text-xs text-muted-foreground">
              {t('library:scanFailuresTruncated', { shown: failures.length, count: total })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * The report a run's dialog ends on: "stopped before the end" when the run was `cancelled`, what was
 * done (`summary`), what went wrong (`problems`, in red) and the foldable list of the `failures`
 * (`failureTotal` being the exact count).
 */
export function RunReport({
  cancelled = false,
  summary,
  problems = [],
  failures = [],
  failureTotal = failures.length,
}: {
  cancelled?: boolean;
  summary: string[];
  problems?: string[];
  failures?: ScanFailure[];
  failureTotal?: number;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-col gap-2">
      {cancelled && <p className="text-sm font-medium">{t('run.stopped')}</p>}
      {summary.map((line) => (
        <p key={line} className="text-sm">
          {line}
        </p>
      ))}
      {problems.map((line) => (
        <p key={line} className="text-sm text-destructive">
          {line}
        </p>
      ))}
      <FailureDetail failures={failures} total={failureTotal} />
    </div>
  );
}

/**
 * The dialog every action of Paramètres › Organisation runs in, so they all work the same way: the
 * caller gives the content of the step it is on (`children`: the description of the task and what it
 * would handle, a choice between two runs, or the {@link RunReport}) and its buttons (`actions`, such as
 * the one that starts the run); the dialog adds the "Fermer" button. While `run` runs, the content and
 * the buttons give way to its progress (`progressLabel`, the step of a resynchronization, the gauge and
 * the file in hand) and an "Arrêter" button, and the dialog can't be closed: Escape, the backdrop and
 * the cross do nothing, so a run is never left going without its window.
 */
export function RunDialog({
  title,
  description,
  run,
  progressLabel,
  error,
  actions,
  onClose,
  children,
}: {
  title: string;
  /** What the action does, under the title. */
  description: string;
  run: Run;
  /** What is running ("Organizing…"), above the progress. */
  progressLabel: string;
  /** A refusal or a failure of the last step, in red under the content. */
  error?: string | null;
  /** The buttons of the step, shown when nothing runs (the dialog adds "Fermer"). */
  actions?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation('common');
  const { running, stopping, progress } = run;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && !running && onClose()}
      title={title}
      description={description}
      closeOnOutsideClick={!running}
    >
      <div className="flex min-h-0 flex-col gap-3 overflow-auto">
        {running ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">{progressLabel}</p>
            {progress?.step && <p className="text-sm">{resyncStepLabel(progress.step)}</p>}
            {progress && <RunProgress progress={progress} label={progressLabel} fileNameOnly />}
          </div>
        ) : (
          children
        )}
        {!running && error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex justify-end gap-2">
        {running ? (
          <Button variant="outline" onClick={run.stop} disabled={stopping}>
            <CircleStop />
            {stopping ? t('run.stopping') : t('run.stop')}
          </Button>
        ) : (
          <>
            <Button variant={actions ? 'outline' : 'default'} onClick={onClose}>
              {t('close')}
            </Button>
            {actions}
          </>
        )}
      </div>
    </Dialog>
  );
}
