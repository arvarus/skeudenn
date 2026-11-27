import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScanProgress } from '../../shared/library';
import { LibraryFolderRepository } from '../db/library-folder-repository';
import { LibraryRepository } from '../db/library-repository';
import { PathRoots } from '../db/path-roots';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import { addFolderToLibrary, type AddFolderDependencies } from './library-add-folder';
import { createLibraryRunLock, NOTHING_ORGANIZED } from './library-organization';

const roots: string[] = [];
const WATCH = { watch: true };
const NO_WATCH = { watch: false };

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function folderWith(files: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'skeudenn-add-folder-'));
  roots.push(root);
  for (const file of files) await writeFile(path.join(root, file), '');
  return root;
}

describe('addFolderToLibrary', () => {
  let deps: AddFolderDependencies;
  let db: DatabaseSync;
  let repo: LibraryRepository;
  let folders: LibraryFolderRepository;
  const notify = vi.fn();
  const kick = vi.fn(async () => undefined);
  const afterAdd = vi.fn(async () => ({ moved: 1, failed: 0, pending: null }));
  const inspect = vi.fn(async () => ({ pageCount: 10, fileCount: 10 }));

  beforeEach(() => {
    vi.clearAllMocks();
    inspect.mockImplementation(async () => ({ pageCount: 10, fileCount: 10 }));
    db = new DatabaseSync(':memory:');
    migrate(db);
    // The same codec on both sides, as in the app: a library folder makes the comics under it stored relative to it.
    const pathRoots = new PathRoots();
    repo = new LibraryRepository(db, () => 'default', pathRoots);
    folders = new LibraryFolderRepository(db, pathRoots);
    deps = {
      repo,
      folders,
      settings: new SettingsRepository(db),
      decoder: { inspect },
      notify,
      imageScanner: { kick },
      organizer: { afterAdd, lock: createLibraryRunLock() },
      activeUser: () => 'default',
    };
  });

  it('adds the comics, organizes them and announces them', async () => {
    const root = await folderWith(['a.cbz', 'b.cbz']);

    const result = await addFolderToLibrary(deps, [root], WATCH, () => undefined);

    expect(result).toMatchObject({ status: 'ok', folders: 1, added: 2, total: 2, cancelled: false, organization: { moved: 1 } });
    expect(afterAdd).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ scope: 'library' });
    expect(kick).toHaveBeenCalled();
    expect(folders.list()).toEqual([root]);
  });

  it('stops between two files when the lock is cancelled, keeps the additions and organizes nothing', async () => {
    const root = await folderWith(['a.cbz', 'b.cbz', 'c.cbz']);
    // The stop is asked while the first file is being opened: that one is still added.
    inspect.mockImplementationOnce(async () => {
      expect(deps.organizer.lock.cancel()).toBe(true);
      return { pageCount: 10, fileCount: 10 };
    });

    const result = await addFolderToLibrary(deps, [root], WATCH, () => undefined);

    expect(result).toMatchObject({ status: 'ok', added: 1, skipped: 0, failed: 0, total: 3, cancelled: true });
    expect(result.status === 'ok' && result.organization).toEqual(NOTHING_ORGANIZED);
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(repo.list()).toHaveLength(1);
    expect(afterAdd).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith({ scope: 'library' });
    expect(kick).toHaveBeenCalled();
    // The lock is released: another run can start.
    expect(deps.organizer.lock.tryStart('resync')).not.toBeNull();
  });

  it('refuses to start while another run holds the lock', async () => {
    deps.organizer.lock.tryStart('resync');
    const result = await addFolderToLibrary(deps, [await folderWith(['a.cbz'])], WATCH, () => undefined);
    expect(result.status).toBe('error');
    expect(inspect).not.toHaveBeenCalled();
  });

  it('organizes nothing when another user became active during the scan', async () => {
    let user = 'default';
    deps.activeUser = () => user;
    inspect.mockImplementationOnce(async () => {
      user = 'other';
      return { pageCount: 10, fileCount: 10 };
    });

    const result = await addFolderToLibrary(deps, [await folderWith(['a.cbz'])], WATCH, () => undefined);

    expect(result).toMatchObject({ status: 'ok', added: 1, cancelled: false, organization: NOTHING_ORGANIZED });
    expect(afterAdd).not.toHaveBeenCalled();
  });

  describe('several folders', () => {
    it('adds the comics of every folder, watches them and reports once to the organization and the measure', async () => {
      const [a, b, c] = [await folderWith(['a1.cbz', 'a2.cbz']), await folderWith(['b1.cbz']), await folderWith(['c1.cbz', 'c2.pdf'])];

      const result = await addFolderToLibrary(deps, [a, b, c], WATCH, () => undefined);

      expect(result).toMatchObject({ status: 'ok', folders: 3, added: 5, skipped: 0, failed: 0, total: 5, cancelled: false });
      expect(repo.list()).toHaveLength(5);
      expect(folders.list()).toEqual([a, b, c]);
      expect(afterAdd).toHaveBeenCalledTimes(1);
      const offered = (afterAdd.mock.calls[0] as unknown as [{ id: string; path: string }[]])[0];
      expect(offered.map((entry) => path.basename(entry.path)).sort()).toEqual(['a1.cbz', 'a2.cbz', 'b1.cbz', 'c1.cbz', 'c2.pdf']);
      expect(kick).toHaveBeenCalledTimes(1);
    });

    it('does not watch the folders with watch: false, and still adds their comics', async () => {
      const [a, b, c] = [await folderWith(['a.cbz']), await folderWith(['b.cbz']), await folderWith(['c.cbz'])];
      const add = vi.spyOn(folders, 'add');
      const adopt = vi.spyOn(repo, 'adoptRoots');

      const result = await addFolderToLibrary(deps, [a, b, c], NO_WATCH, () => undefined);

      expect(result).toMatchObject({ status: 'ok', added: 3 });
      expect(add).not.toHaveBeenCalled();
      expect(adopt).not.toHaveBeenCalled();
      expect(folders.list()).toEqual([]);
      // Stored with their absolute path, like a file added on its own.
      expect(repo.list().map((entry) => entry.path).sort()).toEqual([path.join(a, 'a.cbz'), path.join(b, 'b.cbz'), path.join(c, 'c.cbz')].sort());
      const stored = db.prepare('SELECT path FROM library').all() as { path: string }[];
      expect(stored.every((row) => !row.path.startsWith('root:'))).toBe(true);
    });

    it('stores a comic under an existing library folder relative to it, even unwatched', async () => {
      const root = await folderWith([]);
      const sub = path.join(root, 'sub');
      await mkdir(sub);
      await writeFile(path.join(sub, 'a.cbz'), '');
      folders.add(root);

      await addFolderToLibrary(deps, [sub], NO_WATCH, () => undefined);

      expect(folders.list()).toEqual([root]);
      expect(repo.list().map((entry) => entry.path)).toEqual([path.join(sub, 'a.cbz')]);
      const stored = db.prepare('SELECT path FROM library').all() as { path: string }[];
      expect(stored[0].path).toMatch(/^root:/);
    });

    it('scans a repeated folder and a nested one once', async () => {
      const parent = await folderWith(['p.cbz']);
      const child = path.join(parent, 'child');
      await mkdir(child);
      await writeFile(path.join(child, 'c.cbz'), '');
      const add = vi.spyOn(folders, 'add');

      const result = await addFolderToLibrary(deps, [child, parent, parent], WATCH, () => undefined);

      expect(result).toMatchObject({ status: 'ok', folders: 1, added: 2, skipped: 0, total: 2 });
      expect(inspect).toHaveBeenCalledTimes(2);
      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledWith(parent);
    });

    it('remembers the folder the picked ones share as the last scan folder', async () => {
      const parent = await folderWith([]);
      const [a, b] = [path.join(parent, 'a'), path.join(parent, 'b')];
      await mkdir(a);
      await mkdir(b);

      const result = await addFolderToLibrary(deps, [a, b], NO_WATCH, () => undefined);

      expect(result).toMatchObject({ status: 'ok', directory: parent, folders: 2 });
      expect(new SettingsRepository(db).getAll().lastScanFolder).toBe(parent);
      expect(notify).toHaveBeenCalledWith({ scope: 'settings', values: { lastScanFolder: parent } });
    });

    it('stops before the next folder when cancelled, keeps what was added and organizes nothing', async () => {
      const [a, b] = [await folderWith(['a1.cbz', 'a2.cbz']), await folderWith(['b1.cbz'])];
      inspect.mockImplementationOnce(async () => {
        expect(deps.organizer.lock.cancel()).toBe(true);
        return { pageCount: 10, fileCount: 10 };
      });

      const result = await addFolderToLibrary(deps, [a, b], WATCH, () => undefined);

      expect(result).toMatchObject({ status: 'ok', cancelled: true, added: 1, total: 2, folders: 2 });
      expect(result.status === 'ok' && result.organization).toEqual(NOTHING_ORGANIZED);
      // The second folder was never started: not scanned, not watched.
      expect(inspect).toHaveBeenCalledTimes(1);
      expect(folders.list()).toEqual([a]);
      expect(afterAdd).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith({ scope: 'library' });
      expect(kick).toHaveBeenCalledTimes(1);
      expect(deps.organizer.lock.tryStart('resync')).not.toBeNull();
    });

    it('is refused as a whole while another run holds the lock', async () => {
      deps.organizer.lock.tryStart('resync');
      const add = vi.spyOn(folders, 'add');

      const result = await addFolderToLibrary(deps, [await folderWith(['a.cbz']), await folderWith(['b.cbz'])], WATCH, () => undefined);

      expect(result.status).toBe('error');
      expect(add).not.toHaveBeenCalled();
      expect(inspect).not.toHaveBeenCalled();
    });

    it('organizes nothing when the user switched during the run', async () => {
      let user = 'default';
      deps.activeUser = () => user;
      inspect.mockImplementationOnce(async () => {
        user = 'other';
        return { pageCount: 10, fileCount: 10 };
      });

      const result = await addFolderToLibrary(deps, [await folderWith(['a.cbz']), await folderWith(['b.cbz'])], WATCH, () => undefined);

      expect(result).toMatchObject({ status: 'ok', added: 2, organization: NOTHING_ORGANIZED });
      expect(afterAdd).not.toHaveBeenCalled();
    });

    it('merges the failures of the folders and counts every one', async () => {
      const [a, b] = [await folderWith(['a1.cbz', 'a2.cbz']), await folderWith(['b1.cbz'])];
      inspect.mockImplementation(async () => {
        throw new Error('unreadable');
      });

      const result = await addFolderToLibrary(deps, [a, b], WATCH, () => undefined);

      expect(result).toMatchObject({ status: 'ok', added: 0, failed: 3, total: 3 });
      expect(result.status === 'ok' && result.failures).toHaveLength(3);
    });

    it('labels the progress with the folder when there are several, and ends it once', async () => {
      const [a, b] = [await folderWith(['a.cbz']), await folderWith(['b.cbz'])];
      const seen: ScanProgress[] = [];

      await addFolderToLibrary(deps, [a, b], WATCH, (progress) => seen.push(progress));

      expect(seen.filter((progress) => progress.phase === 'done')).toHaveLength(1);
      expect(seen.at(-1)?.phase).toBe('done');
      const before = seen.slice(0, -1);
      expect(before.every((progress) => progress.folder?.count === 2)).toBe(true);
      expect(before.some((progress) => progress.folder?.index === 1)).toBe(true);
      expect(before.some((progress) => progress.folder?.index === 2)).toBe(true);
      expect(before[0].folder?.name).toBe(path.basename(a));
    });

    it('sets no folder label for a single folder', async () => {
      const seen: ScanProgress[] = [];

      await addFolderToLibrary(deps, [await folderWith(['a.cbz'])], WATCH, (progress) => seen.push(progress));

      expect(seen.every((progress) => progress.folder === undefined)).toBe(true);
    });

    it('does nothing for an empty pick', async () => {
      expect(await addFolderToLibrary(deps, [], WATCH, () => undefined)).toEqual({ status: 'cancelled' });
    });
  });
});
