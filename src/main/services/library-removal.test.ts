import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import type { ScanProgress } from '../../shared/library';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import { createLibraryRunLock } from './library-organization';
import { createLibraryRemover } from './library-removal';

applyLanguage('fr');

describe('createLibraryRemover', () => {
  let dir: string;
  let repo: LibraryRepository;
  let settings: SettingsRepository;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tankobon-removal-'));
    const db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new LibraryRepository(db);
    settings = new SettingsRepository(db);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function addBook(name: string): Promise<string> {
    const file = join(dir, name);
    await writeFile(file, 'data');
    repo.register(file, name, 3, 4, 4);
    return repo.idOfPath(file)!;
  }

  function setup() {
    const notify = vi.fn();
    const lock = createLibraryRunLock();
    const decoder = { removeThumbnail: vi.fn(async () => undefined) };
    const trash = vi.fn(async (filePath: string) => rm(filePath));
    const park = vi.fn(async () => undefined);
    const remover = createLibraryRemover(repo, settings, decoder, notify, lock, { trash, park });
    return { remover, notify, lock, decoder, trash, park };
  }

  it('removes the entries, trashes their files, reports each and announces the removal', async () => {
    const a = await addBook('a.cbz');
    const b = await addBook('b.cbz');
    const { remover, notify, lock, trash } = setup();
    const onProgress = vi.fn();

    expect(await remover.removeMany([a, b, a, 'unknown'], true, onProgress)).toEqual({
      status: 'ok',
      removed: 2,
      filesDeleted: 2,
      filesFailed: 0,
      cancelled: false,
    });
    expect(repo.list()).toEqual([]);
    expect(await readdir(dir)).toEqual([]);
    expect(trash).toHaveBeenCalledWith(join(dir, 'a.cbz'));
    expect(notify).toHaveBeenCalledWith({ scope: 'library', removed: [a, b] });
    expect(notify).toHaveBeenCalledWith({ scope: 'readingLists' });
    expect(onProgress.mock.calls.map(([p]) => p.phase)).toEqual(['importing', 'importing', 'done']);
    expect(lock.tryStart('add')).not.toBeNull();
  });

  it('parks the files when they are not to be deleted, counting a failure', async () => {
    const a = await addBook('a.cbz');
    const { remover, park } = setup();
    park.mockRejectedValueOnce(new Error('busy'));

    expect(await remover.removeMany([a], false)).toMatchObject({ status: 'ok', removed: 1, filesDeleted: 0, filesFailed: 1 });
    expect(park).toHaveBeenCalledWith(join(dir, 'a.cbz'), '');
    expect(repo.list()).toEqual([]);
  });

  it('counts a file that cannot be trashed, its entry being removed anyway', async () => {
    const a = await addBook('a.cbz');
    const { remover, trash } = setup();
    trash.mockRejectedValueOnce(new Error('denied'));

    expect(await remover.removeMany([a], true)).toMatchObject({ status: 'ok', removed: 1, filesDeleted: 0, filesFailed: 1 });
    expect(repo.list()).toEqual([]);
  });

  it('refuses while another run holds the lock, removing nothing', async () => {
    const a = await addBook('a.cbz');
    const { remover, lock, notify } = setup();
    lock.tryStart('resync');

    expect(await remover.removeMany([a], true)).toMatchObject({ status: 'error' });
    expect(repo.get(a)).not.toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('stops before the next book when the run is cancelled, announcing what it removed', async () => {
    const a = await addBook('a.cbz');
    const b = await addBook('b.cbz');
    const { remover, lock, notify } = setup();
    expect(lock.cancel()).toBe(false);

    const onProgress = vi.fn((p: ScanProgress) => {
      if (p.phase === 'importing' && p.processed === 0) expect(lock.cancel()).toBe(true);
    });
    expect(await remover.removeMany([a, b], true, onProgress)).toEqual({
      status: 'ok',
      removed: 1,
      filesDeleted: 1,
      filesFailed: 0,
      cancelled: true,
    });
    expect(repo.get(a)).toBeNull();
    expect(repo.get(b)).not.toBeNull();
    expect(await readdir(dir)).toEqual(['b.cbz']);
    expect(notify).toHaveBeenCalledWith({ scope: 'library', removed: [a] });
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'done' }));
    expect(lock.cancel()).toBe(false);
    expect(lock.tryStart('add')).not.toBeNull();
  });

  it('parks into the organized folder when one is set', async () => {
    const organized = join(dir, 'organized');
    await mkdir(organized);
    settings.set('libraryOrganizationFolder', organized);
    const a = await addBook('a.cbz');
    const { remover, park } = setup();

    await remover.removeMany([a], false);
    expect(park).toHaveBeenCalledWith(join(dir, 'a.cbz'), organized);
  });
});
