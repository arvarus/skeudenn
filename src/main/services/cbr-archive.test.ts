import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CbrArchive } from './cbr-archive';
import { MAX_ENTRY_SIZE } from './comic-archive';
import { buildRar } from '../../test/rar-fixture';

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

describe('CbrArchive', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tankobon-cbr-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeCbr(name: string, entries: Record<string, Buffer>): Promise<string> {
    const file = join(dir, name);
    await writeFile(file, buildRar(entries));
    return file;
  }

  it('lists the image pages in natural order and counts every file', async () => {
    const file = await writeCbr('a.cbr', {
      'p10.jpg': Buffer.from('ten'),
      'p2.jpg': Buffer.from('two'),
      'ComicInfo.xml': Buffer.from('<x/>'),
    });
    const archive = await CbrArchive.open(file);

    expect(archive.pages).toEqual(['p2.jpg', 'p10.jpg']);
    expect(archive.fileCount).toBe(3);
    const page = await archive.readPage(1);
    expect(Buffer.from(page.data).toString()).toBe('ten');
    expect(page.mimeType).toBe('image/jpeg');
  });

  it('keeps reading its own pages after another CBR was opened', async () => {
    // node-unrar-js routes every extractor through one shared wasm module: opening a second archive
    // used to redirect the first one's reads ("File is not RAR archive").
    const first = await CbrArchive.open(await writeCbr('first.cbr', { 'a.png': Buffer.from('first') }));
    const second = await CbrArchive.open(await writeCbr('second.cbr', { 'b.png': Buffer.from('second') }));

    expect(Buffer.from((await first.readPage(0)).data).toString()).toBe('first');
    expect(Buffer.from((await second.readPage(0)).data).toString()).toBe('second');
  });

  it('serves concurrent reads of different archives correctly', async () => {
    const archives = await Promise.all(
      ['x', 'y', 'z'].map(async (id) =>
        CbrArchive.open(
          await writeCbr(`${id}.cbr`, {
            '1.jpg': Buffer.from(`${id}1`),
            '2.jpg': Buffer.from(`${id}2`),
          }),
        ),
      ),
    );

    const pages = await Promise.all(archives.flatMap((archive) => [archive.readPage(0), archive.readPage(1)]));

    expect(pages.map((page) => Buffer.from(page.data).toString())).toEqual(['x1', 'x2', 'y1', 'y2', 'z1', 'z2']);
  });

  it('refuses a page whose declared unpacked size is above the limit, without extracting it', async () => {
    const file = join(dir, 'bomb.cbr');
    await writeFile(file, buildRar({ 'big.png': Buffer.from('tiny'), 'ok.png': Buffer.from('ok') }, { 'big.png': MAX_ENTRY_SIZE + 1 }));
    const archive = await CbrArchive.open(file);

    await expect(archive.readPage(0)).rejects.toThrow(/big\.png/);
    expect(Buffer.from((await archive.readPage(1)).data).toString()).toBe('ok');
  });

  it('rejects an out-of-range page', async () => {
    const archive = await CbrArchive.open(await writeCbr('a.cbr', { '1.jpg': Buffer.from('1') }));
    await expect(archive.readPage(1)).rejects.toThrow(RangeError);
  });
});
