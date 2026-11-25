import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryFolderRepository } from '../db/library-folder-repository';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import { addFolderToLibrary, type AddFolderDependencies } from './library-add-folder';
import { createLibraryRunLock, NOTHING_ORGANIZED } from './library-organization';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function folderWith(files: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tankobon-add-folder-'));
  roots.push(root);
  for (const file of files) await writeFile(path.join(root, file), '');
  return root;
}

describe('addFolderToLibrary', () => {
  let deps: AddFolderDependencies;
  let repo: LibraryRepository;
  const notify = vi.fn();
  const kick = vi.fn(async () => undefined);
  const afterAdd = vi.fn(async () => ({ moved: 1, failed: 0, pending: null }));
  const inspect = vi.fn(async () => ({ pageCount: 10, fileCount: 10 }));

  beforeEach(() => {
    vi.clearAllMocks();
    const db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new LibraryRepository(db);
    deps = {
      repo,
      folders: new LibraryFolderRepository(db),
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

    const result = await addFolderToLibrary(deps, root, () => undefined);

    expect(result).toMatchObject({ status: 'ok', added: 2, total: 2, cancelled: false, organization: { moved: 1 } });
    expect(afterAdd).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ scope: 'library' });
    expect(kick).toHaveBeenCalled();
  });

  it('stops between two files when the lock is cancelled, keeps the additions and organizes nothing', async () => {
    const root = await folderWith(['a.cbz', 'b.cbz', 'c.cbz']);
    // The stop is asked while the first file is being opened: that one is still added.
    inspect.mockImplementationOnce(async () => {
      expect(deps.organizer.lock.cancel()).toBe(true);
      return { pageCount: 10, fileCount: 10 };
    });

    const result = await addFolderToLibrary(deps, root, () => undefined);

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
    const result = await addFolderToLibrary(deps, await folderWith(['a.cbz']), () => undefined);
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

    const result = await addFolderToLibrary(deps, await folderWith(['a.cbz']), () => undefined);

    expect(result).toMatchObject({ status: 'ok', added: 1, cancelled: false, organization: NOTHING_ORGANIZED });
    expect(afterAdd).not.toHaveBeenCalled();
  });
});
