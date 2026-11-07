/**
 * CBZ whose entries use the Deflate64 method (ZIP method 9, written by Windows Explorer and some
 * archivers for large files). node-stream-zip reads the directory of such an archive but can't inflate
 * its entries, so the book opens and then shows unreadable pages. Here they are detected, then
 * rewritten with the standard Deflate method every reader understands. Only CBZ is concerned.
 * @module
 */
import { createWriteStream, openAsBlob } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlobReader, configure, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js';
import { ZipFile } from 'yazl';

import { t } from '../../shared/i18n';
import { CbzArchive, openZip } from './cbz-archive';
import { isPageEntry, MAX_ENTRY_SIZE } from './comic-archive';

/** ZIP compression method number of Deflate64. */
const DEFLATE64_METHOD = 9;

/** What a converted archive holds. */
export interface Deflate64Converted {
  /** Entries of the archive (pages and the other files). */
  fileCount: number;
}

/** True when at least one entry of the CBZ at `filePath` is stored with Deflate64. Only the archive's directory is read. */
export async function hasDeflate64(filePath: string): Promise<boolean> {
  const zip = openZip(filePath);
  try {
    return Object.values(await zip.entries()).some((entry) => !entry.isDirectory && entry.method === DEFLATE64_METHOD);
  } finally {
    await zip.close();
  }
}

/**
 * Rewrites the CBZ at `filePath` with standard compression. The new archive is written beside the
 * original, checked (same pages, as many entries) and only then replaces it, so a failure at any point
 * leaves the original untouched. Directory entries are dropped; pages are stored as they are (already
 * compressed), the other files are deflated. Entries are inflated one at a time, as yazl asks for them.
 * Refuses an entry above `MAX_ENTRY_SIZE`, and an archive with no image.
 */
export async function convertDeflate64(filePath: string): Promise<Deflate64Converted> {
  const temporary = `${filePath}.converting.tmp`;
  // Entries are read by zip.js on this thread: a worker would need a URL the packaged app doesn't have.
  configure({ useWebWorkers: false });
  const reader = new ZipReader(new BlobReader(await openAsBlob(filePath)), { useWebWorkers: false });
  try {
    const files = (await reader.getEntries()).filter((entry): entry is FileEntry => !entry.directory);
    if (!files.some((entry) => isPageEntry(entry.filename))) {
      throw new Error(t('errors:archive.noImages', { path: filePath }));
    }
    const tooLarge = files.find((entry) => entry.uncompressedSize > MAX_ENTRY_SIZE);
    if (tooLarge) throw new Error(t('errors:archive.entryTooLarge', { entry: tooLarge.filename }));

    await rm(temporary, { force: true });
    const out = new ZipFile();
    const written = pipeline(out.outputStream, createWriteStream(temporary));
    // yazl reports a failed entry on the ZipFile only, then stops: destroying the output settles `written`.
    out.on('error', (error: Error) => (out.outputStream as Readable).destroy(error));
    for (const entry of files) {
      out.addReadStreamLazy(
        // yazl refuses a backslash in a name; Windows tools write them as separators.
        entry.filename.replaceAll('\\', '/'),
        { mtime: entry.lastModDate, compress: !isPageEntry(entry.filename) },
        (callback) => {
          inflate(entry).then(
            (data) => callback(null, Readable.from([data])),
            (error: unknown) => callback(error, undefined as never),
          );
        },
      );
    }
    out.end();
    await written;

    await verify(filePath, temporary, files);
    await rename(temporary, filePath);
    return { fileCount: files.length };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await reader.close();
  }
}

/** The bytes of an entry, inflated; zip.js checks the CRC-32 as it goes. */
async function inflate(entry: Entry & FileEntry): Promise<Buffer> {
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const done = entry.getData(stream);
  const chunks: Buffer[] = [];
  let total = 0;
  const collect = (async () => {
    for await (const chunk of stream.readable as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.length;
      if (total > MAX_ENTRY_SIZE) throw new Error(t('errors:archive.entryTooLarge', { entry: entry.filename }));
      chunks.push(Buffer.from(chunk));
    }
  })();
  await Promise.all([done, collect]);
  return Buffer.concat(chunks);
}

/** Checks the rewritten archive opens with the original's pages, in order, and as many entries. */
async function verify(original: string, rewritten: string, files: readonly FileEntry[]): Promise<void> {
  const after = await CbzArchive.open(rewritten);
  try {
    const pages = files.filter((entry) => isPageEntry(entry.filename)).map((entry) => entry.filename.replaceAll('\\', '/'));
    const names = new Set(after.pages);
    if (after.fileCount !== files.length || after.pages.length !== pages.length || !pages.every((page) => names.has(page))) {
      throw new Error(t('errors:archive.convertVerifyFailed', { path: original }));
    }
  } finally {
    await after.close();
  }
}
