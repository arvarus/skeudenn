import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { convertCbrToCbz } from './cbr-converter';
import { CbzArchive } from './cbz-archive';
import { buildRar } from '../../test/rar-fixture';

applyLanguage('fr');

// cbr-archive.ts loads unrar.wasm from next to the bundled main.js; under Vitest, serve the
// package's own copy instead.
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  const wasm = require.resolve('node-unrar-js/dist/js/unrar.wasm');
  return {
    ...fs,
    readFile: ((file: string, ...rest: []) =>
      fs.readFile(String(file).endsWith('unrar.wasm') ? wasm : file, ...rest)) as typeof fs.readFile,
  };
});

describe('convertCbrToCbz', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tankobon-convert-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeCbr(entries: Record<string, Buffer>): Promise<string> {
    const file = join(dir, 'book.cbr');
    await writeFile(file, buildRar(entries));
    return file;
  }

  it('writes every file of the RAR into a CBZ with the same pages', async () => {
    const cbr = await writeCbr({
      'p10.jpg': Buffer.from('ten'),
      'p2.jpg': Buffer.from('two'),
      'ComicInfo.xml': Buffer.from('<x/>'),
    });
    const cbz = join(dir, 'book.cbz');

    expect(await convertCbrToCbz(cbr, cbz)).toEqual({ pageCount: 2, fileCount: 3 });

    const archive = await CbzArchive.open(cbz);
    try {
      expect(archive.pages).toEqual(['p2.jpg', 'p10.jpg']);
      expect(archive.fileCount).toBe(3);
      expect(Buffer.from((await archive.readPage(1)).data).toString()).toBe('ten');
    } finally {
      await archive.close();
    }
    expect(await readdir(dir)).toEqual(['book.cbr', 'book.cbz']);
  });

  it('refuses to replace an existing destination and leaves nothing behind', async () => {
    const cbr = await writeCbr({ 'a.png': Buffer.from('a') });
    const cbz = join(dir, 'book.cbz');
    await writeFile(cbz, 'precious');

    await expect(convertCbrToCbz(cbr, cbz)).rejects.toThrow('already exists');
    expect((await readdir(dir)).sort()).toEqual(['book.cbr', 'book.cbz']);
  });

  it('rejects a RAR with no image', async () => {
    const cbr = await writeCbr({ 'notes.txt': Buffer.from('hi') });

    await expect(convertCbrToCbz(cbr, join(dir, 'book.cbz'))).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['book.cbr']);
  });
});
