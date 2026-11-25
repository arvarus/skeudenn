/**
 * Test support: making a folder that is a link, both kinds a planted `.deletedByTankobon` can be. Only the
 * tests import it.
 * @module
 */
import { symlink } from 'node:fs/promises';

/** A symbolic link to a directory, and a Windows junction (needs no privilege; elsewhere Node makes a plain symbolic link). */
export const FOLDER_LINK_KINDS = ['dir', 'junction'] as const;

/** One of `FOLDER_LINK_KINDS`. */
export type FolderLinkKind = (typeof FOLDER_LINK_KINDS)[number];

/**
 * Makes `link` point at the directory `target`, or calls `skip()` when the system refuses (a symbolic link on
 * Windows without the privilege or developer mode).
 */
export async function linkFolderOrSkip(target: string, link: string, kind: FolderLinkKind, skip: () => void): Promise<void> {
  try {
    await symlink(target, link, kind);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') skip();
    throw error;
  }
}
