/**
 * CBZ (ZIP) support.
 * @module
 */
import StreamZip from 'node-stream-zip';
import type { Readable } from 'node:stream';

import type { ComicPage } from '../../shared/comic';
import { t } from '../../shared/i18n';
import { boundedStream } from './bounded-stream';
import { checkedPage } from './image-size';
import { imageMimeType, isPageEntry, MAX_ENTRY_SIZE, sortPages, type ComicArchive } from './comic-archive';

/**
 * Opens a ZIP for reading. Entry names are only ever used as keys into the archive, never as
 * filesystem paths, so node-stream-zip's "Malicious entry" check (aimed at extraction) is skipped:
 * archives made on Windows commonly hold names like `Folder/Folder\page.jpg`, which it refuses.
 */
export function openZip(filePath: string): StreamZip.StreamZipAsync {
  return new StreamZip.async({ file: filePath, skipEntryNameValidation: true });
}

/** A `.cbz` (ZIP) comic, read entry by entry with node-stream-zip (the file stays open until `close()`). */
export class CbzArchive implements ComicArchive {
  // Reads still in flight. node-stream-zip closes its file descriptor immediately on
  // `close()`, and a read that's mid-way then fails with EBADF on an internal stream
  // whose error is never forwarded to the `entryData()` promise — it surfaces as an
  // uncaught exception that takes the whole decoder process down. So `close()` waits for
  // these to settle first, and `readPage()` refuses to start once closing has begun.
  private readonly pendingReads = new Set<Promise<unknown>>();
  private closing = false;

  private constructor(
    readonly path: string,
    readonly pages: readonly string[],
    readonly fileCount: number,
    private readonly sizes: ReadonlyMap<string, number>,
    private readonly zip: StreamZip.StreamZipAsync,
  ) {}

  /** Opens and indexes the archive; throws (after closing it) when it holds no image. */
  static async open(filePath: string): Promise<CbzArchive> {
    const zip = openZip(filePath);
    try {
      const entries = await zip.entries();
      const files = Object.values(entries).filter((entry) => !entry.isDirectory);
      const pages = sortPages(files.filter((entry) => isPageEntry(entry.name)).map((entry) => entry.name));
      if (pages.length === 0) {
        throw new Error(t('errors:archive.noImages', { path: filePath }));
      }
      const sizes = new Map(files.map((entry) => [entry.name, entry.size]));
      return new CbzArchive(filePath, pages, files.length, sizes, zip);
    } catch (error) {
      await zip.close();
      throw error;
    }
  }

  /** Reads page `index` (0-based); throws a `RangeError` when out of range, or once `close()` has begun. */
  async readPage(index: number): Promise<ComicPage> {
    const entryName = this.pages[index];
    if (entryName === undefined) {
      throw new RangeError(t('errors:archive.pageOutOfRange', { index, last: this.pages.length - 1 }));
    }
    if (this.closing) {
      throw new Error(t('errors:archive.closed', { path: this.path }));
    }
    if ((this.sizes.get(entryName) ?? 0) > MAX_ENTRY_SIZE) {
      throw new Error(t('errors:archive.entryTooLarge', { entry: entryName }));
    }
    const read = this.readBounded(entryName);
    this.pendingReads.add(read);
    try {
      const data = await read;
      // Copy into a fresh ArrayBuffer: Buffers may be views on a shared pool.
      return checkedPage({ data: new Uint8Array(data), mimeType: imageMimeType(entryName)! }, entryName);
    } finally {
      this.pendingReads.delete(read);
    }
  }

  /**
   * Inflates an entry, giving up past `MAX_ENTRY_SIZE`. The size the central directory declares can't be
   * trusted: node-stream-zip skips its own size check when the entry sets the "data descriptor" flag, so a
   * few kilobytes of ZIP could otherwise inflate to gigabytes in memory.
   */
  private async readBounded(entryName: string): Promise<Buffer> {
    // Typed as a web stream by node-stream-zip; it is a Node `Readable`.
    const stream = (await this.zip.stream(entryName)) as unknown as Readable;
    const chunks: Buffer[] = [];
    const bounded = boundedStream(stream, MAX_ENTRY_SIZE, () => new Error(t('errors:archive.entryTooLarge', { entry: entryName })));
    try {
      for await (const chunk of bounded as AsyncIterable<Buffer>) chunks.push(chunk);
    } finally {
      bounded.destroy();
      stream.destroy();
    }
    return Buffer.concat(chunks);
  }

  /** Waits for in-flight reads to settle, then closes the ZIP file. */
  async close(): Promise<void> {
    this.closing = true;
    await Promise.allSettled([...this.pendingReads]);
    await this.zip.close();
  }
}
