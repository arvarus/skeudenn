import { Folder } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SettingCheckbox } from '@/components/setting-checkbox';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { PickedFolder } from '@/shared/library';

/**
 * The confirmation after "Ajouter des dossiers…" picked its folders (the native dialog can't carry a
 * checkbox): lists the folders about to be scanned and asks whether to watch them, i.e. keep them as library
 * folders that every resynchronization walks. `initialWatch` is the remembered choice; `onConfirm` reports the
 * box's state, `onCancel` (the button, Escape, the cross or the backdrop) drops the whole addition. The paths
 * are shown only, the renderer never sends them back: the main process holds the pick behind a token.
 * Mount it only while a pick waits, so each pick starts from `initialWatch`.
 */
export function AddFoldersDialog({
  folders,
  initialWatch,
  onConfirm,
  onCancel,
}: {
  folders: PickedFolder[];
  initialWatch: boolean;
  onConfirm: (watch: boolean) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['library', 'common']);
  const [watch, setWatch] = useState(initialWatch);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onCancel()}
      title={t('library:addFoldersTitle')}
      description={t('library:addFoldersIntro', { count: folders.length })}
      className="max-w-lg"
    >
      <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto rounded-md border p-2 text-sm">
        {folders.map((folder) => (
          <li key={folder.path} className="flex items-center gap-2" title={folder.path}>
            <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 truncate">{folder.name}</span>
          </li>
        ))}
      </ul>
      <SettingCheckbox
        label={t('library:addFoldersWatch')}
        hint={t('library:addFoldersWatchHint')}
        checked={watch}
        onChange={setWatch}
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t('common:cancel')}
        </Button>
        <Button onClick={() => onConfirm(watch)}>{t('library:addFoldersConfirm')}</Button>
      </div>
    </Dialog>
  );
}
