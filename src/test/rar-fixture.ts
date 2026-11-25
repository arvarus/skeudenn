/**
 * Test helper: builds RAR archives for the tests of the CBR code.
 * @module
 */
import { crc32 } from 'node:zlib';

/** Builds a minimal RAR 4 archive (stored entries only), since no tool here can write RAR. */
export function buildRar(entries: Record<string, Buffer>, declaredSizes: Record<string, number> = {}): Buffer {
  // A header's CRC is the low 16 bits of the CRC32 of everything after the CRC field itself.
  const withCrc = (body: Buffer): Buffer => {
    const crc = Buffer.alloc(2);
    crc.writeUInt16LE(crc32(body) & 0xffff);
    return Buffer.concat([crc, body]);
  };
  const marker = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]);
  const mainHeader = Buffer.alloc(11);
  mainHeader.writeUInt8(0x73, 0); // HEAD_TYPE: archive header
  mainHeader.writeUInt16LE(13, 3); // HEAD_SIZE
  const parts = [marker, withCrc(mainHeader)];
  for (const [name, data] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'latin1');
    const header = Buffer.alloc(30);
    header.writeUInt8(0x74, 0); // HEAD_TYPE: file header
    header.writeUInt16LE(0x8000, 1); // LONG_BLOCK: data follows the header
    header.writeUInt16LE(32 + nameBuf.length, 3); // HEAD_SIZE
    header.writeUInt32LE(data.length, 5); // PACK_SIZE
    header.writeUInt32LE(declaredSizes[name] ?? data.length, 9); // UNP_SIZE
    header.writeUInt8(2, 13); // HOST_OS: Windows
    header.writeUInt32LE(crc32(data), 14); // FILE_CRC
    header.writeUInt32LE(0x21, 18); // FTIME (DOS date 1980-01-01)
    header.writeUInt8(20, 22); // UNP_VER: 2.0
    header.writeUInt8(0x30, 23); // METHOD: store
    header.writeUInt16LE(nameBuf.length, 24); // NAME_SIZE
    header.writeUInt32LE(0x20, 26); // ATTR: archive
    parts.push(withCrc(Buffer.concat([header, nameBuf])), data);
  }
  return Buffer.concat(parts);
}
