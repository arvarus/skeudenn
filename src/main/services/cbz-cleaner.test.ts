import { createWriteStream } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { crc32, deflateRawSync } from 'node:zlib';
import { ZipFile } from 'yazl';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyLanguage } from '../../shared/i18n';

import { CbzArchive } from './cbz-archive';
import { listJunkEntries, removeEntries } from './cbz-cleaner';

/** Writes a zip with the given entries (name → content). */
async function writeZip(file: string, entries: Record<string, Buffer>): Promise<void> {
  const zip = new ZipFile();
  for (const [name, data] of Object.entries(entries)) zip.addBuffer(data, name);
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(file));
}

/** Marks every entry of the zip as compressed with `method`, in its local header and in the central directory. */
async function setCompressionMethod(file: string, method: number): Promise<void> {
  const bytes = await readFile(file);
  for (const [signature, offset] of [[0x04034b50, 8], [0x02014b50, 10]] as const) {
    const marker = Buffer.alloc(4);
    marker.writeUInt32LE(signature);
    for (let at = bytes.indexOf(marker); at !== -1; at = bytes.indexOf(marker, at + 4)) bytes.writeUInt16LE(method, at + offset);
  }
  await writeFile(file, bytes);
}

/** Overwrites the start of the first entry's compressed data with an invalid deflate block. */
async function corruptFirstEntry(file: string): Promise<void> {
  const bytes = await readFile(file);
  const data = 30 + bytes.readUInt16LE(26) + bytes.readUInt16LE(28);
  bytes.fill(0xff, data, data + 4);
  await writeFile(file, bytes);
}

/**
 * Builds a zip holding a stored page and `bomb.txt`, deflated from `inflated` bytes but declaring only
 * 1 000 in the central directory, with the "data descriptor" flag a streaming writer sets (local
 * header's CRC and sizes left at 0): node-stream-zip then doesn't check the size it inflates to.
 */
function buildBombZip(inflated: number): Buffer {
  const page = Buffer.alloc(100, 1);
  const bomb = deflateRawSync(Buffer.alloc(inflated));
  const entries = [
    { name: Buffer.from('001.jpg'), data: page, flags: 0, method: 0, crc: crc32(page), size: page.length },
    { name: Buffer.from('bomb.txt'), data: bomb, flags: 0x08, method: 8, crc: 0, size: 1000 },
  ];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags, 6);
    local.writeUInt16LE(entry.method, 8);
    if (entry.flags === 0) {
      local.writeUInt32LE(entry.crc, 14);
      local.writeUInt32LE(entry.data.length, 18);
      local.writeUInt32LE(entry.size, 22);
    }
    local.writeUInt16LE(entry.name.length, 26);
    locals.push(local, entry.name, entry.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.size, 24);
    central.writeUInt16LE(entry.name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, entry.name);
    offset += local.length + entry.name.length + entry.data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

// The user-facing messages are checked in French; English is the interface's default.
beforeAll(() => applyLanguage('fr'));

describe('cbz-cleaner', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-clean-'));
    file = join(dir, 'book.cbz');
    await writeZip(file, {
      '002.jpg': Buffer.alloc(5_000, 2),
      '001.jpg': Buffer.alloc(5_000, 1),
      'ComicInfo.xml': Buffer.from('<ComicInfo/>'),
      'notes/readme.txt': Buffer.from('hello'),
      '__MACOSX/._001.jpg': Buffer.from('fork'),
      'Thumbs.db': Buffer.from('db'),
    });
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('lists the files that are not pages', async () => {
    const junk = await listJunkEntries(file);
    expect(junk.map((entry) => entry.name).sort()).toEqual(
      ['ComicInfo.xml', 'Thumbs.db', '__MACOSX/._001.jpg', 'notes/readme.txt'].sort(),
    );
    expect(junk.find((entry) => entry.name === 'Thumbs.db')?.size).toBe(2);
  });

  it('refuses an archive with no image', async () => {
    const empty = join(dir, 'empty.cbz');
    await writeZip(empty, { 'a.txt': Buffer.from('x') });
    await expect(listJunkEntries(empty)).rejects.toThrow();
  });

  it('rewrites the archive without the named entries and keeps the pages intact', async () => {
    const { fileCount } = await removeEntries(file, ['Thumbs.db', '__MACOSX/._001.jpg', 'notes/readme.txt']);
    expect(fileCount).toBe(3);

    const archive = await CbzArchive.open(file);
    expect(archive.pages).toEqual(['001.jpg', '002.jpg']);
    expect(archive.fileCount).toBe(3);
    expect((await archive.readPage(0)).data[0]).toBe(1);
    expect((await archive.readPage(1)).data.length).toBe(5_000);
    await archive.close();
    expect((await listJunkEntries(file)).map((entry) => entry.name)).toEqual(['ComicInfo.xml']);
    expect(await readdir(dir)).toEqual(['book.cbz']);
  });

  it('leaves the original untouched when an entry is no longer there or is a page', async () => {
    const before = (await stat(file)).size;
    await expect(removeEntries(file, ['gone.txt'])).rejects.toThrow();
    await expect(removeEntries(file, ['001.jpg'])).rejects.toThrow();
    expect((await stat(file)).size).toBe(before);
    expect(await readdir(dir)).toEqual(['book.cbz']);
  });

  it('fails instead of hanging on an unreadable entry, leaving the original untouched', async () => {
    // Deflate64, which Windows tools write and node-stream-zip can't inflate.
    await setCompressionMethod(file, 9);
    const before = await readFile(file);
    await expect(removeEntries(file, ['Thumbs.db'])).rejects.toThrow('compression method');
    expect((await readFile(file)).equals(before)).toBe(true);
    expect(await readdir(dir)).toEqual(['book.cbz']);
  });

  it('fails instead of hanging when an entry breaks while it is copied', async () => {
    await corruptFirstEntry(file);
    const before = await readFile(file);
    await expect(removeEntries(file, ['Thumbs.db'])).rejects.toThrow();
    expect((await readFile(file)).equals(before)).toBe(true);
    expect(await readdir(dir)).toEqual(['book.cbz']);
  });

  it('refuses up front a kept entry declaring more than the ceiling, leaving the original untouched', async () => {
    const before = await readFile(file);
    await expect(removeEntries(file, ['Thumbs.db'], 4_000)).rejects.toThrow(/^Fichier trop volumineux dans l’archive : 00[12]\.jpg$/);
    expect((await readFile(file)).equals(before)).toBe(true);
    expect(await readdir(dir)).toEqual(['book.cbz']);
  });

  it('stops copying a kept entry that inflates past the ceiling whatever size it declares', async () => {
    const bomb = join(dir, 'bomb.cbz');
    await writeFile(bomb, buildBombZip(2 * 1024 * 1024));
    const before = await readFile(bomb);
    await expect(removeEntries(bomb, [], 1024 * 1024)).rejects.toThrow('Fichier trop volumineux dans l’archive : bomb.txt');
    expect((await readFile(bomb)).equals(before)).toBe(true);
    expect((await readdir(dir)).sort()).toEqual(['bomb.cbz', 'book.cbz']);
  });

  it('copies an entry that inflates to exactly the ceiling', async () => {
    const bomb = join(dir, 'bomb.cbz');
    await writeFile(bomb, buildBombZip(1024 * 1024));
    await expect(removeEntries(bomb, [], 1024 * 1024)).resolves.toEqual({ fileCount: 2 });
  });
});
