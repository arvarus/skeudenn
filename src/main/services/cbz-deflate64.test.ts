import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { beforeAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZipFile } from 'yazl';

import { applyLanguage } from '../../shared/i18n';
import { CbzArchive } from './cbz-archive';
import { convertDeflate64, hasDeflate64 } from './cbz-deflate64';

beforeAll(() => applyLanguage('fr'));

/** A ZIP of the given entries, deflated (yazl). */
async function zipOf(entries: Record<string, Buffer>): Promise<Buffer> {
  const zip = new ZipFile();
  for (const [name, data] of Object.entries(entries)) zip.addReadStream(Readable.from([data]), name, { compress: true });
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Marks every entry as Deflate64 (method 9) in the local and central headers. A short deflate stream that
 * uses neither the 258-byte length code nor distances above 32 KiB is the same bitstream in Deflate64.
 */
function asDeflate64(zip: Buffer): Buffer {
  const copy = Buffer.from(zip);
  for (let i = 0; i + 4 <= copy.length; i++) {
    const signature = copy.readUInt32LE(i);
    if (signature === 0x04034b50) copy.writeUInt16LE(9, i + 8);
    if (signature === 0x02014b50) copy.writeUInt16LE(9, i + 10);
  }
  return copy;
}

describe('Deflate64 CBZ', () => {
  let dir: string;
  let file: string;
  const page = Buffer.from('not really an image, but a page by its name');
  const info = Buffer.from('<ComicInfo>hello hello hello hello</ComicInfo>');

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tankobon-deflate64-'));
    file = join(dir, 'book.cbz');
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('detects the method', async () => {
    const plain = await zipOf({ '1.jpg': page });
    await writeFile(file, plain);
    expect(await hasDeflate64(file)).toBe(false);
    await writeFile(file, asDeflate64(plain));
    expect(await hasDeflate64(file)).toBe(true);
  });

  it('rewrites the archive with standard compression, keeping every entry', async () => {
    await writeFile(file, asDeflate64(await zipOf({ '1.jpg': page, '2.jpg': page, 'ComicInfo.xml': info })));
    expect(await convertDeflate64(file)).toEqual({ fileCount: 3 });
    expect(await hasDeflate64(file)).toBe(false);
    const archive = await CbzArchive.open(file);
    try {
      expect(archive.pages).toEqual(['1.jpg', '2.jpg']);
      expect(archive.fileCount).toBe(3);
    } finally {
      await archive.close();
    }
    expect(await readdir(dir)).toEqual(['book.cbz']);
  });

  it('leaves the original untouched when it holds no image', async () => {
    const original = asDeflate64(await zipOf({ 'ComicInfo.xml': info }));
    await writeFile(file, original);
    await expect(convertDeflate64(file)).rejects.toThrow();
    expect(await readFile(file)).toEqual(original);
    expect(await readdir(dir)).toEqual(['book.cbz']);
  });
});
