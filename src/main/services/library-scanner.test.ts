import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import { isSupportedComicFile } from '../../shared/comic';
import { collectComicFiles, scanIntoLibrary } from './library-scanner';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

/** Builds a directory tree from `relative path -> contents` entries and returns its root. */
async function tree(files: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'tankobon-scan-'));
  roots.push(root);
  for (const file of files) {
    const fullPath = path.join(root, file);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, '');
  }
  return root;
}

describe('isSupportedComicFile', () => {
  it('accepts the supported extensions, whatever the case', () => {
    expect(isSupportedComicFile('a.cbz')).toBe(true);
    expect(isSupportedComicFile('a.CBR')).toBe(true);
    expect(isSupportedComicFile('a.Pdf')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSupportedComicFile('cover.jpg')).toBe(false);
    expect(isSupportedComicFile('ComicInfo.xml')).toBe(false);
    expect(isSupportedComicFile('README')).toBe(false);
    // Not an extension — the name merely contains the word.
    expect(isSupportedComicFile('cbz')).toBe(false);
  });
});

describe('collectComicFiles', () => {
  it('does not walk the .deletedByTankobon folder', async () => {
    const root = await tree(['a.cbz', '.deletedByTankobon/old.cbr', 'sub/.deletedByTankobon/old2.cbr']);
    expect(await collectComicFiles(root)).toEqual([path.join(root, 'a.cbz')]);
  });

  it('finds comics recursively and ignores everything else', async () => {
    const root = await tree([
      'tome-1.cbz',
      'cover.jpg',
      'serie/tome-2.cbr',
      'serie/notes.txt',
      'serie/bonus/artbook.pdf',
    ]);

    expect(await collectComicFiles(root)).toEqual([
      path.join(root, 'serie', 'bonus', 'artbook.pdf'),
      path.join(root, 'serie', 'tome-2.cbr'),
      path.join(root, 'tome-1.cbz'),
    ]);
  });

  it('returns an empty list for a directory without comics', async () => {
    expect(await collectComicFiles(await tree(['notes.txt']))).toEqual([]);
  });

  it('returns an empty list rather than throwing for a missing directory', async () => {
    expect(await collectComicFiles(path.join(tmpdir(), 'tankobon-does-not-exist'))).toEqual([]);
  });
});

describe('scanIntoLibrary', () => {
  it('applies the .nfo next to a new comic, and ignores an orphan one or one beside a known comic', async () => {
    const root = await tree(['a.cbz', 'b.cbz', 'orphan.nfo']);
    await writeFile(path.join(root, 'a.nfo'), '<title>Titre A</title><series>Serie</series>');
    await writeFile(path.join(root, 'b.nfo'), '<title>Titre B</title>');
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const repo = new LibraryRepository(db);
    repo.register(path.join(root, 'b.cbz'), 'b', 1, 1, 1);

    await scanIntoLibrary(repo, root, () => {}, async () => ({ pageCount: 1, fileCount: 1 }));

    const entries = repo.list();
    expect(entries.find((e) => e.path.endsWith('a.cbz'))).toMatchObject({ title: 'Titre A', series: 'Serie' });
    expect(entries.find((e) => e.path.endsWith('b.cbz'))?.title).toBe('b');
    expect(entries).toHaveLength(2);
  });

  it('does not count a file another run registered while it was being opened', async () => {
    const root = await tree(['a.cbz']);
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const repo = new LibraryRepository(db);

    const summary = await scanIntoLibrary(
      repo,
      root,
      () => undefined,
      async (filePath) => {
        repo.register(filePath, 'a', 1, 1, 1);
        return { pageCount: 12, fileCount: 13 };
      },
    );

    expect(summary).toMatchObject({ added: 0, skipped: 1, failed: 0 });
    expect(summary.addedEntries).toEqual([]);
  });

  it('registers what `inspect` reports, skips known files and counts a failing file apart', async () => {
    const root = await tree(['a.cbz', 'b.cbz', 'c.cbz']);
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const repo = new LibraryRepository(db);
    repo.register(path.join(root, 'a.cbz'), 'a', 1, 1, 1);
    const inspected: string[] = [];

    const summary = await scanIntoLibrary(
      repo,
      root,
      () => undefined,
      async (filePath) => {
        inspected.push(path.basename(filePath));
        if (filePath.endsWith('c.cbz')) {
          throw new Error('crashed');
        }
        return { pageCount: 12, fileCount: 13 };
      },
    );

    expect(summary).toMatchObject({ added: 1, skipped: 1, failed: 1, total: 3 });
    expect(summary.addedEntries.map((entry) => entry.path)).toHaveLength(1);
    expect(summary.failures).toEqual([{ path: path.join(root, 'c.cbz'), reason: 'crashed' }]);
    // The known file is never opened.
    expect(inspected).toEqual(['b.cbz', 'c.cbz']);
    expect(repo.list().find((entry) => entry.title === 'b')).toMatchObject({ pageCount: 12, fileCount: 13 });
  });

  it('stops between two files once its signal is aborted, keeping what it added', async () => {
    const root = await tree(['a.cbz', 'b.cbz', 'c.cbz']);
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const repo = new LibraryRepository(db);
    const controller = new AbortController();
    const inspected: string[] = [];

    const summary = await scanIntoLibrary(
      repo,
      root,
      () => undefined,
      async (filePath) => {
        inspected.push(path.basename(filePath));
        // Asked while the first file is being opened: that one still finishes.
        controller.abort();
        return { pageCount: 1, fileCount: 1 };
      },
      controller.signal,
    );

    expect(inspected).toEqual(['a.cbz']);
    expect(summary).toMatchObject({ added: 1, skipped: 0, failed: 0, total: 3, cancelled: true });
    expect(repo.list().map((entry) => entry.title)).toEqual(['a']);
  });

  it('says it was not stopped when it went through every file', async () => {
    const root = await tree(['a.cbz']);
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const summary = await scanIntoLibrary(new LibraryRepository(db), root, () => undefined, async () => ({ pageCount: 1, fileCount: 1 }));
    expect(summary.cancelled).toBe(false);
  });
});
