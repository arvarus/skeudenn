/**
 * Persistence of the folders added to the library (the `library_folders` table).
 * @module
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type { UnlinkedFolder } from '../../shared/library';
import { PathRoots } from './path-roots';
import { FIRST_USER_ID } from './schema';

interface FolderRow {
  id: string;
  path: string;
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

/**
 * The folders added to the library with "Ajouter un dossier…", and the roots the books' paths are
 * stored relative to (see `PathRoots`). The database holds each folder's id and the path it had
 * when added; where it is on *this* machine lives in `roots`. The folders themselves are common
 * (books refer to them), but which of them a resynchronization walks is each user's choice
 * (`user_library_folders`). Kept in the main process only: the renderer never names a path, it
 * only lists them.
 */
export class LibraryFolderRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly roots: PathRoots = new PathRoots(),
    private readonly userId: () => string = () => FIRST_USER_ID,
  ) {}

  private rows(): FolderRow[] {
    return this.db
      .prepare('SELECT id, path FROM library_folders ORDER BY added_at, path')
      .all() as unknown as FolderRow[];
  }

  /**
   * Finds, at start-up, the folders this machine has no path for yet but whose recorded path exists
   * here (the first run after the roots appeared, or a second machine with the same layout), and
   * limits the paths stored from now on to this database's folders (see `PathRoots.limitTo`).
   * Returns true when one was found.
   */
  syncRoots(): boolean {
    let found = false;
    const rows = this.rows();
    for (const row of rows) {
      if (this.roots.get(row.id) !== undefined) continue;
      try {
        if (fs.statSync(row.path).isDirectory()) {
          this.roots.set(row.id, row.path);
          found = true;
        }
      } catch {
        // Not on this machine: it stays unlinked.
      }
    }
    this.roots.limitTo(rows.map((row) => row.id));
    return found;
  }

  /**
   * The folders a resynchronization walks for the active user, in the order they were added, as
   * paths on this machine.
   */
  list(): string[] {
    const watched = this.db
      .prepare(
        `SELECT f.id FROM library_folders f
         JOIN user_library_folders w ON w.folder_id = f.id AND w.user_id = ?
         ORDER BY f.added_at, f.path`,
      )
      .all(this.userId()) as {
      id: string;
    }[];
    return watched.flatMap((row) => {
      const folder = this.roots.get(row.id);
      return folder === undefined ? [] : [folder];
    });
  }

  /** The folders (watched or forgotten) that books refer to and that have no path on this machine. */
  unlinked(): UnlinkedFolder[] {
    return this.rows().filter((row) => this.roots.get(row.id) === undefined);
  }

  /** Says where an unlinked folder is on this machine. False when `id` is not a known folder. */
  relink(id: string, folderPath: string): boolean {
    if (!this.rows().some((row) => row.id === id)) return false;
    this.roots.set(id, folderPath);
    return true;
  }

  /** Remembers a folder and watches it for the active user; one that is already known is only watched again. */
  add(folderPath: string): void {
    const rows = this.rows();
    const known =
      rows.find((row) => {
        const here = this.roots.get(row.id);
        return here !== undefined && samePath(here, folderPath);
      }) ?? rows.find((row) => row.path === folderPath && this.roots.get(row.id) === undefined);
    if (known) {
      this.roots.set(known.id, folderPath);
      this.watch(known.id);
      return;
    }
    const id = randomUUID();
    this.roots.set(id, folderPath);
    this.db
      .prepare('INSERT INTO library_folders (id, path, added_at, watched) VALUES (?, ?, ?, 1)')
      .run(id, folderPath, new Date().toISOString());
    this.watch(id);
  }

  private watch(folderId: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO user_library_folders (user_id, folder_id) VALUES (?, ?)')
      .run(this.userId(), folderId);
  }

  /**
   * Stops watching a folder for the active user. Its comics stay in the library, and the folder itself
   * is kept since their stored paths are relative to it (and other users may watch it).
   */
  remove(folderPath: string): void {
    for (const row of this.rows()) {
      const here = this.roots.get(row.id);
      if (here !== undefined && samePath(here, folderPath)) {
        this.db
          .prepare('DELETE FROM user_library_folders WHERE user_id = ? AND folder_id = ?')
          .run(this.userId(), row.id);
      }
    }
  }
}
