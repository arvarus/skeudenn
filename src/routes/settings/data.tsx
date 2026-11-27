import { createFileRoute } from '@tanstack/react-router';
import { Database, DatabaseBackup, Download, Eraser, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSettings } from '@/hooks/use-settings';
import { MAX_BACKUP_INTERVAL_DAYS, MAX_BACKUP_KEEP } from '@/shared/settings';

import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useLibrary } from '@/hooks/use-library';
import { useReadingLists } from '@/hooks/use-reading-lists';
import { cn, formatFileSize } from '@/lib/utils';
import type { BackupInfo, BackupList, DatabaseLocation } from '@/shared/data';

export const Route = createFileRoute('/settings/data')({
  component: DataSettingsPage,
});

function DataSettingsPage() {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const { settings, update } = useSettings();
  const library = useLibrary();
  const readingLists = useReadingLists();
  const [dataStatus, setDataStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [dbLocation, setDbLocation] = useState<DatabaseLocation | null>(null);
  // A location change only takes effect on the next start, so the app has to offer a restart.
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  // What is typed in the file name field; null while it shows the current name.
  const [fileNameDraft, setFileNameDraft] = useState<string | null>(null);
  // What clearing would delete, shown in the confirmation dialog; null while it's closed.
  const [clearCounts, setClearCounts] = useState<{ entries: number; readingLists: number } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearStatus, setClearStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<{ message: string; error?: boolean } | null>(null);

  const [backups, setBackups] = useState<BackupList | null>(null);
  const [backupStatus, setBackupStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  // The copy the user is about to restore, shown in the confirmation dialog.
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);
  const formatDate = (iso: string) => new Date(iso).toLocaleString(i18n.language);
  // Reloaded when a copy is made, including a scheduled one (its date lands in the settings).
  const lastBackupAt = settings?.lastBackupAt;
  useEffect(() => {
    let cancelled = false;
    void window.skeudenn.database.listBackups().then((list) => {
      if (!cancelled) setBackups(list);
    });
    return () => {
      cancelled = true;
    };
  }, [lastBackupAt]);

  const backupNow = async () => {
    setBackupBusy(true);
    try {
      const result = await window.skeudenn.database.createBackup();
      setBackupStatus(
        result.status === 'error' ? { message: result.message, error: true } : { message: t('data.backupCreated') },
      );
      setBackups(await window.skeudenn.database.listBackups());
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreBackup = async () => {
    if (!restoring) return;
    const result = await window.skeudenn.database.restoreBackup(restoring.name);
    setRestoring(null);
    if (result.status === 'error') {
      setBackupStatus({ message: result.message, error: true });
      return;
    }
    await window.skeudenn.database.relaunch();
  };

  const cancelRestore = async () => {
    await window.skeudenn.database.cancelRestore();
    setBackups(await window.skeudenn.database.listBackups());
  };

  const pendingBackup = backups?.backups.find((backup) => backup.name === backups.pendingRestore);

  useEffect(() => {
    let cancelled = false;
    void window.skeudenn.database.getLocation().then((location) => {
      if (!cancelled) setDbLocation(location);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseDatabaseLocation = async () => {
    const result = await window.skeudenn.database.chooseLocation();
    if (result.status === 'cancelled') {
      return;
    }
    if (result.status === 'error') {
      setDbError(result.message);
      return;
    }
    setDbError(null);
    setDbLocation(result.location);
    setRestartNeeded(true);
  };

  const applyFileName = async (fileName: string | null) => {
    const result = await window.skeudenn.database.setFileName(fileName);
    if (result.status === 'error') {
      setDbError(result.message);
      return;
    }
    if (result.status === 'changed') {
      setDbError(null);
      setDbLocation(result.location);
      setFileNameDraft(null);
      setRestartNeeded(true);
    }
  };

  const resetDatabaseLocation = async () => {
    setDbError(null);
    setDbLocation(await window.skeudenn.database.resetLocation());
    setRestartNeeded(true);
  };

  const exportData = async () => {
    const result = await window.skeudenn.data.export();
    if (result.status === 'cancelled') {
      setDataStatus(null);
      return;
    }
    if (result.status === 'error') {
      setDataStatus({ message: result.message, error: true });
      return;
    }
    setDataStatus({ message: t('data.exported', { filePath: result.filePath }) });
  };

  const importData = async () => {
    const result = await window.skeudenn.data.import();
    if (result.status === 'cancelled') {
      setDataStatus(null);
      return;
    }
    if (result.status === 'error') {
      setDataStatus({ message: result.message, error: true });
      return;
    }
    setDataStatus({
      message: t('data.imported', { count: result.added, updated: result.updated, filePath: result.filePath }),
    });
  };

  const clearCache = async () => {
    setCacheBusy(true);
    try {
      const result = await window.skeudenn.data.clearCache();
      setCacheStatus(
        result.status === 'error' ? { message: result.message, error: true } : { message: t('data.cacheCleared') },
      );
    } finally {
      setCacheBusy(false);
    }
  };

  const askClearLibrary = () => {
    setClearStatus(null);
    setClearCounts({ entries: library?.length ?? 0, readingLists: readingLists?.length ?? 0 });
  };

  const clearLibrary = async () => {
    setClearing(true);
    try {
      const result = await window.skeudenn.data.clearLibrary();
      if (result.status === 'error') {
        setClearStatus({ message: result.message, error: true });
        return;
      }
      setClearStatus({ message: t('data.cleared', { entries: result.entries, count: result.readingLists }) });
    } finally {
      setClearing(false);
      setClearCounts(null);
    }
  };

  return (
    <>
      <SettingsSection title={t('data.importExport')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportData}>
            <Download />
            {t('data.export')}
          </Button>
          <Button variant="outline" onClick={importData}>
            <Upload />
            {t('data.import')}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t('data.importHint')}</p>
        {dataStatus && (
          <p className={cn('text-sm', dataStatus.error ? 'text-destructive' : 'text-muted-foreground')}>
            {dataStatus.message}
          </p>
        )}
      </SettingsSection>

      <SettingsSection title={t('data.location')}>
        <p className="font-mono text-sm break-all text-muted-foreground">
          {dbLocation ? dbLocation.filePath : '…'}
          {dbLocation?.isDefault && t('data.defaultLocation')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={chooseDatabaseLocation}>
            <Database />
            {t('data.changeFolder')}
          </Button>
          {dbLocation && !dbLocation.isDefault && (
            <Button variant="outline" onClick={resetDatabaseLocation}>
              {t('data.resetLocation')}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t('data.locationHint')}</p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (fileNameDraft !== null) void applyFileName(fileNameDraft);
          }}
        >
          <label className="flex items-center gap-2 text-sm">
            {t('data.fileName')}
            <input
              className="h-8 w-56 rounded-md border bg-background px-2 font-mono"
              maxLength={100}
              value={fileNameDraft ?? dbLocation?.fileName ?? ''}
              onChange={(event) => setFileNameDraft(event.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" size="sm" disabled={fileNameDraft === null || fileNameDraft === dbLocation?.fileName}>
            {t('data.fileNameApply')}
          </Button>
          {dbLocation && !dbLocation.isDefaultFileName && (
            <Button type="button" variant="outline" size="sm" onClick={() => void applyFileName(null)}>
              {t('data.resetFileName')}
            </Button>
          )}
        </form>
        <p className="text-sm text-muted-foreground">{t('data.fileNameHint')}</p>
        {dbError && <p className="text-sm text-destructive">{dbError}</p>}
        {restartNeeded && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{t('data.restartNeeded')}</p>
            <Button size="sm" onClick={() => void window.skeudenn.database.relaunch()}>
              {t('data.restartNow')}
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('data.backup')}>
        <p className="text-sm text-muted-foreground">
          {t('data.backupIntro', { directory: backups?.directory ?? '…' })}
        </p>
        {settings && (
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              {t('data.backupInterval')}
              <input
                type="number"
                className="h-8 w-16 rounded-md border bg-background px-2"
                min={0}
                max={MAX_BACKUP_INTERVAL_DAYS}
                step={1}
                value={settings.backupIntervalDays}
                onChange={(event) => {
                  const days = event.target.valueAsNumber;
                  if (Number.isNaN(days)) return;
                  update('backupIntervalDays', Math.min(MAX_BACKUP_INTERVAL_DAYS, Math.max(0, Math.round(days))));
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              {t('data.backupKeep')}
              <input
                type="number"
                className="h-8 w-16 rounded-md border bg-background px-2"
                min={1}
                max={MAX_BACKUP_KEEP}
                step={1}
                value={settings.backupKeep}
                onChange={(event) => {
                  const keep = event.target.valueAsNumber;
                  if (Number.isNaN(keep)) return;
                  update('backupKeep', Math.min(MAX_BACKUP_KEEP, Math.max(1, Math.round(keep))));
                }}
              />
            </label>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={backupBusy} onClick={() => void backupNow()}>
            <DatabaseBackup />
            {t('data.backupNow')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {settings?.lastBackupAt
              ? t('data.backupLast', { date: formatDate(settings.lastBackupAt) })
              : t('data.backupNever')}
          </span>
        </div>
        {backupStatus && (
          <p className={cn('text-sm', backupStatus.error ? 'text-destructive' : 'text-muted-foreground')}>
            {backupStatus.message}
          </p>
        )}
        {pendingBackup && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {t('data.backupPending', { date: formatDate(pendingBackup.createdAt) })}
            </p>
            <Button size="sm" variant="outline" onClick={() => void cancelRestore()}>
              {t('data.backupCancelRestore')}
            </Button>
          </div>
        )}
        {backups && backups.backups.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('data.backupNone')}</p>
        )}
        <ul className="flex flex-col gap-1">
          {backups?.backups.map((backup) => (
            <li key={backup.name} className="flex items-center gap-3 text-sm">
              <span>{formatDate(backup.createdAt)}</span>
              <span className="text-muted-foreground">{formatFileSize(backup.size)}</span>
              <Button size="sm" variant="outline" onClick={() => setRestoring(backup)}>
                {t('data.backupRestore')}
              </Button>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title={t('data.cache')}>
        <p className="text-sm text-muted-foreground">{t('data.cacheHint')}</p>
        <div>
          <Button variant="outline" disabled={cacheBusy} onClick={() => void clearCache()}>
            <Eraser />
            {t('data.cacheButton')}
          </Button>
        </div>
        {cacheStatus && (
          <p className={cn('text-sm', cacheStatus.error ? 'text-destructive' : 'text-muted-foreground')}>
            {cacheStatus.message}
          </p>
        )}
      </SettingsSection>

      <SettingsSection title={t('data.clear')}>
        <p className="text-sm text-muted-foreground">{t('data.clearHint')}</p>
        <div>
          <Button variant="destructive" onClick={askClearLibrary}>
            <Trash2 />
            {t('data.clearButton')}
          </Button>
        </div>
        {clearStatus && (
          <p className={cn('text-sm', clearStatus.error ? 'text-destructive' : 'text-muted-foreground')}>
            {clearStatus.message}
          </p>
        )}
      </SettingsSection>

      <Dialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
        title={t('data.backupRestoreTitle')}
        description={restoring ? t('data.backupRestoreDescription', { date: formatDate(restoring.createdAt) }) : ''}
        className="max-w-md"
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRestoring(null)}>
            {t('common:cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void restoreBackup()}>
            {t('data.backupRestoreAction')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={clearCounts !== null}
        onOpenChange={(open) => !open && !clearing && setClearCounts(null)}
        title={t('data.clearConfirmTitle')}
        description={t('data.clearConfirmDescription')}
        className="max-w-md"
      >
        {clearCounts && (
          <p className="text-sm">
            {t('data.clearConfirm', { entries: clearCounts.entries, count: clearCounts.readingLists })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={clearing} onClick={() => setClearCounts(null)}>
            {t('common:cancel')}
          </Button>
          <Button variant="destructive" disabled={clearing} onClick={() => void clearLibrary()}>
            <Trash2 />
            {t('data.clearAction')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
