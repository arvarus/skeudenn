/**
 * Messages exchanged between the main process and the decoder process (see ADR 0012).
 * @module
 */
import type { ArchiveInfo, ComicPage } from '../../shared/comic';
import type { Language } from '../../shared/i18n';
import type { ConvertedArchive } from '../services/cbr-converter';
import type { Deflate64Converted } from '../services/cbz-deflate64';
import type { CleanedArchive, JunkEntry } from '../services/cbz-cleaner';

/** What `inspect` learns about an archive: enough to register it in the library. */
export interface ArchiveSummary {
  /** Page count (image entries only). */
  pageCount: number;
  /** Total entries in the archive (not just image pages). */
  fileCount: number;
}

/** Average size, in pixels, of the pages of an archive: see `DecoderMethods.measure`. */
export interface PageSizeAverage {
  width: number;
  height: number;
}

/**
 * The calls the decoder process answers, as the main process sees them (the arguments, and what the
 * call resolves to). Everything that opens an archive, decodes an image or touches the thumbnail
 * cache goes through here.
 */
export interface DecoderMethods {
  /** Opens a comic and keeps it open, under the returned handle, until `close`. */
  open(filePath: string): ArchiveInfo;
  /** Reads a page of an archive opened with `open`. */
  readPage(id: string, index: number): ComicPage;
  /** Closes an archive opened with `open`. */
  close(id: string): void;
  /** Opens a file just long enough to count its pages, caching its cover on the way. */
  inspect(filePath: string): ArchiveSummary;
  /**
   * Opens a file just long enough to average its pages' dimensions (read from the image headers;
   * a PDF's from its page boxes). Pages that can't be read are left out of the average; null when none could be.
   */
  measure(filePath: string): PageSizeAverage | null;
  /**
   * The files of a CBZ that are not pages; null for a format that can't be rewritten (CBR, PDF).
   * Rejects when the archive can't be read or holds no image.
   */
  listJunk(filePath: string): JunkEntry[] | null;
  /**
   * Rewrites a CBZ without the entries `names` (see `removeEntries()`): the original is replaced only
   * once the new archive has been checked.
   */
  cleanArchive(filePath: string, names: string[]): CleanedArchive;
  /**
   * Writes the CBR at `cbrPath` as a CBZ at `cbzPath` (see `convertCbrToCbz()`): the new archive is checked
   * before it appears, and the CBR is left untouched. Rejects when `cbzPath` exists or the CBR can't be read.
   */
  convertCbr(cbrPath: string, cbzPath: string): ConvertedArchive;
  /** True when a CBZ has entries stored with Deflate64 (see `hasDeflate64()`); false for another format. */
  hasDeflate64(filePath: string): boolean;
  /**
   * Rewrites a CBZ with standard compression (see `convertDeflate64()`): the original is replaced only once
   * the new archive has been checked.
   */
  convertDeflate64(filePath: string): Deflate64Converted;
  /**
   * A book's cover thumbnail, generated first when missing (from the open archive `archiveId`, if any).
   * With `cachedOnly`, the file is never opened: the cached thumbnail or null.
   */
  thumbnail(filePath: string, archiveId?: string, cachedOnly?: boolean): Uint8Array<ArrayBuffer> | null;
  /** Whether a book has a thumbnail already (beside it or in the local cache), without reading it. */
  hasThumbnail(filePath: string): boolean;
  /** Replaces a book's cover with the given image (PNG, JPEG, WebP…), shrunk to the thumbnail size; rejects when it isn't a usable image. */
  setThumbnail(filePath: string, image: Uint8Array): void;
  /** Deletes a book's thumbnail. */
  removeThumbnail(filePath: string): void;
  /** Deletes every thumbnail that isn't one of `filePaths`'. */
  pruneThumbnails(filePaths: string[]): void;
  /** Brings the thumbnails in line with `filePaths` (after a JSON import). */
  rebuildThumbnails(filePaths: string[]): void;
}

/** Name of a `DecoderMethods` call. */
export type DecoderMethod = keyof DecoderMethods;

/** A call, main → decoder. `id` pairs it with its `DecoderResponse`. */
export type DecoderRequest = {
  [M in DecoderMethod]: { type: 'request'; id: number; method: M; args: Parameters<DecoderMethods[M]> };
}[DecoderMethod];

/** Settings the decoder needs; sent first on every (re)start, and `language` / `sidecarCovers` again whenever they change. */
export type DecoderControl =
  | { type: 'init'; thumbnailsDirectory: string; language: Language; sidecarCovers: boolean }
  | { type: 'language'; language: Language }
  | { type: 'sidecarCovers'; enabled: boolean };

/** What the main process sends: a call or a control message. */
export type DecoderInbound = DecoderRequest | DecoderControl;

/** The answer to a `DecoderRequest`; a failure carries the (already translated) message. */
export type DecoderResponse =
  | { type: 'response'; id: number; ok: true; result: unknown }
  | { type: 'response'; id: number; ok: false; message: string };
