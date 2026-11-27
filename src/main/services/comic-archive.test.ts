import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { imageMimeType, isPageEntry, MAX_WHOLE_FILE_SIZE, readWholeFile, sortPages } from './comic-archive';

describe('imageMimeType', () => {
  it('maps known image extensions', () => {
    expect(imageMimeType('page.jpg')).toBe('image/jpeg');
    expect(imageMimeType('page.PNG')).toBe('image/png');
  });

  it('returns undefined for unknown extensions', () => {
    expect(imageMimeType('notes.txt')).toBeUndefined();
  });
});

describe('isPageEntry', () => {
  it('accepts image entries', () => {
    expect(isPageEntry('page1.jpg')).toBe(true);
  });

  it('rejects hidden files', () => {
    expect(isPageEntry('.hidden.jpg')).toBe(false);
  });

  it('rejects macOS resource forks', () => {
    expect(isPageEntry('__MACOSX/._page1.jpg')).toBe(false);
  });

  it('rejects non-image entries', () => {
    expect(isPageEntry('ComicInfo.xml')).toBe(false);
  });
});

describe('sortPages', () => {
  it('sorts numbered pages in natural order', () => {
    expect(sortPages(['page10.jpg', 'page2.jpg', 'page1.jpg'])).toEqual([
      'page1.jpg',
      'page2.jpg',
      'page10.jpg',
    ]);
  });
});

describe('readWholeFile', () => {
  const directories: string[] = [];
  beforeAll(() => applyLanguage('fr'));
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });
  async function fileOf(size: number): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), 'skeudenn-whole-file-'));
    directories.push(directory);
    const file = path.join(directory, 'book.cbr');
    await writeFile(file, Buffer.alloc(size));
    return file;
  }

  it('reads a file up to the limit', async () => {
    expect((await readWholeFile(await fileOf(1024), 1024)).byteLength).toBe(1024);
  });

  it('refuses a file above the limit with a message naming its size and the limit', async () => {
    const file = await fileOf(3 * 1_048_576);
    await expect(readWholeFile(file, 2 * 1_048_576)).rejects.toThrow(/trop volumineux.*3 Mo.*2 Mo/);
  });

  it('lets a missing file fail as it did, for the caller to translate', async () => {
    await expect(readWholeFile('/does/not/exist.cbr')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('allows a gigabyte', () => {
    expect(MAX_WHOLE_FILE_SIZE).toBe(1024 ** 3);
  });
});
