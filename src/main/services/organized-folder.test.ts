import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { DELETED_BY_SKEUDENN_FOLDER } from '../../shared/library';
import { FOLDER_LINK_KINDS, linkFolderOrSkip } from '../test-links';
import {
  firstFreeName,
  isDirectory,
  organizedFolderProblem,
  pathExists,
  requireTrashFolder,
  usableTrashFolder,
} from './organized-folder';

beforeAll(() => applyLanguage('fr'));

describe('organized-folder', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'skeudenn-organized-folder-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('tells a file, a directory and nothing apart', async () => {
    await writeFile(path.join(root, 'a.txt'), '');
    expect(await pathExists(path.join(root, 'a.txt'))).toBe(true);
    expect(await isDirectory(path.join(root, 'a.txt'))).toBe(false);
    expect(await isDirectory(root)).toBe(true);
    expect(await pathExists(path.join(root, 'missing'))).toBe(false);
    expect(await isDirectory(path.join(root, 'missing'))).toBe(false);
  });

  it('finds no problem with a folder that is there and an organization that is on', async () => {
    expect(await organizedFolderProblem('ask', root)).toBeNull();
    expect(await organizedFolderProblem('always', root)).toBeNull();
  });

  it('reports an organization that is off, has no folder, or whose folder is gone', async () => {
    expect(await organizedFolderProblem('off', root)).toMatch(/organis/i);
    expect(await organizedFolderProblem('always', '')).toMatch(/organis/i);
    const gone = path.join(root, 'gone');
    expect(await organizedFolderProblem('always', gone)).toContain(gone);
  });

  it('picks the first free name, with its extension', async () => {
    expect(await firstFreeName(root, 'book', '.cbz')).toBe(path.join(root, 'book.cbz'));
    await writeFile(path.join(root, 'book.cbz'), '');
    await writeFile(path.join(root, 'book (2).cbz'), '');
    expect(await firstFreeName(root, 'book', '.cbz')).toBe(path.join(root, 'book (3).cbz'));
  });

  it('names folders without an extension, and skips what the caller refuses', async () => {
    await mkdir(path.join(root, 'Serie'));
    expect(await firstFreeName(root, 'Serie')).toBe(path.join(root, 'Serie (2)'));
    expect(await firstFreeName(root, 'Serie', '', (candidate) => !candidate.endsWith('(2)'))).toBe(path.join(root, 'Serie (3)'));
  });

  describe('usableTrashFolder', () => {
    let outside: string;
    beforeEach(async () => {
      outside = await mkdtemp(path.join(tmpdir(), 'skeudenn-organized-folder-outside-'));
    });
    afterEach(async () => {
      await rm(outside, { recursive: true, force: true });
    });

    it('accepts a trash that does not exist yet, or is a real directory', async () => {
      const trash = path.join(root, DELETED_BY_SKEUDENN_FOLDER);
      expect(await usableTrashFolder(root)).toBe(trash);
      await mkdir(trash);
      expect(await usableTrashFolder(root)).toBe(trash);
      expect(await requireTrashFolder(root)).toBe(trash);
    });

    it('refuses a trash that is a file', async () => {
      await writeFile(path.join(root, DELETED_BY_SKEUDENN_FOLDER), '');
      expect(await usableTrashFolder(root)).toBeNull();
    });

    it.for(FOLDER_LINK_KINDS)('refuses a trash that is a link (%s), even to a folder inside the root', async (kind, { skip }) => {
      await linkFolderOrSkip(outside, path.join(root, DELETED_BY_SKEUDENN_FOLDER), kind, skip);
      expect(await usableTrashFolder(root)).toBeNull();
      await expect(requireTrashFolder(root)).rejects.toThrow(DELETED_BY_SKEUDENN_FOLDER);

      await rm(path.join(root, DELETED_BY_SKEUDENN_FOLDER), { recursive: true });
      await mkdir(path.join(root, 'inner'));
      await linkFolderOrSkip(path.join(root, 'inner'), path.join(root, DELETED_BY_SKEUDENN_FOLDER), kind, skip);
      expect(await usableTrashFolder(root)).toBeNull();
    });

    it.for(FOLDER_LINK_KINDS)('accepts the real trash of an organized folder reached through a link (%s)', async (kind, { skip }) => {
      await mkdir(path.join(outside, DELETED_BY_SKEUDENN_FOLDER));
      const linkedRoot = path.join(root, 'linked');
      await linkFolderOrSkip(outside, linkedRoot, kind, skip);
      expect(await usableTrashFolder(linkedRoot)).toBe(path.join(linkedRoot, DELETED_BY_SKEUDENN_FOLDER));
    });
  });
});
