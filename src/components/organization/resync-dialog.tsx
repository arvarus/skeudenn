import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfirm } from '@/components/confirm-dialog';
import type { ActionDialogProps } from '@/components/organization/simple-run-dialogs';
import { RunDialog, RunReport } from '@/components/run-dialog';
import { Button } from '@/components/ui/button';
import { useOrganizationOffer } from '@/hooks/use-organization-offer';
import { useRun } from '@/hooks/use-run';
import { useSettings } from '@/hooks/use-settings';
import type { ResyncResult, ScanFailure, ScanProgress } from '@/shared/library';

/** The end of a resynchronization, its own or one it followed (whose counts it never gets). */
interface Report {
  cancelled: boolean;
  summary: string[];
  problems: string[];
  failures: ScanFailure[];
  failed: number;
}

/** Resolves once the resynchronization in progress (started elsewhere) sends its final `done`, or is found over. */
function resyncEnd(): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = window.tankobon.library.onScanProgress((progress) => {
      if (progress.step && progress.phase === 'done') {
        unsubscribe();
        resolve();
      }
    });
    // It may have ended between the status that sent the dialog following it and this subscription.
    void window.tankobon.library
      .resyncStatus()
      .catch(() => null)
      .then((status) => {
        if (status) return;
        unsubscribe();
        resolve();
      });
  });
}

/**
 * "Resynchroniser" in the {@link RunDialog}: the steps of the run ("Étape 2/5 : …") over its gauge, a stop
 * through `library.cancelResync()`, then the counts, the files that couldn't be opened and, in `ask` mode, the
 * offer to move the comics added. When a resynchronization is already running as the dialog opens (the one
 * started at launch, or from the sidebar), the dialog follows it instead, stop included, and only says when it
 * is over (its result goes to whoever started it).
 */
export function ResyncDialog({ onClose }: ActionDialogProps) {
  const { t, i18n } = useTranslation('settings', { keyPrefix: 'library' });
  const { t: tCommon } = useTranslation('common');
  const { settings } = useSettings();
  const run = useRun({ resync: true });
  // Whether the user asked the run the dialog follows to stop, the only way to know it was cut short.
  const stopAsked = useRef(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const offerOrganization = useOrganizationOffer(confirm);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Follows a resynchronization already going (once, though StrictMode runs the effect twice).
  const checked = useRef(false);
  const { start } = run;
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    void window.tankobon.library
      .resyncStatus()
      .catch(() => null)
      .then((status: ScanProgress | null) => {
        if (!status) return;
        void start(resyncEnd, status).then(() =>
          setReport({ cancelled: stopAsked.current, summary: [t('resyncFollowedDone')], problems: [], failures: [], failed: 0 }),
        );
      });
  }, [start, t]);

  const begin = async () => {
    setError(null);
    let result: ResyncResult;
    try {
      result = await run.start(() => window.tankobon.library.resync());
    } catch {
      setError(tCommon('run.failed'));
      return;
    }
    if (result.status === 'error') {
      setError(result.message);
      return;
    }
    const summary = [t('resyncDone', { added: result.added, removed: result.removed })];
    if (result.nfoWritten > 0) summary.push(t('resyncNfoWritten', { count: result.nfoWritten }));
    if (result.coversExtracted > 0) summary.push(t('resyncCoversExtracted', { count: result.coversExtracted }));
    if (result.unreachable > 0) summary.push(t('resyncUnreachable', { count: result.unreachable }));
    const next: Report = {
      cancelled: result.cancelled,
      summary,
      problems: result.failed > 0 ? [t('resyncFailed', { count: result.failed })] : [],
      failures: result.failures,
      failed: result.failed,
    };
    setReport(next);
    const organized = await offerOrganization(result.organization);
    if (organized.length > 0) setReport({ ...next, summary: [...summary, ...organized] });
  };

  const lastResync = settings.lastResyncAt
    ? t('lastResync', { date: new Date(settings.lastResyncAt).toLocaleString(i18n.language) })
    : t('neverResynced');

  return (
    <>
      <RunDialog
        title={t('actions.resync.title')}
        description={t('resyncHint')}
        run={{
          ...run,
          stop: () => {
            stopAsked.current = true;
            run.stop();
          },
        }}
        progressLabel={t('resyncRunning')}
        error={error}
        onClose={onClose}
        actions={report ? undefined : <Button onClick={() => void begin()}>{tCommon('run.start')}</Button>}
      >
        {report ? (
          <RunReport
            cancelled={report.cancelled}
            summary={report.summary}
            problems={report.problems}
            failures={report.failures}
            failureTotal={report.failed}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{lastResync}</p>
        )}
      </RunDialog>
      {confirmDialog}
    </>
  );
}
