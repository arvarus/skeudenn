/**
 * Removing the files that are not images from a CBZ: listing them, then rewriting the archive
 * without them. A RAR can't be written and a PDF has no such files, so only CBZ is handled.
 * @module
 */
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

import { t } from '../../shared/i18n';
import { CbzArchive, openZip } from './cbz-archive';
import { isPageEntry } from './comic-archive';

/** A file of an archive that is not a page. */
export interface JunkEntry {
  /** Name inside the archive (with its folders). */
  name: string;
  /** Uncompressed size in bytes. */
  size: number;
}

/** What an archive holds once cleaned. */
export interface CleanedArchive {
  /** Entries left in the archive (pages and the files that were kept). */
  fileCount: number;
}

/**
 * The files of the CBZ at `filePath` that are not pages (`ComicInfo.xml`, `Thumbs.db`, text files,
 * macOS resource forks, hidden files…); directories are not files. Throws when the archive holds no
 * image at all: emptying it would not be a cleanup.
 */
export async function listJunkEntries(filePath: string): Promise<JunkEntry[]> {
  const zip = openZip(filePath);
  try {
    const files = Object.values(await zip.entries()).filter((entry) => !entry.isDirectory);
    if (!files.some((entry) => isPageEntry(entry.name))) {
      throw new Error(t('errors:archive.noImages', { path: filePath }));
    }
    return files.filter((entry) => !isPageEntry(entry.name)).map((entry) => ({ name: entry.name, size: entry.size }));
  } finally {
    await zip.close();
  }
}

/**
 * Rewrites the CBZ at `filePath` without the entries named in `names`. The new archive is written
 * beside the original, checked (same pages, as many entries as expected), and only then replaces
 * it, so a failure at any point leaves the original untouched. A name that is no longer in the
 * archive, or that is a page, aborts the rewrite: the archive is not what was analyzed. Directory
 * entries are dropped (readers don't need them). Pages are stored as they are (already compressed).
 */
export async function removeEntries(filePath: string, names: readonly string[]): Promise<CleanedArchive> {
  const remove = new Set(names);
  const temporary = `${filePath}.cleaning.tmp`;
  const zip = openZip(filePath);
  try {
    const files = Object.values(await zip.entries()).filter((entry) => !entry.isDirectory);
    const present = new Set(files.map((entry) => entry.name));
    for (const name of remove) {
      if (!present.has(name) || isPageEntry(name)) {
        throw new Error(t('errors:archive.cleanupChanged', { path: filePath }));
      }
    }
    const kept = files.filter((entry) => !remove.has(entry.name));

    const out = new ZipFile();
    const written = pipeline(out.outputStream, createWriteStream(temporary));
    // yazl reports a failed entry on the ZipFile only, and then stops: its output would stay open
    // and `written` would never settle. Destroying the output fails `written` and closes the file.
    out.on('error', (error: Error) => (out.outputStream as Readable).destroy(error));
    for (const entry of kept) {
      // yazl refuses a backslash in a name; Windows tools write them as separators.
      out.addReadStreamLazy(
        entry.name.replaceAll('\\', '/'),
        { mtime: new Date(entry.time), compress: !isPageEntry(entry.name) },
        (callback) => {
          zip.stream(entry.name).then(
            (stream) => {
              // yazl doesn't listen to the streams it is given: a corrupted entry fails here.
              stream.on('error', (error) => out.emit('error', error));
              callback(null, stream as unknown as NodeJS.ReadableStream);
            },
            (error: unknown) => callback(error, undefined as never),
          );
        },
      );
    }
    out.end();
    await written;
    // Released before the rename: Windows can't replace a file that is still open.
    await zip.close();

    await verify(filePath, temporary, kept.length);
    await rename(temporary, filePath);
    return { fileCount: kept.length };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  } finally {
    await zip.close();
  }
}

/** Checks the rewritten archive opens, keeps the original's pages and holds `fileCount` entries. */
async function verify(original: string, rewritten: string, fileCount: number): Promise<void> {
  const before = await CbzArchive.open(original);
  const after = await CbzArchive.open(rewritten).catch(async (error) => {
    await before.close();
    throw error;
  });
  try {
    const samePages = before.pages.length === after.pages.length && before.pages.every((page, i) => page.replaceAll('\\', '/') === after.pages[i]);
    if (!samePages || after.fileCount !== fileCount) {
      throw new Error(t('errors:archive.cleanupVerifyFailed', { path: original }));
    }
  } finally {
    await Promise.all([before.close(), after.close()]);
  }
}
