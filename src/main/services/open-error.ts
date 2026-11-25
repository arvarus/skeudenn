/**
 * The message the reader shows when a book cannot be opened.
 * @module
 */
import { t } from '../../shared/i18n';
import { errorText } from '../../shared/errors';

/**
 * The message shown in the reader when a book can't be opened, in the interface language: a
 * dedicated one for a missing file (moved or deleted), otherwise the underlying reason.
 */
export function openErrorMessage(error: unknown): string {
  if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
    return t('errors:archive.fileNotFound');
  }
  return t('errors:archive.openFailed', { message: errorText(error) });
}
