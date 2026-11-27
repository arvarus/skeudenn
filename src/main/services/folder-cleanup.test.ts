import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { DELETED_BY_SKEUDENN_FOLDER, type ScanProgress } from '../../shared/library';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import { createFolderCleaner, findOrphanFolders } from './folder-cleanup';
import { FOLDER_LINK_KINDS, linkFolderOrSkip } from '../test-links';
import { createLibraryRunLock } from './library-organization';

applyLanguage('fr');

describe('folder cleanup', () => {
  let root: string;
  let settings: SettingsRepository;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'skeudenn-folder-cleanup-'));
    const db = new DatabaseSync(':memory:');
    migrate(db);
    settings = new SettingsRepository(db);
    settings.set('libraryOrganization', 'always');
    settings.set('libraryOrganizationFolder', root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function file(relative: string): Promise<void> {
    const target = join(root, relative);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, 'x');
  }

  it('lists folders with no book, only sidecars, covers and other orphans, outermost first', async () => {
    await file('Alive/book.cbz');
    await file('Alive/book.nfo');
    await file('Dead/book.nfo');
    await file('Dead/book.cover.webp');
    await file('Dead/Sub/cover.JPG');
    await file('Mixed/notes.txt');
    await file('Mixed/Gone/book.nfo');
    await mkdir(join(root, 'Empty'));
    expect((await findOrphanFolders(root)).map((f) => f.slice(root.length + 1)).sort()).toEqual([
      'Dead',
      'Empty',
      join('Mixed', 'Gone'),
    ]);
  });

  it('never lists the root nor .deletedBySkeudenn', async () => {
    await file(`${DELETED_BY_SKEUDENN_FOLDER}/old.nfo`);
    expect(await findOrphanFolders(root)).toEqual([]);
  });

  it('ignores the hidden folders, whatever their name', async () => {
    await file('.deletedByTankobon/old.nfo'); // the parking folder of an earlier version
    await file(`${DELETED_BY_SKEUDENN_FOLDER}/old.nfo`);
    await file('.cache/x.cbz');
    await file('.git/config');
    await file('Dead/book.nfo');
    expect((await findOrphanFolders(root)).map((f) => f.slice(root.length + 1))).toEqual(['Dead']);
  });

  it('keeps a folder that holds a hidden folder, instead of moving the hidden content with it', async () => {
    await file('Serie/book.nfo');
    await file('Serie/.hidden/keep.txt');
    expect(await findOrphanFolders(root)).toEqual([]);
  });

  it('leaves an old .deletedByTankobon and the parking folder alone', async () => {
    await file('.deletedByTankobon/Old/book.nfo');
    await file(`${DELETED_BY_SKEUDENN_FOLDER}/Parked/book.nfo`);
    await file('Dead/book.nfo');
    const cleaner = createFolderCleaner(settings, createLibraryRunLock());
    expect(await cleaner.count()).toMatchObject({ status: 'ok', count: 1 });
    expect(await cleaner.clean()).toEqual({ status: 'ok', moved: 1, failed: 0, cancelled: false });
    expect((await readdir(join(root, '.deletedByTankobon'))).sort()).toEqual(['Old']);
    expect((await readdir(join(root, DELETED_BY_SKEUDENN_FOLDER))).sort()).toEqual(['Dead', 'Parked']);
  });

  it('moves the orphans to .deletedBySkeudenn, renaming on a collision', async () => {
    await file('Alive/book.cbz');
    await file('Dead/book.nfo');
    await file(`${DELETED_BY_SKEUDENN_FOLDER}/Dead/older.nfo`);
    const cleaner = createFolderCleaner(settings, createLibraryRunLock());
    expect(await cleaner.count()).toMatchObject({ status: 'ok', count: 1 });
    expect(await cleaner.clean()).toEqual({ status: 'ok', moved: 1, failed: 0, cancelled: false });
    expect((await readdir(root)).sort()).toEqual([DELETED_BY_SKEUDENN_FOLDER, 'Alive']);
    expect((await readdir(join(root, DELETED_BY_SKEUDENN_FOLDER))).sort()).toEqual(['Dead', 'Dead (2)']);
    expect(await cleaner.count()).toMatchObject({ count: 0 });
  });

  it('refuses when the organization is off or another run holds the lock', async () => {
    const lock = createLibraryRunLock();
    const cleaner = createFolderCleaner(settings, lock);
    lock.tryStart('resync');
    expect(await cleaner.clean()).toMatchObject({ status: 'error' });
    lock.end();
    settings.set('libraryOrganization', 'off');
    expect(await cleaner.count()).toMatchObject({ status: 'error' });
  });

  it('stops before the next folder when the run is cancelled', async () => {
    await file('Dead/book.nfo');
    await file('Gone/book.nfo');
    const lock = createLibraryRunLock();
    const cleaner = createFolderCleaner(settings, lock);

    const onProgress = vi.fn((p: ScanProgress) => {
      if (p.phase === 'importing' && p.processed === 0) expect(lock.cancel()).toBe(true);
    });
    expect(await cleaner.clean(onProgress)).toEqual({ status: 'ok', moved: 1, failed: 0, cancelled: true });
    expect(await readdir(join(root, DELETED_BY_SKEUDENN_FOLDER))).toHaveLength(1);
    expect(await cleaner.count()).toMatchObject({ count: 1 });
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'done' }));
    expect(lock.tryStart('folders')).not.toBeNull();
  });

  it.for(FOLDER_LINK_KINDS)('moves nothing into a .deletedBySkeudenn that is a link (%s)', async (kind, { skip }) => {
    const outside = await mkdtemp(join(tmpdir(), 'skeudenn-folder-cleanup-outside-'));
    try {
      await linkFolderOrSkip(outside, join(root, DELETED_BY_SKEUDENN_FOLDER), kind, skip);
      await file('Dead/book.nfo');
      const cleaner = createFolderCleaner(settings, createLibraryRunLock());

      expect(await cleaner.clean()).toEqual({ status: 'ok', moved: 0, failed: 1, cancelled: false });
      expect(await readdir(join(root, 'Dead'))).toEqual(['book.nfo']);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
