import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { trashSidecars } from './sidecars';

describe('trashSidecars', () => {
  let dir: string;
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('trashes the cover and the .nfo that exist, and only those', async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-sidecars-'));
    await writeFile(join(dir, 'Tome 1.cover.webp'), 'c');
    await writeFile(join(dir, 'Tome 1.nfo'), 'n');
    await writeFile(join(dir, 'Tome 2.nfo'), 'other book');
    const trashed: string[] = [];
    const trash = async (file: string) => {
      trashed.push(file);
    };

    await trashSidecars(join(dir, 'Tome 1.cbz'), trash);

    expect(trashed.sort()).toEqual([join(dir, 'Tome 1.cover.webp'), join(dir, 'Tome 1.nfo')]);
  });

  it('does nothing when there is no sidecar, and goes on when one cannot be trashed', async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-sidecars-'));
    const trash = vi.fn(async () => undefined);
    await trashSidecars(join(dir, 'Tome 1.cbz'), trash);
    expect(trash).not.toHaveBeenCalled();

    await writeFile(join(dir, 'Tome 1.cover.webp'), 'c');
    await writeFile(join(dir, 'Tome 1.nfo'), 'n');
    const failing = vi.fn(async () => {
      throw new Error('locked');
    });
    await expect(trashSidecars(join(dir, 'Tome 1.cbz'), failing)).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
