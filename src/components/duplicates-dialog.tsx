import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RunDialog, RunReport } from '@/components/run-dialog';
import { Button } from '@/components/ui/button';
import { useRun } from '@/hooks/use-run';
import { duplicateGroupKey, duplicateGroups, rememberIgnoredGroups } from '@/lib/library-editions';
import { useSettings } from '@/hooks/use-settings';
import { comicFormat } from '@/shared/comic';
import { MAX_IGNORED_DUPLICATES } from '@/shared/settings';
import { formatFileSize } from '@/lib/utils';
import type { LibraryEntry } from '@/shared/library';

/** Marks a group where nothing is removed. */
const KEEP_ALL = '';

/** The end of the dialog: what was removed or remembered, and what went wrong. */
interface Report {
  cancelled: boolean;
  summary: string[];
  problems: string[];
}

/**
 * Finds the books held as several files of the same format, in the {@link RunDialog}: "Rechercher" looks
 * through `entries` (`duplicateGroups()`), then the user picks, for each group, the file to keep, and the
 * others leave the library (`library.removeMany()`, with its progress and a stop). A tick box also moves
 * their files to the system trash (off by default). The groups are fixed when found, so removing entries
 * doesn't reshuffle what is on screen. A group left on "Keep all" is remembered (`ignoredDuplicates`) and
 * not offered again, unless the user ticks "show the groups already kept".
 */
export function DuplicatesDialog({ entries, onClose }: { entries: readonly LibraryEntry[]; onClose: () => void }) {
  const { t } = useTranslation(['library', 'settings', 'common']);
  const { settings, update } = useSettings();
  const run = useRun();
  const [groups, setGroups] = useState<LibraryEntry[][] | null>(null);
  // Fixed when the groups are found, like them: keeping a group must not make it vanish under the cursor.
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const [showIgnored, setShowIgnored] = useState(false);
  // The file kept in each group (its first by default), KEEP_ALL to leave the group alone (the default
  // for a group already kept before).
  const [kept, setKept] = useState<string[]>([]);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isIgnored = (group: LibraryEntry[]) => ignored.has(duplicateGroupKey(group));
  const found = groups ?? [];
  const ignoredCount = found.filter(isIgnored).length;
  const shown = found.map((group, index) => ({ group, index })).filter(({ group }) => showIgnored || !isIgnored(group));
  const toRemove = shown.flatMap(({ group, index }) =>
    kept[index] === KEEP_ALL ? [] : group.filter((entry) => entry.id !== kept[index]),
  );
  const newlyKept = shown.filter(({ group, index }) => kept[index] === KEEP_ALL && !isIgnored(group));

  const search = async () => {
    const result = await run.start(async () => duplicateGroups(entries));
    if (result.length === 0) {
      setReport({ cancelled: false, summary: [t('library:duplicatesNone')], problems: [] });
      return;
    }
    const before = new Set(settings.ignoredDuplicates);
    setIgnored(before);
    setKept(result.map((group) => (before.has(duplicateGroupKey(group)) ? KEEP_ALL : group[0].id)));
    setGroups(result);
  };

  const apply = async () => {
    setError(null);
    const remembered: string[] = [];
    if (newlyKept.length > 0) {
      update(
        'ignoredDuplicates',
        rememberIgnoredGroups(
          settings.ignoredDuplicates,
          newlyKept.map(({ group }) => group),
          MAX_IGNORED_DUPLICATES,
        ),
      );
      remembered.push(t('library:duplicatesRemembered', { count: newlyKept.length }));
    }
    if (toRemove.length === 0) {
      setReport({ cancelled: false, summary: remembered, problems: [] });
      return;
    }
    try {
      const result = await run.start(() =>
        window.skeudenn.library.removeMany(
          toRemove.map((entry) => entry.id),
          deleteFiles,
        ),
      );
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      setReport({
        cancelled: result.cancelled,
        summary: [t('library:duplicatesRemoved', { count: result.removed }), ...remembered],
        problems: result.filesFailed > 0 ? [t('library:duplicatesFilesFailed', { count: result.filesFailed })] : [],
      });
    } catch {
      setError(t('library:duplicatesFailed'));
    }
  };

  const choosing = groups !== null && !report;

  return (
    <RunDialog
      title={t('library:duplicatesTitle')}
      description={t('settings:library.duplicatesHint')}
      run={run}
      progressLabel={groups ? t('library:duplicatesRemoving') : t('library:duplicatesSearching')}
      error={error}
      onClose={onClose}
      actions={
        report ? undefined : groups === null ? (
          <Button onClick={() => void search()}>{t('library:duplicatesSearch')}</Button>
        ) : (
          <Button onClick={() => void apply()} disabled={toRemove.length === 0 && newlyKept.length === 0}>
            {toRemove.length > 0 ? t('library:duplicatesApply', { count: toRemove.length }) : t('library:duplicatesRemember')}
          </Button>
        )
      }
    >
      {report && <RunReport cancelled={report.cancelled} summary={report.summary} problems={report.problems} />}
      {choosing && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">{t('library:duplicatesIntro', { count: shown.length })}</p>
          {shown.length === 0 && <p className="text-sm text-muted-foreground">{t('library:duplicatesAllKept')}</p>}
          {shown.map(({ group, index }) => (
            <fieldset key={group[0].id} className="flex flex-col gap-1.5 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">
                {group[0].title} · {comicFormat(group[0].path)?.toUpperCase()}
              </legend>
              {group.map((entry) => (
                <label key={entry.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`keep-${index}`}
                    className="mt-1"
                    checked={kept[index] === entry.id}
                    onChange={() => setKept(kept.map((id, i) => (i === index ? entry.id : id)))}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate" title={entry.path}>
                      {entry.path}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('library:duplicateDetails', {
                        pages: entry.pageCount,
                        size: formatFileSize(entry.fileSize),
                      })}
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="radio"
                  name={`keep-${index}`}
                  checked={kept[index] === KEEP_ALL}
                  onChange={() => setKept(kept.map((id, i) => (i === index ? KEEP_ALL : id)))}
                />
                {t('library:duplicatesKeepAll')}
              </label>
            </fieldset>
          ))}
          {ignoredCount > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showIgnored} onChange={(event) => setShowIgnored(event.target.checked)} />
              {t('library:duplicatesShowKept', { count: ignoredCount })}
            </label>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deleteFiles} onChange={(event) => setDeleteFiles(event.target.checked)} />
            {t('library:duplicatesDeleteFiles')}
          </label>
        </div>
      )}
    </RunDialog>
  );
}
