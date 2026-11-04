import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DELETED_BY_TANKOBON_FOLDER } from '../../shared/library';
import { parkComic, parkingFolder } from './park-comic';

describe('parkComic', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tankobon-park-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('parks the comic and its sidecars at the root of the organized folder', async () => {
    const book = join(dir, 'Serie', 'Tome 1.cbz');
    await mkdir(join(dir, 'Serie'));
    await writeFile(book, 'b');
    await writeFile(join(dir, 'Serie', 'Tome 1.nfo'), 'n');
    await writeFile(join(dir, 'Serie', 'Tome 1.cover.webp'), 'c');

    await parkComic(book, dir);

    expect((await readdir(join(dir, DELETED_BY_TANKOBON_FOLDER))).sort()).toEqual(['Tome 1.cbz', 'Tome 1.cover.webp', 'Tome 1.nfo']);
    expect(await readdir(join(dir, 'Serie'))).toEqual([]);
  });

  it('parks beside the comic outside the organized folder, renaming on a collision', async () => {
    await mkdir(join(dir, DELETED_BY_TANKOBON_FOLDER));
    await writeFile(join(dir, DELETED_BY_TANKOBON_FOLDER, 'a.cbz'), 'old');
    await writeFile(join(dir, 'a.cbz'), 'new');

    await parkComic(join(dir, 'a.cbz'), '');

    expect((await readdir(join(dir, DELETED_BY_TANKOBON_FOLDER))).sort()).toEqual(['a (2).cbz', 'a.cbz']);
    expect(parkingFolder(join(dir, 'a.cbz'), '')).toBe(join(dir, DELETED_BY_TANKOBON_FOLDER));
  });

  it('accepts a comic already gone', async () => {
    await expect(parkComic(join(dir, 'missing.cbz'), dir)).resolves.toBeUndefined();
  });
});
