/**
 * The follow-up of the library organization after an addition: asking whether to move the comics
 * just added, then moving them.
 * @module
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { OrganizationOutcome } from '@/shared/library';

/**
 * Follows up on what the library organization did after an addition (`organization` of an
 * `addFile`/`addFolders`/`resync` result): when it offers to move comics (`ask` mode), asks through
 * `confirm` (the view's `useConfirm()`) and moves them on approval. Resolves with the status parts to
 * show (moved, failed, or the error), empty when there was nothing to say.
 */
export function useOrganizationOffer(
  // The shape of `ConfirmOptions` (`confirm-dialog.tsx`), outside the documented modules.
  confirm: (options: { title: string; message: string; action: string }) => Promise<boolean>,
): (outcome: OrganizationOutcome) => Promise<string[]> {
  const { t } = useTranslation('library');

  return useCallback(
    async (outcome) => {
      let { moved, failed } = outcome;
      const parts: string[] = [];
      if (outcome.pending) {
        const { token, count, folder } = outcome.pending;
        const accepted = await confirm({
          title: t('organizeConfirmTitle'),
          message: t('organizeConfirm', { count, folder }),
          action: t('organizeConfirmAction'),
        });
        if (accepted) {
          const result = await window.skeudenn.library.organize(token);
          if (result.status === 'error') parts.push(result.message);
          else {
            moved += result.moved;
            failed += result.failed;
          }
        }
      }
      if (moved > 0) parts.unshift(t('organizeMoved', { count: moved }));
      if (failed > 0) parts.push(t('organizeFailed', { count: failed }));
      return parts;
    },
    [confirm, t],
  );
}
