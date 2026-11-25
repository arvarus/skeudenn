/**
 * The message the library page shows once a folder addition (`library.addFolder()`) or a file
 * addition (`library.addFile()`) ends.
 * @module
 */
import { t } from '@/shared/i18n';
import type { AddFileResult, ScanResult } from '@/shared/library';

/**
 * The parts of the message for a folder addition that ran, to be joined with " · ": "stopped" first
 * when the scan was stopped, then the comics added, those already there and the unreadable ones; or
 * the single "no comics found" when the folder held none.
 */
export function folderScanParts(result: Extract<ScanResult, { status: 'ok' }>): string[] {
  if (result.total === 0) return [t('library:scanNoneFound', { directory: result.directory })];
  const parts = result.cancelled ? [t('library:scanStopped')] : [];
  parts.push(t('library:scanAdded', { count: result.added, directory: result.directory }));
  if (result.skipped > 0) parts.push(t('library:scanSkipped', { count: result.skipped }));
  if (result.failed > 0) parts.push(t('library:scanFailed', { count: result.failed }));
  return parts;
}

/**
 * The parts of the message for a file addition, to be joined with " · " (the organization offer's
 * parts may follow an added file): the file added, the file already in the library, or the error's
 * own message; `null` when the user cancelled the dialog, which says nothing.
 */
export function fileAddParts(result: AddFileResult): string[] | null {
  switch (result.status) {
    case 'cancelled':
      return null;
    case 'added':
      return [t('library:fileAdded', { title: result.title })];
    case 'exists':
      return [t('library:fileExists', { title: result.title })];
    case 'error':
      return [result.message];
  }
}
