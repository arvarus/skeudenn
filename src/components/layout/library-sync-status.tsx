import { CircleStop, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfirm } from '@/components/confirm-dialog';
import { Progress } from '@/components/ui/progress';
import { useOrganizationOffer } from '@/hooks/use-organization-offer';
import { useScanProgress } from '@/hooks/use-scan-progress';
import { useSettings } from '@/hooks/use-settings';
import { resyncStepLabel } from '@/lib/resync-step';
import { cn } from '@/lib/utils';
import type { OrganizationOutcome } from '@/shared/library';

// One request at a time, shared: React mounts a component twice in development, and the outcome is handed
// out once, so both mounts await the same answer and only the one still mounted follows up on it.
let taking: Promise<OrganizationOutcome | null> | null = null;
function takeStartupOrganization(): Promise<OrganizationOutcome | null> {
  taking ??= window.tankobon.library.takeStartupOrganization().finally(() => {
    taking = null;
  });
  return taking;
}

/**
 * The state of the library synchronization at the bottom of the sidebar, on every page: the
 * progress of the run in course (resynchronization, folder scan or organization, wherever it was
 * started; a resynchronization says which of its steps it is on), else the date of the last
 * resynchronization. Its icon starts a resynchronization, and a stop button ends the one running. It
 * also follows up on the organization after the resynchronization started at launch (the move it offers).
 * The rail keeps only the icon, which stops a running resynchronization.
 */
export function LibrarySyncStatus({ collapsed }: { collapsed: boolean }) {
  const { t, i18n } = useTranslation('nav');
  const { settings } = useSettings();
  const progress = useScanProgress();
  const { confirm, dialog } = useConfirm();
  const offerOrganization = useOrganizationOffer(confirm);
  // From the click until the run answers: its first progress may take a moment to arrive.
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  // What the last run started here ended with (stopped, an error, what the organization did), until the next one.
  const [outcome, setOutcome] = useState<{ message: string; error?: boolean } | null>(null);

  // The resynchronization started at launch: nobody awaited it, so what the organization did, or offers
  // to move (`ask` mode), is taken here, when it is announced or when this window starts after it.
  useEffect(() => {
    let mounted = true;
    const follow = async () => {
      const organization = await takeStartupOrganization();
      if (!mounted || !organization) return;
      const parts = await offerOrganization(organization);
      if (mounted && parts.length > 0) setOutcome({ message: parts.join(' · ') });
    };
    void follow();
    const unsubscribe = window.tankobon.library.onStartupOrganization(() => void follow());
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [offerOrganization]);

  const running = progress !== null || starting;
  const resyncing = progress?.step !== undefined || starting;
  const known = progress !== null && progress.phase === 'importing' && progress.total > 0;
  // A run started elsewhere (Paramètres › Organisation) and stopped from here ends without `start()`:
  // React's "adjust state while rendering" pattern drops the stopping state once nothing runs.
  if (stopping && !running) setStopping(false);

  const start = async () => {
    setOutcome(null);
    setStarting(true);
    const result = await window.tankobon.library.resync();
    setStarting(false);
    setStopping(false);
    if (result.status === 'error') {
      setOutcome({ message: result.message, error: true });
      return;
    }
    if (result.cancelled) {
      setOutcome({ message: t('syncStopped') });
      return;
    }
    const parts = await offerOrganization(result.organization);
    if (parts.length > 0) setOutcome({ message: parts.join(' · ') });
  };

  const stop = async () => {
    setStopping(true);
    if (!(await window.tankobon.library.cancelResync())) setStopping(false);
  };

  const runningText = stopping
    ? t('syncStopping')
    : progress?.step
      ? resyncStepLabel(progress.step)
      : known
        ? t('syncProgress', { processed: progress.processed, total: progress.total })
        : t('syncRunning');
  const text = running
    ? runningText
    : (outcome?.message ??
      (settings.lastResyncAt
        ? t('syncLast', { date: new Date(settings.lastResyncAt).toLocaleString(i18n.language) })
        : t('syncNever')));

  const iconButtonClass = 'rounded-sm p-0.5 hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none';

  if (collapsed) {
    return (
      <div role="status" className="flex justify-center text-muted-foreground">
        {resyncing ? (
          <button
            type="button"
            className={iconButtonClass}
            title={`${text} · ${t('syncStop')}`}
            aria-label={t('syncStop')}
            disabled={stopping}
            onClick={() => void stop()}
          >
            <RefreshCw className="size-4 animate-spin" />
          </button>
        ) : (
          <button
            type="button"
            className={iconButtonClass}
            title={running ? text : t('syncStart')}
            aria-label={running ? text : t('syncStart')}
            disabled={running}
            onClick={() => void start()}
          >
            <RefreshCw className={cn('size-4', running && 'animate-spin')} />
          </button>
        )}
        {dialog}
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          className={cn(iconButtonClass, 'shrink-0')}
          title={running ? undefined : t('syncStart')}
          aria-label={t('syncStart')}
          disabled={running}
          onClick={() => void start()}
        >
          <RefreshCw className={cn('size-3.5', running && 'animate-spin')} />
        </button>
        <span className={cn('min-w-0 flex-1 break-words', !running && outcome?.error && 'text-destructive')}>{text}</span>
        {resyncing && (
          <button
            type="button"
            className={cn(iconButtonClass, 'shrink-0')}
            title={t('syncStop')}
            aria-label={t('syncStop')}
            disabled={stopping}
            onClick={() => void stop()}
          >
            <CircleStop className="size-3.5" />
          </button>
        )}
      </span>
      {known && !stopping && (
        <Progress value={progress.processed} max={progress.total} label={runningText} />
      )}
      {known && !stopping && progress.step && (
        <span className="tabular-nums">{t('syncCount', { processed: progress.processed, total: progress.total })}</span>
      )}
      {dialog}
    </div>
  );
}
