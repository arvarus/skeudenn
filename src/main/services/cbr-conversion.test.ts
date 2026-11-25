import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { DELETED_BY_TANKOBON_FOLDER, type ScanProgress } from '../../shared/library';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { SettingsRepository } from '../db/settings-repository';
import { createCbrConverter, type ConversionDecoder } from './cbr-conversion';
import { FOLDER_LINK_KINDS, linkFolderOrSkip } from '../test-links';
import { createLibraryRunLock } from './library-organization';

applyLanguage('fr');

describe('createCbrConverter', () => {
  let root: string;
  let repo: LibraryRepository;
  let settings: SettingsRepository;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tankobon-cbr-conversion-'));
    const db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new LibraryRepository(db);
    settings = new SettingsRepository(db);
    settings.set('libraryOrganization', 'always');
    settings.set('libraryOrganizationFolder', root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function setup(convert?: ConversionDecoder['convertCbr'], lock = createLibraryRunLock()) {
    const notify = vi.fn();
    const decoder: ConversionDecoder = {
      convertCbr: vi.fn(convert ?? (async (_from: string, to: string) => {
        await writeFile(to, 'cbz!');
        return { pageCount: 3, fileCount: 4 };
      })),
      removeThumbnail: vi.fn(async () => undefined),
    };
    return { converter: createCbrConverter(repo, settings, decoder, notify, lock), decoder, notify, lock };
  }

  async function addBook(relative: string, content = 'cbr!'): Promise<string> {
    const file = join(root, relative);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, content);
    repo.register(file, 'book', 3, 4, content.length);
    return file;
  }

  it('converts the CBR of the organized folder, keeping the entry and parking the original', async () => {
    const cbr = await addBook('Serie/book.cbr');
    await addBook('Serie/other.cbz');
    const id = repo.idOfPath(cbr)!;
    const { converter, notify } = setup();

    expect(await converter.count()).toMatchObject({ status: 'ok', count: 1, deletedFiles: 0 });
    expect(await converter.convert()).toEqual({ status: 'ok', converted: 1, failed: 0, cancelled: false });

    const cbz = join(root, 'Serie', 'book.cbz');
    expect(repo.get(id)).toMatchObject({ path: cbz, fileCount: 4, fileSize: 4 });
    expect(await readdir(join(root, 'Serie'))).toContain('book.cbz');
    expect(await readdir(join(root, 'Serie'))).not.toContain('book.cbr');
    expect(await readdir(join(root, DELETED_BY_TANKOBON_FOLDER))).toEqual(['book.cbr']);
    expect(notify).toHaveBeenCalledWith({ scope: 'library' });
    expect(await converter.count()).toMatchObject({ count: 0, deletedFiles: 1, deletedBytes: 4 });
  });

  // A name that merely starts with two dots is inside the folder (the default layout names a book's folder after its file).
  it('converts a CBR in a folder whose name starts with two dots', async () => {
    await addBook('Serie (a)/x.cbr');
    await addBook('...Et alors (b)/y.cbr');
    const { converter } = setup();

    expect(await converter.count()).toMatchObject({ status: 'ok', count: 2 });
    expect(await converter.convert()).toEqual({ status: 'ok', converted: 2, failed: 0, cancelled: false });
    expect(await readdir(join(root, '...Et alors (b)'))).toEqual(['y.cbz']);
    expect(repo.get(repo.idOfPath(join(root, '...Et alors (b)', 'y.cbz'))!)).not.toBeNull();
  });

  it('ignores a CBR outside the organized folder', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'tankobon-cbr-outside-'));
    try {
      repo.register(join(outside, 'x.cbr'), 'x', 1, 1, 1);
      const { converter } = setup();
      expect(await converter.count()).toMatchObject({ count: 0 });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('leaves the book as it was when the conversion fails', async () => {
    const cbr = await addBook('book.cbr');
    const id = repo.idOfPath(cbr)!;
    const { converter, notify } = setup(async () => {
      throw new Error('unreadable');
    });

    expect(await converter.convert()).toEqual({ status: 'ok', converted: 0, failed: 1, cancelled: false });
    expect(repo.get(id)?.path).toBe(cbr);
    expect(await readdir(root)).toEqual(['book.cbr']);
    expect(notify).not.toHaveBeenCalled();
  });

  // The CBR is already parked when the entry is pointed at the CBZ: a database that refuses or throws must not lose it.
  it.each([
    ['refuses the new path', () => false],
    ['throws while writing the new path', () => {
      throw new Error('database is locked');
    }],
  ])('puts the CBR back when the database %s', async (_label, updatePath) => {
    const cbr = await addBook('Serie/book.cbr');
    const id = repo.idOfPath(cbr)!;
    vi.spyOn(repo, 'updatePath').mockImplementation(updatePath);
    const { converter, notify } = setup();

    expect(await converter.convert()).toEqual({ status: 'ok', converted: 0, failed: 1, cancelled: false });
    expect(repo.get(id)?.path).toBe(cbr);
    expect(await readdir(join(root, 'Serie'))).toEqual(['book.cbr']);
    expect(await readdir(join(root, DELETED_BY_TANKOBON_FOLDER)).catch(() => [])).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  // `updateFileStats()` runs once the entry names the CBZ: that file is the book then, and the CBR stays parked.
  it('keeps the CBZ when a write after pointing the entry at it throws', async () => {
    const cbr = await addBook('Serie/book.cbr');
    const id = repo.idOfPath(cbr)!;
    vi.spyOn(repo, 'updateFileStats').mockImplementation(() => {
      throw new Error('database is locked');
    });
    const { converter } = setup();

    expect(await converter.convert()).toMatchObject({ converted: 0, failed: 1 });
    expect(repo.get(id)?.path).toBe(join(root, 'Serie', 'book.cbz'));
    expect(await readdir(join(root, 'Serie'))).toEqual(['book.cbz']);
    expect(await readdir(join(root, DELETED_BY_TANKOBON_FOLDER))).toEqual(['book.cbr']);
  });

  it('picks another name when the CBZ already exists', async () => {
    const cbr = await addBook('book.cbr');
    await writeFile(join(root, 'book.cbz'), 'someone else');
    const { converter, decoder } = setup();

    await converter.convert();

    expect(decoder.convertCbr).toHaveBeenCalledWith(cbr, join(root, 'book (2).cbz'));
  });

  it('refuses when the organization is off', async () => {
    settings.set('libraryOrganization', 'off');
    const { converter } = setup();
    expect(await converter.count()).toMatchObject({ status: 'error' });
    expect(await converter.convert()).toMatchObject({ status: 'error' });
  });

  it('empties .deletedByTankobon for good', async () => {
    await mkdir(join(root, DELETED_BY_TANKOBON_FOLDER));
    await writeFile(join(root, DELETED_BY_TANKOBON_FOLDER, 'a.cbr'), '12345');
    await writeFile(join(root, DELETED_BY_TANKOBON_FOLDER, 'b.cbr'), '123');
    const { converter } = setup();

    expect(await converter.emptyDeleted()).toEqual({ status: 'ok', deleted: 2, bytesFreed: 8, failed: 0, cancelled: false });
    expect(await readdir(root)).toEqual([]);
  });

  it('automatically empties only what has been parked for long enough', async () => {
    await mkdir(join(root, DELETED_BY_TANKOBON_FOLDER));
    await writeFile(join(root, DELETED_BY_TANKOBON_FOLDER, 'a.cbr'), '12345');
    const { converter } = setup();
    const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    expect(await converter.emptyDeletedOlderThan(20, inTenDays)).toEqual({ status: 'ok', deleted: 0, bytesFreed: 0, failed: 0, cancelled: false });
    expect(await readdir(join(root, DELETED_BY_TANKOBON_FOLDER))).toEqual(['a.cbr']);

    expect(await converter.emptyDeletedOlderThan(5, inTenDays)).toEqual({ status: 'ok', deleted: 1, bytesFreed: 5, failed: 0, cancelled: false });
    expect(await readdir(root)).toEqual([]);
  });

  it('does not empty automatically when the organization is off', async () => {
    settings.set('libraryOrganization', 'off');
    const { converter } = setup();
    expect(await converter.emptyDeletedOlderThan(1)).toBeNull();
  });

  it('stops a conversion before the next book when the run is cancelled', async () => {
    await addBook('A/one.cbr');
    await addBook('B/two.cbr');
    const { converter, notify, lock } = setup();
    expect(lock.cancel()).toBe(false);

    // Asked while the first book is converted: that one is finished, the next one is left a CBR.
    const onProgress = vi.fn((p: ScanProgress) => {
      if (p.phase === 'importing' && p.processed === 0) expect(lock.cancel()).toBe(true);
    });
    expect(await converter.convert(onProgress)).toEqual({ status: 'ok', converted: 1, failed: 0, cancelled: true });
    expect(repo.list().filter((entry) => entry.path.endsWith('.cbz'))).toHaveLength(1);
    expect(repo.list().filter((entry) => entry.path.endsWith('.cbr'))).toHaveLength(1);
    expect(notify).toHaveBeenCalledWith({ scope: 'library' });
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'done' }));
    expect(lock.tryStart('convert')).not.toBeNull();
  });

  it('empties .deletedByTankobon item by item, reporting each, and stops when the run is cancelled', async () => {
    await mkdir(join(root, DELETED_BY_TANKOBON_FOLDER));
    await writeFile(join(root, DELETED_BY_TANKOBON_FOLDER, 'a.cbr'), '12345');
    await writeFile(join(root, DELETED_BY_TANKOBON_FOLDER, 'b.cbr'), '123');
    const { converter, lock } = setup();

    const onProgress = vi.fn((p: ScanProgress) => {
      if (p.phase === 'importing' && p.processed === 0) expect(lock.cancel()).toBe(true);
    });
    expect(await converter.emptyDeleted(onProgress)).toMatchObject({ status: 'ok', deleted: 1, failed: 0, cancelled: true });
    expect(await readdir(join(root, DELETED_BY_TANKOBON_FOLDER))).toHaveLength(1);
    expect(onProgress.mock.calls.map(([p]) => p.phase)).toEqual(['importing', 'done']);
    expect(onProgress.mock.calls[0][0]).toMatchObject({ processed: 0, total: 2 });
    expect(lock.tryStart('convert')).not.toBeNull();
  });

  describe.for(FOLDER_LINK_KINDS)('with a .deletedByTankobon that is a link (%s) to a folder outside', (kind) => {
    let outside: string;
    beforeEach(async () => {
      outside = await mkdtemp(join(tmpdir(), 'tankobon-cbr-conversion-outside-'));
      await writeFile(join(outside, 'precious.docx'), 'precious');
      await mkdir(join(outside, 'Photos'));
      await writeFile(join(outside, 'Photos', 'a.jpg'), 'x');
    });
    afterEach(async () => {
      await rm(outside, { recursive: true, force: true });
    });

    const link = (skip: () => void) => linkFolderOrSkip(outside, join(root, DELETED_BY_TANKOBON_FOLDER), kind, skip);
    const untouched = async () => {
      expect((await readdir(outside)).sort()).toEqual(['Photos', 'precious.docx']);
      expect(await readdir(join(outside, 'Photos'))).toEqual(['a.jpg']);
    };

    it('neither empties nor sizes it', async ({ skip }) => {
      await link(skip);
      const { converter } = setup();
      const inAYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      expect(await converter.count()).toMatchObject({ status: 'ok', deletedFiles: 0, deletedBytes: 0 });
      expect(await converter.emptyDeleted()).toEqual({ status: 'ok', deleted: 0, bytesFreed: 0, failed: 0, cancelled: false });
      expect(await converter.emptyDeletedOlderThan(1, inAYear)).toEqual({ status: 'ok', deleted: 0, bytesFreed: 0, failed: 0, cancelled: false });
      await untouched();
    });

    it('converts nothing: the book fails and stays a CBR', async ({ skip }) => {
      await link(skip);
      const cbr = await addBook('Serie/book.cbr');
      const id = repo.idOfPath(cbr)!;
      const { converter, decoder } = setup();

      expect(await converter.convert()).toEqual({ status: 'ok', converted: 0, failed: 1, cancelled: false });
      expect(decoder.convertCbr).not.toHaveBeenCalled();
      expect(repo.get(id)?.path).toBe(cbr);
      expect(await readdir(join(root, 'Serie'))).toEqual(['book.cbr']);
      await untouched();
    });
  });
});
