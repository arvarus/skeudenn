import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { CbzArchive } from './cbz-archive';

// The user-facing messages are checked in French; English is the interface's default.
beforeAll(() => applyLanguage('fr'));

/** Builds a minimal zip (STORED entries only) without any extra dependency. */
function buildZip(entries: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

describe('CbzArchive', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-cbz-'));
    file = join(dir, 'book.cbz');
    await writeFile(
      file,
      buildZip({
        '002.jpg': Buffer.alloc(200_000, 2),
        '001.jpg': Buffer.alloc(200_000, 1),
        'ComicInfo.xml': Buffer.from('<ComicInfo/>'),
      }),
    );
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('refuses a page whose declared size is above the ceiling', async () => {
    const zip = buildZip({ '001.jpg': Buffer.alloc(100, 1) });
    // Forge the central directory's uncompressed size (offset 24 of its entry) at 300 MB.
    zip.writeUInt32LE(300 * 1024 * 1024, zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24);
    const big = join(dir, 'big.cbz');
    await writeFile(big, zip);
    const archive = await CbzArchive.open(big);
    await expect(archive.readPage(0)).rejects.toThrow('trop volumineuse');
    await archive.close();
  });

  it('refuses a page that inflates past the ceiling whatever size the archive declares', async () => {
    // A streaming writer sets the "data descriptor" flag and leaves the local header's CRC and sizes at 0;
    // node-stream-zip then trusts the central directory, which here lies about the size (1 000 bytes).
    const data = deflateRawSync(Buffer.alloc(201 * 1024 * 1024));
    const name = Buffer.from('001.jpg');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x08, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x08, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(1000, 24);
    central.writeUInt16LE(name.length, 28);
    const centralDir = Buffer.concat([central, name]);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(local.length + name.length + data.length, 16);
    const bomb = join(dir, 'bomb.cbz');
    await writeFile(bomb, Buffer.concat([local, name, data, centralDir, end]));
    const archive = await CbzArchive.open(bomb);
    await expect(archive.readPage(0)).rejects.toThrow('trop volumineuse');
    await archive.close();
    // Compressing then inflating 200 MB takes about a second alone, several when the whole suite runs in parallel.
  }, 30_000);

  it('refuses a page declaring a huge image before it is decoded', async () => {
    const header = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
    header.write('IHDR', 12, 'ascii');
    header.writeUInt32BE(30_000, 16);
    header.writeUInt32BE(30_000, 20);
    const huge = join(dir, 'huge.cbz');
    await writeFile(huge, buildZip({ '001.png': header }));
    const archive = await CbzArchive.open(huge);
    await expect(archive.readPage(0)).rejects.toThrow('Image trop grande');
    await archive.close();
  });

  it('reads entries named with a Windows separator', async () => {
    const mixed = join(dir, 'mixed.cbz');
    await writeFile(mixed, buildZip({ 'Book/Book\\001.jpg': Buffer.alloc(100, 1) }));
    const archive = await CbzArchive.open(mixed);
    expect(archive.pages).toEqual(['Book/Book\\001.jpg']);
    expect((await archive.readPage(0)).data).toHaveLength(100);
    await archive.close();
  });

  it('lists sorted pages and counts every file', async () => {
    const archive = await CbzArchive.open(file);
    expect(archive.pages).toEqual(['001.jpg', '002.jpg']);
    expect(archive.fileCount).toBe(3);
    const page = await archive.readPage(1);
    expect(page.mimeType).toBe('image/jpeg');
    expect(page.data[0]).toBe(2);
    await archive.close();
  });

  it('lets in-flight reads finish before closing instead of crashing with EBADF', async () => {
    const archive = await CbzArchive.open(file);
    const reads = [archive.readPage(0), archive.readPage(1)];
    await archive.close();
    const pages = await Promise.all(reads);
    expect(pages.map((p) => p.data.length)).toEqual([200_000, 200_000]);
  });

  it('rejects reads started after close', async () => {
    const archive = await CbzArchive.open(file);
    await archive.close();
    await expect(archive.readPage(0)).rejects.toThrow('Archive fermée');
  });
});
