/**
 * What the runs over the organized folder (organization, CBR conversion, orphan folders) share: whether
 * the folder can be used, and the names free in a folder. Free of Electron, like those services.
 * @module
 */
import { lstat, realpath, stat, utimes } from 'node:fs/promises';
import path from 'node:path';

import { t } from '../../shared/i18n';
import { DELETED_BY_TANKOBON_FOLDER } from '../../shared/library';
import type { LibraryOrganization } from '../../shared/settings';
import { isInside } from '../path-containment';

/** Whether `file` exists (any error counts as no). */
export async function pathExists(file: string): Promise<boolean> {
  return stat(file).then(() => true, () => false);
}

/** Whether `folder` exists and is a directory. */
export async function isDirectory(folder: string): Promise<boolean> {
  return stat(folder).then((info) => info.isDirectory(), () => false);
}

/**
 * Why the organized folder `root` can't be used for a run, as a message in the interface language, or `null`
 * when it can: the organization is `off` or has no folder, or the folder isn't there (an unplugged drive).
 */
export async function organizedFolderProblem(mode: LibraryOrganization, root: string): Promise<string | null> {
  if (mode === 'off' || root === '') return t('errors:library.organizationOff');
  if (!(await isDirectory(root))) return t('errors:library.organizationFolderUnreachable', { folder: root });
  return null;
}

/**
 * The first of `stem.ext`, `stem (2).ext`, `stem (3).ext`… in `folder` that `isFree` accepts and that doesn't
 * exist on disk. `extension` is empty for a folder name.
 */
export async function firstFreeName(
  folder: string,
  stem: string,
  extension = '',
  isFree: (candidate: string) => boolean = () => true,
): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = path.join(folder, n === 1 ? `${stem}${extension}` : `${stem} (${n})${extension}`);
    if (isFree(candidate) && !(await pathExists(candidate))) return candidate;
  }
}

/** Stamps a file or folder just moved to the trash with the current time, whatever its own dates were, so the automatic emptying counts its days from now. */
export async function markParked(target: string): Promise<void> {
  const now = new Date();
  await utimes(target, now, now).catch(() => undefined);
}

/**
 * The `.deletedByTankobon` folder of `root`, or `null` when it must not be used. It is usable when it doesn't
 * exist yet (parking creates it) or when it is a real directory: not a symbolic link nor a Windows junction
 * (which `lstat` reports as links), and inside `root` once both are resolved. A link planted there (a shared
 * or synced organized folder) would otherwise make the emptying delete, the size count read and the parking
 * move files wherever it points. Any other error reading it counts as unusable.
 */
export async function usableTrashFolder(root: string): Promise<string | null> {
  const folder = path.join(root, DELETED_BY_TANKOBON_FOLDER);
  let info;
  try {
    info = await lstat(folder);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? folder : null;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) return null;
  try {
    return isInside(await realpath(root), await realpath(folder)) ? folder : null;
  } catch {
    return null;
  }
}

/** `usableTrashFolder()`, throwing a translated error when the folder can't be used, for the parking steps that report a failure. */
export async function requireTrashFolder(root: string): Promise<string> {
  const folder = await usableTrashFolder(root);
  if (folder === null) {
    throw new Error(t('errors:library.trashFolderLinked', { folder: path.join(root, DELETED_BY_TANKOBON_FOLDER) }));
  }
  return folder;
}
