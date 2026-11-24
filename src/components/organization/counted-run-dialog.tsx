import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RunDialog, RunReport } from '@/components/run-dialog';
import { Button } from '@/components/ui/button';
import { useRun } from '@/hooks/use-run';

/** A refusal of the main process (organization off, folder unreachable, another run going on), translated there. */
type Refusal = { status: 'error'; message: string };

/** What the intro says once the count is known, and whether there is anything to run. */
export interface CountedIntro {
  text: string;
  /** False when there is nothing to do: the text says so and no start button is offered. */
  ready: boolean;
}

/** The lines of the report, see `RunReport`. */
export interface CountedReport {
  summary: string[];
  problems?: string[];
}

/**
 * A one-step action of Paramètres › Organisation in the {@link RunDialog}: `count` is asked when the dialog
 * opens and `intro` turns its answer into the line under the description ("12 comics will be moved to …"),
 * then the `startLabel` button runs `start`, stoppable, and the dialog ends on the report `report` gives
 * (plus "stopped before the end" when the run was cancelled). A refusal of either call is shown instead.
 */
export function CountedRunDialog<C extends { status: 'ok' }, R extends { status: 'ok'; cancelled: boolean }>({
  title,
  description,
  count,
  intro,
  startLabel,
  progressLabel,
  start,
  report,
  onClose,
}: {
  title: string;
  description: string;
  count: () => Promise<C | Refusal>;
  intro: (count: C) => CountedIntro;
  startLabel: string;
  progressLabel: string;
  start: () => Promise<R | Refusal>;
  report: (result: R) => CountedReport;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  const run = useRun();
  const [counted, setCounted] = useState<CountedIntro | null>(null);
  const [result, setResult] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let open = true;
    count()
      .then((answer) => {
        if (!open) return;
        if (answer.status === 'error') setError((answer as Refusal).message);
        else setCounted(intro(answer as C));
      })
      .catch(() => open && setError(t('run.failed')));
    return () => {
      open = false;
    };
    // Counted once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = async () => {
    setError(null);
    try {
      const answer = await run.start(start);
      if (answer.status === 'error') setError((answer as Refusal).message);
      else setResult(answer as R);
    } catch {
      setError(t('run.failed'));
    }
  };

  const lines = result ? report(result) : null;

  return (
    <RunDialog
      title={title}
      description={description}
      run={run}
      progressLabel={progressLabel}
      error={error}
      onClose={onClose}
      actions={
        !result && counted?.ready ? (
          <Button onClick={() => void begin()}>{startLabel}</Button>
        ) : undefined
      }
    >
      {result && lines ? (
        <RunReport cancelled={result.cancelled} summary={lines.summary} problems={lines.problems} />
      ) : counted ? (
        <p className="text-sm">{counted.text}</p>
      ) : (
        !error && <p className="text-sm text-muted-foreground">{t('run.counting')}</p>
      )}
    </RunDialog>
  );
}
