import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import { ZipFile } from 'yazl';
import { describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import type { ScanProgress } from '../../shared/library';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { listJunkEntries, removeEntries } from './cbz-cleaner';
import { createLibraryCleaner, groupJunk, junkExtension, type CleanupDecoder } from './library-cleanup';
import { createLibraryRunLock } from './library-organization';

applyLanguage('fr');

function repository(): LibraryRepository {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return new LibraryRepository(db);
}

const noProgress = (progress: ScanProgress): void => void progress;

describe('junkExtension', () => {
  it('reads the lower-cased extension of the file name, not of its folders', () => {
    expect(junkExtension('ComicInfo.XML')).toBe('.xml');
    expect(junkExtension('notes.d/readme')).toBe('');
    expect(junkExtension('__MACOSX/.DS_Store')).toBe('');
    expect(junkExtension('a/b.tar.gz')).toBe('.gz');
  });
});

describe('groupJunk', () => {
  it('groups by extension, counting files and books, heaviest first', () => {
    const groups = groupJunk([
      { id: '1', path: '/a.cbz', junk: [{ name: 'ComicInfo.xml', size: 10 }, { name: 'x/Thumbs.db', size: 500 }] },
      { id: '2', path: '/b.cbz', junk: [{ name: 'ComicInfo.xml', size: 20 }, { name: 'other.xml', size: 1 }] },
    ]);
    expect(groups).toEqual([
      { extension: '.db', files: 1, books: 1, size: 500, examples: ['Thumbs.db'], details: [{ name: 'a.cbz', files: ['x/Thumbs.db'] }] },
      { extension: '.xml', files: 3, books: 2, size: 31, examples: ['ComicInfo.xml', 'other.xml'],
        details: [
          { name: 'a.cbz', files: ['ComicInfo.xml'] },
          { name: 'b.cbz', files: ['ComicInfo.xml', 'other.xml'] },
        ],
      },
    ]);
  });
});

describe('createLibraryCleaner', () => {
  function setup() {
    const repo = repository();
    // The files don't exist on disk: only the decoder is faked, `stat` is the one thing it can't be.
    repo.register('/lib/a.cbz', 'a', 10, 5, 100);
    repo.register('/lib/b.cbr', 'b', 10, 5, 100);
    repo.register('/lib/c.cbz', 'c', 10, 5, 100);
    const decoder: CleanupDecoder = {
      listJunk: vi.fn(async (file: string) => {
        if (file.endsWith('.cbr')) return null;
        if (file === '/lib/c.cbz') return [];
        return [{ name: 'ComicInfo.xml', size: 10 }, { name: 'Thumbs.db', size: 20 }];
      }),
      cleanArchive: vi.fn(async () => ({ fileCount: 3 })),
    };
    const notify = vi.fn();
    return { repo, decoder, notify, cleaner: createLibraryCleaner(repo, decoder, notify) };
  }

  it('summarizes the junk without touching any archive', async () => {
    const { cleaner, decoder } = setup();
    const result = await cleaner.analyze([], noProgress);
    expect(result).toMatchObject({ status: 'ok', booksWithJunk: 1, skipped: 1, failed: 0, scanned: 2 });
    expect(result.status === 'ok' && result.groups.map((group) => group.extension)).toEqual(['.db', '.xml']);
    expect(decoder.cleanArchive).not.toHaveBeenCalled();
  });

  it('counts a book that cannot be read as failed', async () => {
    const { cleaner, decoder } = setup();
    // Targeted by path: the books are registered at the same instant, so `list()` order is not stable.
    const listJunk = vi.mocked(decoder.listJunk).getMockImplementation()!;
    vi.mocked(decoder.listJunk).mockImplementation(async (file: string) => {
      if (file === '/lib/a.cbz') throw new Error('broken');
      return listJunk(file);
    });
    expect(await cleaner.analyze([], noProgress)).toMatchObject({ status: 'ok', failed: 1, booksWithJunk: 0 });
  });

  it('only analyzes the books asked for', async () => {
    const { cleaner, repo, decoder } = setup();
    const id = repo.idOfPath('/lib/c.cbz')!;
    await cleaner.analyze([id], noProgress);
    expect(decoder.listJunk).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown token and a token used twice', async () => {
    const { cleaner } = setup();
    expect(await cleaner.apply('nope', [], noProgress)).toMatchObject({ status: 'error' });
    const analysis = await cleaner.analyze([], noProgress);
    if (analysis.status !== 'ok') throw new Error('analysis failed');
    await cleaner.apply(analysis.token, [], noProgress);
    expect(await cleaner.apply(analysis.token, [], noProgress)).toMatchObject({ status: 'error' });
  });

  it('refuses to rewrite while another run holds the library lock, keeping the analysis', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tankobon-cleanup-lock-'));
    const file = join(dir, 'a.cbz');
    await writeFile(file, 'x');
    const repo = repository();
    repo.register(file, 'a', 10, 5, 100);
    const decoder: CleanupDecoder = {
      listJunk: vi.fn(async () => [{ name: 'Thumbs.db', size: 10 }]),
      cleanArchive: vi.fn(async () => ({ fileCount: 1 })),
    };
    const lock = createLibraryRunLock();
    const cleaner = createLibraryCleaner(repo, decoder, vi.fn(), lock);
    const analysis = await cleaner.analyze([], noProgress);
    if (analysis.status !== 'ok') throw new Error('analysis failed');

    lock.tryStart('resync');
    expect(await cleaner.apply(analysis.token, [], noProgress)).toMatchObject({ status: 'error' });
    expect(decoder.cleanArchive).not.toHaveBeenCalled();

    lock.end();
    await cleaner.apply(analysis.token, [], noProgress);
    expect(decoder.cleanArchive).toHaveBeenCalled();
    // Released after the run.
    expect(lock.tryStart('add')).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('rewrites the archives except the kinds kept, and updates the entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tankobon-cleanup-'));
    try {
      const file = join(dir, 'real.cbz');
      const zip = new ZipFile();
      zip.addBuffer(Buffer.alloc(2_000, 1), '001.jpg');
      zip.addBuffer(Buffer.alloc(4_000, 7), 'junk.bin');
      zip.addBuffer(Buffer.from('<ComicInfo/>'), 'ComicInfo.xml');
      zip.end();
      await pipeline(zip.outputStream, createWriteStream(file));

      const repo = repository();
      repo.register(file, 'real', 1, 3, 0);
      const notify = vi.fn();
      const decoder: CleanupDecoder = {
        listJunk: listJunkEntries,
        cleanArchive: removeEntries,
      };
      const cleaner = createLibraryCleaner(repo, decoder, notify);

      const analysis = await cleaner.analyze([], noProgress);
      if (analysis.status !== 'ok') throw new Error('analysis failed');
      expect(analysis.groups.map((group) => group.extension).sort()).toEqual(['.bin', '.xml']);

      const result = await cleaner.apply(analysis.token, ['.xml'], noProgress);
      expect(result).toEqual({ status: 'ok', cleaned: 1, filesRemoved: 1, bytesFreed: expect.any(Number), failed: 0 });
      expect((await listJunkEntries(file)).map((entry) => entry.name)).toEqual(['ComicInfo.xml']);
      expect(repo.list()[0]).toMatchObject({ fileCount: 2 });
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ scope: 'library' }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
