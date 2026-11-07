/**
 * Library roots: how a book's file is stored in the database without naming this machine's folders.
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';

import { leavesFolder } from '../path-containment';

/** Starts the stored form of a path kept relative to a library folder: `root:<folder id>/<relative path>`. */
export const ROOT_PREFIX = 'root:';

/** Converts a file path between what the database stores and the absolute path on this machine. */
export interface PathCodec {
  /** The form to store (and compare in SQL) for the absolute path `filePath`. */
  encode(filePath: string): string;
  /** The absolute path, on this machine, of a stored path. */
  decode(stored: string): string;
}

/** A codec that stores paths as they are (the tests that don't care about roots). */
export const IDENTITY_PATHS: PathCodec = {
  encode: (filePath) => filePath,
  decode: (stored) => stored,
};

/** Where the folder ids' paths on this machine are kept between two runs. */
export interface RootsStore {
  /** The path of each folder id on this machine. */
  load(): Record<string, string>;
  /** Replaces what is kept. */
  save(roots: Record<string, string>): void;
}

/** A store that keeps nothing beyond the process, for the tests. */
export function memoryRootsStore(): RootsStore {
  let roots: Record<string, string> = {};
  return {
    load: () => ({ ...roots }),
    save: (next) => {
      roots = { ...next };
    },
  };
}

/**
 * A JSON file of `{ "<folder id>": "<absolute path>" }`, next to the database pointer in `userData`:
 * unlike the database, it is not shared between machines. A missing or damaged file reads as empty
 * (the folders then count as not found, and are relinked), it never stops the app from starting.
 */
export function fileRootsStore(filePath: string): RootsStore {
  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
        const roots: Record<string, string> = {};
        for (const [id, folder] of Object.entries(parsed)) {
          if (typeof folder === 'string' && folder !== '') roots[id] = folder;
        }
        return roots;
      } catch {
        return {};
      }
    },
    save(roots) {
      // Written aside then renamed: an interruption must not leave a truncated file, which reads as no folder at all.
      const temporary = `${filePath}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify(roots, null, 2));
        fs.renameSync(temporary, filePath);
      } catch (error) {
        fs.rmSync(temporary, { force: true });
        throw error;
      }
    },
  };
}

/**
 * The library folders as this machine sees them. The database keeps a book under a folder as
 * `root:<id>/<path relative to the folder>` (forward slashes, whatever the OS), and each machine
 * says where folder `<id>` is, so a library on a shared drive, a cloud folder or a network share
 * opens from any path. A book outside every folder keeps its absolute path.
 *
 * The mapping is also what the codec uses: `encode()` picks the deepest folder that contains the
 * file, `decode()` joins the folder's path here with the relative part. A stored path whose folder
 * has no path on this machine decodes to itself, which no file matches (the book reads as missing
 * until the folder is relinked), and encodes back to itself.
 */
export class PathRoots implements PathCodec {
  private readonly paths: Map<string, string>;
  /** The folders of the open database, oldest first, once {@link limitTo} has said which they are. */
  private folders: string[] | null = null;

  constructor(private readonly store: RootsStore = memoryRootsStore()) {
    this.paths = new Map(Object.entries(store.load()));
  }

  /** This machine's path of folder `id`, or undefined when it has none. */
  get(id: string): string | undefined {
    return this.paths.get(id);
  }

  /** Says where folder `id` is on this machine, and remembers it. */
  set(id: string, folderPath: string): void {
    this.paths.set(id, path.resolve(folderPath));
    this.store.save(Object.fromEntries(this.paths));
    if (this.folders !== null && !this.folders.includes(id)) this.folders.push(id);
  }

  /**
   * Stores new paths only under `folderIds`, the folders of the open database, oldest first. What this
   * machine remembers may come from another database (the location changed): such a folder has an id the
   * open database doesn't know, and a book stored under it would not match the same file stored under
   * the database's own id. Its path is kept, so what was stored under it still decodes. Of two folders at
   * the same place, the first one listed wins.
   */
  limitTo(folderIds: readonly string[]): void {
    this.folders = [...folderIds];
  }

  encode(filePath: string): string {
    if (filePath.startsWith(ROOT_PREFIX)) return filePath;
    let best: { id: string; relative: string; depth: number } | null = null;
    for (const id of this.folders ?? this.paths.keys()) {
      const folder = this.paths.get(id);
      if (folder === undefined) continue;
      const relative = path.relative(folder, filePath);
      if (relative === '' || leavesFolder(relative)) continue;
      if (best === null || folder.length > best.depth) {
        best = { id, relative, depth: folder.length };
      }
    }
    return best === null ? filePath : `${ROOT_PREFIX}${best.id}/${best.relative.split(path.sep).join('/')}`;
  }

  decode(stored: string): string {
    if (!stored.startsWith(ROOT_PREFIX)) return stored;
    const slash = stored.indexOf('/', ROOT_PREFIX.length);
    if (slash === -1) return stored;
    const folder = this.paths.get(stored.slice(ROOT_PREFIX.length, slash));
    if (folder === undefined) return stored;
    const decoded = path.join(folder, ...stored.slice(slash + 1).split('/'));
    // A database shared between machines is somebody else's input: `root:id/../../x` must not leave the folder.
    return leavesFolder(path.relative(folder, decoded)) ? stored : decoded;
  }
}
