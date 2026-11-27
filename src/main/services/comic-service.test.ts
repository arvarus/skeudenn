import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ComicService, MAX_OPEN_ARCHIVES } from './comic-service';

/** A zip holding one STORED entry, built without any extra dependency. */
function buildZip(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const offset = local.length + nameBuf.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, end]);
}

describe('ComicService', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skeudenn-service-'));
    file = join(dir, 'book.cbz');
    await writeFile(file, buildZip('001.jpg', Buffer.alloc(100, 1)));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('closes the archive opened longest ago once too many are open', async () => {
    const service = new ComicService();
    const first = await service.open(file);
    const others = [];
    for (let i = 0; i < MAX_OPEN_ARCHIVES; i++) others.push(await service.open(file));

    expect(() => service.readPage(first.id, 0)).toThrow();
    await expect(service.readPage(others[0].id, 0)).resolves.toBeDefined();
    await expect(service.readPage(others[MAX_OPEN_ARCHIVES - 1].id, 0)).resolves.toBeDefined();
    await service.closeAll();
  });
});
