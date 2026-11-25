import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FailureDetail, RunDialog, RunReport } from '@/components/run-dialog';
import { Button } from '@/components/ui/button';
import { useRun } from '@/hooks/use-run';
import { formatFileSize } from '@/lib/utils';
import type { CleanupAnalysisResult, CleanupResult } from '@/shared/library';

type Analysis = Extract<CleanupAnalysisResult, { status: 'ok' }>;

/** Stops the cleanup's own step (the analysis doesn't take the run lock, so `cancelRun()` could stop another run). */
const cancelCleanup = () => window.tankobon.library.cancelCleanup();

/**
 * Cleans the books of the files that are not images, in the {@link RunDialog}: the analysis (`ids`, the
 * whole library when empty) starts with the "Analyser" button and shows what each kind of file would cost,
 * lets the user untick the kinds to keep, and only then rewrites the archives. Only CBZ can be rewritten;
 * the others are counted as skipped. Either run shows its progress and can be stopped: a stopped analysis
 * offers no partial plan, a stopped rewrite reports what was done until then.
 */
export function CleanupDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const { t } = useTranslation(['library', 'common']);
  const run = useRun({ cancel: cancelCleanup });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  // The analysis was stopped: the report says nothing was changed.
  const [analysisStopped, setAnalysisStopped] = useState(false);
  const [result, setResult] = useState<Extract<CleanupResult, { status: 'ok' }> | null>(null);
  // The kinds of files (extensions) the user wants to keep.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  // The kinds whose list of books is unfolded.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setError(null);
    try {
      const outcome = await run.start(() => window.tankobon.library.analyzeCleanup(ids));
      if (outcome.status === 'error') setError(outcome.message);
      else if (outcome.status === 'cancelled') setAnalysisStopped(true);
      else setAnalysis(outcome);
    } catch {
      setError(t('library:cleanupFailed'));
    }
  };

  const toRemove = analysis?.groups.filter((group) => !kept.has(group.extension)) ?? [];
  const filesToRemove = toRemove.reduce((sum, group) => sum + group.files, 0);
  const sizeToRemove = toRemove.reduce((sum, group) => sum + group.size, 0);

  const toggle = (extension: string) =>
    setKept((current) => {
      const next = new Set(current);
      if (!next.delete(extension)) next.add(extension);
      return next;
    });

  const unfold = (extension: string) =>
    setUnfolded((current) => {
      const next = new Set(current);
      if (!next.delete(extension)) next.add(extension);
      return next;
    });

  const apply = async () => {
    if (!analysis) return;
    setError(null);
    try {
      const outcome = await run.start(() => window.tankobon.library.applyCleanup(analysis.token, [...kept]));
      if (outcome.status === 'error') setError(outcome.message);
      else setResult(outcome);
    } catch {
      setError(t('library:cleanupFailed'));
    }
  };

  const finished = result !== null;
  const nothingToClean = analysis !== null && analysis.groups.length === 0;

  const stage = result ? 'report' : analysisStopped ? 'stopped' : analysis ? 'choice' : 'intro';

  return (
    <RunDialog
      title={t('library:cleanupTitle')}
      description={t('library:cleanupIntro')}
      run={run}
      progressLabel={analysis ? t('library:cleanupApplying') : t('library:cleanupAnalyzing')}
      error={error}
      onClose={onClose}
      actions={
        stage === 'intro' ? (
          <Button onClick={() => void analyze()}>{t('library:cleanupAnalyze')}</Button>
        ) : stage === 'choice' && !nothingToClean ? (
          <Button onClick={() => void apply()} disabled={filesToRemove === 0}>
            {t('library:cleanupApply', { count: filesToRemove, size: formatFileSize(sizeToRemove) })}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {stage === 'stopped' && <RunReport cancelled summary={[t('library:cleanupAnalysisStopped')]} />}

        {analysis && !finished && !nothingToClean && (
          <>
            <p className="text-sm">
              {t('library:cleanupSummary', { books: analysis.booksWithJunk, scanned: analysis.scanned })}
            </p>
            <ul className="flex flex-col gap-1.5">
              {analysis.groups.map((group) => (
                <li key={group.extension} className="rounded-md border">
                  <div className="flex items-start gap-2 p-2 text-sm">
                    <input
                      id={`cleanup-${group.extension}`}
                      type="checkbox"
                      className="mt-1"
                      checked={!kept.has(group.extension)}
                      onChange={() => toggle(group.extension)}
                    />
                    <label htmlFor={`cleanup-${group.extension}`} className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">
                        {group.extension === '' ? t('library:cleanupNoExtension') : group.extension}
                        <span className="font-normal text-muted-foreground">
                          {' · '}
                          {t('library:cleanupGroup', {
                            files: group.files,
                            books: group.books,
                            size: formatFileSize(group.size),
                          })}
                        </span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground" title={group.examples.join(', ')}>
                        {group.examples.join(', ')}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-expanded={unfolded.has(group.extension)}
                      aria-label={unfolded.has(group.extension) ? t('library:cleanupHideDetail') : t('library:cleanupShowDetail')}
                      title={unfolded.has(group.extension) ? t('library:cleanupHideDetail') : t('library:cleanupShowDetail')}
                      onClick={() => unfold(group.extension)}
                    >
                      {unfolded.has(group.extension) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </div>
                  {unfolded.has(group.extension) && (
                    <ul className="max-h-60 overflow-auto border-t px-3 py-2 text-xs">
                      {group.details.map((book, index) => (
                        <li key={`${book.name}-${index}`} className="py-0.5">
                          <span className="font-medium">{book.name}</span>
                          <span className="block break-all text-muted-foreground">{book.files.join(', ')}</span>
                        </li>
                      ))}
                      {group.books > group.details.length && (
                        <li className="pt-1 text-muted-foreground">
                          {t('library:cleanupDetailMore', { count: group.books - group.details.length })}
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{t('library:cleanupHint')}</p>
          </>
        )}

        {nothingToClean && !finished && <p className="text-sm">{t('library:cleanupNothing')}</p>}

        {analysis && !finished && (analysis.skipped > 0 || analysis.failed > 0) && (
          <>
            <p className="text-xs text-muted-foreground">
              {[
                analysis.skipped > 0 ? t('library:cleanupSkipped', { count: analysis.skipped }) : '',
                analysis.failed > 0 ? t('library:cleanupUnreadable', { count: analysis.failed }) : '',
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
            {analysis.failed > 0 && <FailureDetail failures={analysis.failures} total={analysis.failed} />}
          </>
        )}

        {result && (
          <RunReport
            cancelled={result.cancelled}
            summary={[
              t('library:cleanupDone', {
                books: result.cleaned,
                files: result.filesRemoved,
                size: formatFileSize(result.bytesFreed),
              }),
            ]}
            problems={result.failed > 0 ? [t('library:cleanupRewriteFailed', { count: result.failed })] : []}
            failures={result.failures}
            failureTotal={result.failed}
          />
        )}
      </div>
    </RunDialog>
  );
}
