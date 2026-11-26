import { randomUUID } from 'node:crypto';

/** How many picks are remembered; an older token expires. */
const MAX_PICKED_FOLDER_SETS = 5;

/**
 * The folders the user chose in the dialog of "Ajouter des dossiers…", between the dialog and its
 * confirmation, by the opaque token handed to the renderer: the renderer shows their names but never
 * names a path, so `library:add-folders` can only scan what the user picked in a native dialog. A token
 * works once (`take()` forgets it), and only the most recent picks are kept.
 */
export class PickedFolders {
  private readonly picks = new Map<string, string[]>();

  /** Remembers the folders and returns the token standing for them. */
  add(folders: readonly string[]): string {
    const token = randomUUID();
    this.picks.set(token, [...folders]);
    for (const oldest of this.picks.keys()) {
      if (this.picks.size <= MAX_PICKED_FOLDER_SETS) break;
      this.picks.delete(oldest);
    }
    return token;
  }

  /** The folders a token stands for, or `undefined` (unknown, expired or already used); the token is spent. */
  take(token: string): string[] | undefined {
    const folders = this.picks.get(token);
    this.picks.delete(token);
    return folders;
  }
}
