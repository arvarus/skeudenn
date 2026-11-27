import { createFileRoute } from '@tanstack/react-router';
import { FolderOpen, FolderX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingCheckbox } from '@/components/setting-checkbox';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/use-settings';
import { isOrganizationOn } from '@/lib/settings-nav';
import type { ScanProgress, UnlinkedFolder } from '@/shared/library';

export const Route = createFileRoute('/settings/library')({
  component: LibrarySettingsPage,
});

function LibrarySettingsPage() {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  const { settings, update } = useSettings();
  const organizationOn = isOrganizationOn(settings);
  const [folders, setFolders] = useState<string[] | null>(null);
  const [unlinked, setUnlinked] = useState<UnlinkedFolder[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null);
  // A resynchronization or an organization is running (started here, elsewhere or at launch).
  const resyncing = progress !== null;

  // Read again when the organized folder changes: choosing it adds it to the list.
  useEffect(() => {
    let cancelled = false;
    void window.skeudenn.library.listFolders().then((list) => {
      if (!cancelled) setFolders(list);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.libraryOrganizationFolder]);

  // The folders of a library made on another computer, which have no path here yet.
  const loadUnlinked = useCallback(() => {
    void window.skeudenn.library.listUnlinkedFolders().then(setUnlinked);
  }, []);
  useEffect(loadUnlinked, [loadUnlinked]);

  const relinkFolder = async (id: string) => {
    const result = await window.skeudenn.library.relinkFolder(id);
    if (result.status === 'error') setStatus({ message: result.message, error: true });
    if (result.status === 'ok') {
      loadUnlinked();
      setFolders(await window.skeudenn.library.listFolders());
    }
  };

  // Shows a run started anywhere, to keep the folders from changing under it.
  useEffect(() => window.skeudenn.library.onScanProgress((p) => setProgress(p.phase === 'done' ? null : p)), []);

  const removeFolder = async (folder: string) => {
    await window.skeudenn.library.removeFolder(folder);
    setFolders((list) => list?.filter((f) => f !== folder) ?? list);
  };

  // The folder is set by the main process (it is where files get moved): the renderer only opens the dialog.
  const pickOrganizationFolder = () => void window.skeudenn.library.pickOrganizationFolder();

  return (
    <>
      <SettingsSection title={t('folders')}>
        <p className="text-sm text-muted-foreground">{t('foldersHint')}</p>
        {folders?.length === 0 && <p className="text-sm text-muted-foreground">{t('noFolders')}</p>}
        <ul className="flex flex-col gap-1">
          {folders?.map((folder) => (
            <li key={folder} className="flex items-center gap-2">
              <span className="font-mono text-sm break-all">{folder}</span>
              <Button
                variant="ghost"
                size="icon"
                title={t('removeFolder')}
                aria-label={t('removeFolder')}
                disabled={resyncing}
                onClick={() => void removeFolder(folder)}
              >
                <FolderX />
              </Button>
            </li>
          ))}
        </ul>
      </SettingsSection>

      {unlinked.length > 0 && (
        <SettingsSection title={t('unlinkedFolders')}>
          <p className="text-sm text-muted-foreground">{t('unlinkedHint')}</p>
          <ul className="flex flex-col gap-1">
            {unlinked.map((folder) => (
              <li key={folder.id} className="flex items-center gap-2">
                <span className="font-mono text-sm break-all">{folder.path}</span>
                <Button variant="outline" size="sm" onClick={() => void relinkFolder(folder.id)}>
                  {t('relinkFolder')}
                </Button>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}

      {status && <p className="text-sm text-destructive">{status.message}</p>}

      <SettingsSection title={t('organizedLibrary')}>
        <SettingCheckbox
          label={t('organizedLibraryEnable')}
          hint={t('organizedLibraryHint')}
          checked={organizationOn}
          disabled={resyncing}
          onChange={(checked) => update('libraryOrganization', checked ? 'ask' : 'off')}
        />
      </SettingsSection>

      {organizationOn && (
      <SettingsSection title={t('organizationFolder')}>
        <p className="text-sm text-muted-foreground">{t('organizationFolderHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          {settings.libraryOrganizationFolder ? (
            <span className="font-mono text-sm break-all">{settings.libraryOrganizationFolder}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('organizationNoFolder')}</span>
          )}
          <Button variant="outline" onClick={pickOrganizationFolder} disabled={resyncing}>
            <FolderOpen />
            {t('organizationChoose')}
          </Button>
        </div>
      </SettingsSection>
      )}
    </>
  );
}
