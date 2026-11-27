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
import { createLibraryRemover, removeEntry, type EntryRemovalContext } from './library-removal';

applyLanguage('fr');

describe('createLibraryRemover', () => {
  let dir: string;
  let repo: LibraryRepository;
  let settings: SettingsRepository;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-removal-'));
    const db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new LibraryRepository(db);
    settings = new SettingsRepository(db);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function addBook(name: string, { onDisk = true } = {}): Promise<string> {
    const file = join(dir, name);
    if (onDisk) await writeFile(file, 'data');
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

  it('removes a book whose file is already gone, counting it neither deleted nor failed', async () => {
    const a = await addBook('a.cbz', { onDisk: false });
    const b = await addBook('b.cbz', { onDisk: false });
    const { remover, trash, park } = setup();

    expect(await remover.removeMany([a], true)).toMatchObject({ status: 'ok', removed: 1, filesDeleted: 0, filesFailed: 0 });
    expect(await remover.removeMany([b], false)).toMatchObject({ status: 'ok', removed: 1, filesDeleted: 0, filesFailed: 0 });
    expect(trash).not.toHaveBeenCalled();
    expect(park).not.toHaveBeenCalled();
    expect(repo.list()).toEqual([]);
  });

  it('removes the entry of a file that is not a comic but leaves the file, counting it failed', async () => {
    const a = await addBook('notes.txt');
    const { remover, trash, park } = setup();

    expect(await remover.removeMany([a], true)).toMatchObject({ status: 'ok', removed: 1, filesDeleted: 0, filesFailed: 1 });
    expect(repo.get(a)).toBeNull();
    expect(await readdir(dir)).toEqual(['notes.txt']);
    expect(trash).not.toHaveBeenCalled();
    expect(park).not.toHaveBeenCalled();
  });

  describe('removeEntry', () => {
    function context(overrides: Partial<EntryRemovalContext['files']> = {}) {
      const decoder = { removeThumbnail: vi.fn(async () => undefined) };
      const trash = vi.fn(async (filePath: string) => rm(filePath));
      const park = vi.fn(async (comicPath: string) => rm(comicPath));
      const files: EntryRemovalContext['files'] = { trash, park, ...overrides };
      const removal: EntryRemovalContext = { repo, decoder, files, organizedRoot: '' };
      return { removal, decoder, trash, park };
    }

    it('does nothing for an unknown id', async () => {
      const { removal, decoder, trash } = context();
      expect(await removeEntry(removal, 'unknown', true)).toEqual({ status: 'unknown' });
      expect(decoder.removeThumbnail).not.toHaveBeenCalled();
      expect(trash).not.toHaveBeenCalled();
    });

    it('trashes the comic and its sidecars after removing the entry and its thumbnail', async () => {
      const a = await addBook('a.cbz');
      await writeFile(join(dir, 'a.cover.webp'), 'cover');
      await writeFile(join(dir, 'a.nfo'), 'nfo');
      const { removal, decoder, trash } = context();

      expect(await removeEntry(removal, a, true)).toEqual({ status: 'trashed', path: join(dir, 'a.cbz') });
      expect(repo.get(a)).toBeNull();
      expect(decoder.removeThumbnail).toHaveBeenCalledWith(join(dir, 'a.cbz'));
      expect(trash).toHaveBeenCalledTimes(3);
      expect(await readdir(dir)).toEqual([]);
    });

    it('parks the comic in the organized folder of the context', async () => {
      const a = await addBook('a.cbz');
      const { removal, park, trash } = context();
      removal.organizedRoot = join(dir, 'organized');

      expect(await removeEntry(removal, a, false)).toEqual({ status: 'parked', path: join(dir, 'a.cbz') });
      expect(park).toHaveBeenCalledWith(join(dir, 'a.cbz'), join(dir, 'organized'));
      expect(trash).not.toHaveBeenCalled();
    });

    it('parks through parkComic() when no parking is given', async () => {
      const a = await addBook('a.cbz');
      const { removal } = context();
      removal.files = { trash: removal.files.trash };

      expect(await removeEntry(removal, a, false)).toMatchObject({ status: 'parked' });
      expect(await readdir(join(dir, '.deletedBySkeudenn'))).toEqual(['a.cbz']);
    });

    it('takes a file already gone as removed, without trashing or parking it', async () => {
      const a = await addBook('a.cbz', { onDisk: false });
      const b = await addBook('b.cbz', { onDisk: false });
      const { removal, trash, park } = context();

      expect(await removeEntry(removal, a, true)).toEqual({ status: 'missing', path: join(dir, 'a.cbz') });
      expect(await removeEntry(removal, b, false)).toEqual({ status: 'missing', path: join(dir, 'b.cbz') });
      expect(trash).not.toHaveBeenCalled();
      expect(park).not.toHaveBeenCalled();
      expect(repo.list()).toEqual([]);
    });

    it('takes a file that disappears while being trashed as trashed', async () => {
      const a = await addBook('a.cbz');
      const gone = Object.assign(new Error('gone'), { code: 'ENOENT' });
      const { removal } = context({ trash: vi.fn(async () => Promise.reject(gone)) });

      expect(await removeEntry(removal, a, true)).toMatchObject({ status: 'trashed' });
    });

    it('leaves a file that is not a comic untouched, the entry being removed', async () => {
      const a = await addBook('secret.docx');
      const b = await addBook('other.txt');
      const { removal, trash, park } = context();

      const trashed = await removeEntry(removal, a, true);
      expect(trashed).toMatchObject({ status: 'fileFailed' });
      expect(trashed.status === 'fileFailed' && trashed.message).toContain('secret.docx');
      const parked = await removeEntry(removal, b, false);
      expect(parked).toMatchObject({ status: 'fileFailed' });
      expect(parked.status === 'fileFailed' && parked.message).toContain('other.txt');
      expect(repo.list()).toEqual([]);
      expect(trash).not.toHaveBeenCalled();
      expect(park).not.toHaveBeenCalled();
      expect((await readdir(dir)).sort()).toEqual(['other.txt', 'secret.docx']);
    });

    it('reports a file that cannot be trashed or parked, with the reason', async () => {
      const a = await addBook('a.cbz');
      const b = await addBook('b.cbz');
      const { removal } = context({
        trash: vi.fn(async () => Promise.reject(new Error('denied'))),
        park: vi.fn(async () => Promise.reject(new Error('busy'))),
      });

      const trashed = await removeEntry(removal, a, true);
      expect(trashed).toMatchObject({ status: 'fileFailed' });
      expect(trashed.status === 'fileFailed' && trashed.message).toContain('denied');
      const parked = await removeEntry(removal, b, false);
      expect(parked).toMatchObject({ status: 'fileFailed' });
      expect(parked.status === 'fileFailed' && parked.message).toContain('busy');
      expect(repo.list()).toEqual([]);
      expect((await readdir(dir)).sort()).toEqual(['a.cbz', 'b.cbz']);
    });
  });

  describe('removeOne', () => {
    it('removes the entry, trashes its file, announces it and releases the lock', async () => {
      const a = await addBook('a.cbz');
      const { remover, notify, lock, decoder, trash } = setup();

      expect(await remover.removeOne(a, true)).toEqual({ status: 'ok' });
      expect(repo.get(a)).toBeNull();
      expect(decoder.removeThumbnail).toHaveBeenCalledWith(join(dir, 'a.cbz'));
      expect(trash).toHaveBeenCalledWith(join(dir, 'a.cbz'));
      expect(notify).toHaveBeenCalledWith({ scope: 'library', removed: [a] });
      expect(notify).toHaveBeenCalledWith({ scope: 'readingLists' });
      expect(lock.tryStart('add')).not.toBeNull();
    });

    it('parks the file into the organized folder when it is not to be deleted', async () => {
      const organized = join(dir, 'organized');
      await mkdir(organized);
      settings.set('libraryOrganizationFolder', organized);
      const a = await addBook('a.cbz');
      const { remover, park, trash } = setup();

      expect(await remover.removeOne(a, false)).toEqual({ status: 'ok' });
      expect(park).toHaveBeenCalledWith(join(dir, 'a.cbz'), organized);
      expect(trash).not.toHaveBeenCalled();
    });

    it('is fine with a file already gone and with an unknown id, announcing the removal', async () => {
      const a = await addBook('a.cbz', { onDisk: false });
      const { remover, notify, trash } = setup();

      expect(await remover.removeOne(a, true)).toEqual({ status: 'ok' });
      expect(await remover.removeOne('unknown', true)).toEqual({ status: 'ok' });
      expect(trash).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith({ scope: 'library', removed: ['unknown'] });
    });

    it('returns an error when the file stays, the entry being removed and the lock released', async () => {
      const a = await addBook('a.cbz');
      const b = await addBook('notes.txt');
      const { remover, lock, trash, notify } = setup();
      trash.mockRejectedValueOnce(new Error('denied'));

      expect(await remover.removeOne(a, true)).toEqual({ status: 'error', message: expect.stringContaining('denied') });
      expect(await remover.removeOne(b, true)).toEqual({ status: 'error', message: expect.stringContaining('notes.txt') });
      expect(repo.list()).toEqual([]);
      expect((await readdir(dir)).sort()).toEqual(['a.cbz', 'notes.txt']);
      expect(notify).toHaveBeenCalledWith({ scope: 'library', removed: [b] });
      expect(lock.tryStart('add')).not.toBeNull();
    });

    it('refuses while another run holds the lock, removing nothing', async () => {
      const a = await addBook('a.cbz');
      const { remover, lock, notify, trash } = setup();
      lock.tryStart('organize');

      expect(await remover.removeOne(a, true)).toEqual({ status: 'error', message: lock.busyMessage() });
      expect(repo.get(a)).not.toBeNull();
      expect(trash).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    });

    it('holds the lock while it removes', async () => {
      const a = await addBook('a.cbz');
      const { remover, lock, trash } = setup();
      let taken: AbortSignal | null | undefined;
      trash.mockImplementationOnce(async (filePath: string) => {
        taken = lock.tryStart('add');
        await rm(filePath);
      });

      expect(await remover.removeOne(a, true)).toEqual({ status: 'ok' });
      expect(taken).toBeNull();
    });
  });
});
