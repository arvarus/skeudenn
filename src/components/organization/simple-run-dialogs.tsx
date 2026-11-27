import { useTranslation } from 'react-i18next';

import { CountedRunDialog } from '@/components/organization/counted-run-dialog';
import { formatFileSize } from '@/lib/utils';

/** The props of every action dialog: it is shown while mounted, and asks to go with `onClose`. */
export interface ActionDialogProps {
  onClose: () => void;
}

/** "Organiser toute la bibliothèque": moves the comics not in their place yet into the organized folder. */
export function OrganizeAllDialog({ onClose }: ActionDialogProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  return (
    <CountedRunDialog
      title={t('actions.organizeAll.title')}
      description={t('organizeAllHint')}
      count={() => window.skeudenn.library.countUnorganized()}
      intro={({ count, folder }) =>
        count === 0 ? { text: t('organizeAllNone'), ready: false } : { text: t('organizeAllCount', { count, folder }), ready: true }
      }
      startLabel={t('organizeAllAction')}
      progressLabel={t('organizeAllRunning')}
      start={() => window.skeudenn.library.organizeAll()}
      report={(result) => ({
        summary: [t('organizeAllDone', { count: result.moved })],
        problems: result.failed > 0 ? [t('organizeAllFailed', { count: result.failed })] : [],
      })}
      onClose={onClose}
    />
  );
}

/** "Convertir les CBR en CBZ": writes the CBR of the organized folder as CBZ. */
export function ConvertCbrDialog({ onClose }: ActionDialogProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  return (
    <CountedRunDialog
      title={t('actions.convertCbr.title')}
      description={t('convertCbrHint')}
      count={() => window.skeudenn.library.countConvertible()}
      intro={({ count, folder }) =>
        count === 0 ? { text: t('convertCbrNone'), ready: false } : { text: t('convertCbrCount', { count, folder }), ready: true }
      }
      startLabel={t('convertCbrAction')}
      progressLabel={t('convertCbrRunning')}
      start={() => window.skeudenn.library.convertCbr()}
      report={(result) => ({
        summary: [t('convertCbrDone', { count: result.converted })],
        problems: result.failed > 0 ? [t('convertCbrFailed', { count: result.failed })] : [],
      })}
      onClose={onClose}
    />
  );
}

/** "Vider le dossier .deletedBySkeudenn": deletes its content for good, the intro saying so before anything starts. */
export function EmptyDeletedDialog({ onClose }: ActionDialogProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  return (
    <CountedRunDialog
      title={t('actions.emptyDeleted.title')}
      description={t('emptyDeletedHint')}
      count={() => window.skeudenn.library.countConvertible()}
      intro={({ deletedFiles, deletedBytes }) =>
        deletedFiles === 0
          ? { text: t('emptyDeletedNone'), ready: false }
          : { text: t('emptyDeletedCount', { count: deletedFiles, size: formatFileSize(deletedBytes) }), ready: true }
      }
      startLabel={t('emptyDeletedAction')}
      progressLabel={t('emptyDeletedRunning')}
      start={() => window.skeudenn.library.emptyDeleted()}
      report={(result) => ({
        summary: [t('emptyDeletedDone', { count: result.deleted, size: formatFileSize(result.bytesFreed) })],
        problems: result.failed > 0 ? [t('emptyDeletedFailed', { count: result.failed })] : [],
      })}
      onClose={onClose}
    />
  );
}

/** "Nettoyer les dossiers": moves the orphan folders of the organized folder to `.deletedBySkeudenn`. */
export function CleanFoldersDialog({ onClose }: ActionDialogProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'library' });
  return (
    <CountedRunDialog
      title={t('actions.cleanFolders.title')}
      description={t('cleanFoldersHint')}
      count={() => window.skeudenn.library.countOrphanFolders()}
      intro={({ count, folder }) =>
        count === 0 ? { text: t('cleanFoldersNone'), ready: false } : { text: t('cleanFoldersCount', { count, folder }), ready: true }
      }
      startLabel={t('cleanFoldersAction')}
      progressLabel={t('cleanFoldersRunning')}
      start={() => window.skeudenn.library.cleanFolders()}
      report={(result) => ({
        summary: [t('cleanFoldersDone', { count: result.moved })],
        problems: result.failed > 0 ? [t('cleanFoldersFailed', { count: result.failed })] : [],
      })}
      onClose={onClose}
    />
  );
}
