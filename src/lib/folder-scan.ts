/**
 * The message the library page shows once a folder addition ends (`library.addFolder()`).
 * @module
 */
import { t } from '@/shared/i18n';
import type { ScanResult } from '@/shared/library';

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
