/**
 * Cover thumbnails: the first page of each library book, shrunk and kept on disk so the library
 * list doesn't have to open every archive each time it is shown.
 * @module
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ComicPage } from '../../shared/comic';
import type { ComicArchive } from './comic-archive';
import { isOnlineOnly } from './cloud-files';
import { openArchive } from './comic-service';
import { coverSidecarPath } from './cover-sidecar';
import { assertImageWithinLimit } from './image-size';

/** Bounding box of a thumbnail, in pixels: about 3× the size the library list shows it at. */
export const THUMBNAIL_MAX_WIDTH = 240;
/** See `THUMBNAIL_MAX_WIDTH`. */
export const THUMBNAIL_MAX_HEIGHT = 360;

/** How long `storeFromArchive()` waits for its turn in the queue, in milliseconds. */
export const STORE_MAX_WAIT_MS = 10_000;

const THUMBNAIL_EXTENSION = '.webp';

/** The books whose cover couldn't be made, kept in the cache directory across sessions. */
export const FAILED_COVERS_FILE = 'failed-covers.json';

/** What a book's file was when its cover failed: a change of either gives it a new chance. */
interface FailedCover {
  size: number;
  mtimeMs: number;
}

/**
 * Whether an error says nothing about the book itself: a system error (`EBUSY`, `EACCES`, `ENOENT`…: a
 * file locked by a sync tool, a drive gone) may not happen next time, so it is only remembered for the session.
 */
function isPassingError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === 'string' && /^E[A-Z0-9]+$/.test(code);
}
const WEBP_QUALITY = 80;

/**
 * Shrinks an image (any format `@napi-rs/canvas` decodes: JPEG, PNG, WebP, GIF, AVIF…) to fit in
 * `THUMBNAIL_MAX_WIDTH` × `THUMBNAIL_MAX_HEIGHT`, keeping its aspect ratio and never enlarging it,
 * and encodes it as WebP. Rejects an image declaring more than `MAX_IMAGE_PIXELS`, before decoding it.
 */
export async function renderThumbnail(image: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  assertImageWithinLimit(image, '');
  const source = await loadImage(Buffer.from(image.buffer, image.byteOffset, image.byteLength));
  const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / source.width, THUMBNAIL_MAX_HEIGHT / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  return new Uint8Array(await canvas.encode('webp', WEBP_QUALITY));
}

/**
 * Cache file name of a book: a hash of its path. Keyed by path rather than by library id because
 * the path is what identifies a book across a JSON import (which can give an entry a new id).
 */
export function thumbnailKey(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 32);
}

/**
 * The thumbnails of the library. A cover is kept beside its comic (`coverSidecarPath()`), so it is
 * shared with the library folder; the cache directory is the fallback for a comic whose folder can't
 * be written to, and still serves the covers made before sidecars existed. Every generation goes through a single queue, one book at a time:
 * a library page asking for hundreds of covers at once, or a rebuild after an import, must not
 * open hundreds of archives in parallel. Concurrent requests for the same book share one
 * generation.
 */
export class ThumbnailCache {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly inFlight = new Map<string, Promise<Uint8Array<ArrayBuffer> | null>>();
  /** Books whose cover failed this session, so they aren't reopened on every request. */
  private readonly failed = new Set<string>();
  /**
   * Books whose cover failed in an earlier session too (unreadable archive, no image page), by key, read
   * once from {@link FAILED_COVERS_FILE}: a resynchronization asks for the missing covers at every run, and
   * reopening the same broken archives each time is what made it slow. Loaded lazily.
   */
  private failures: Promise<Map<string, FailedCover>> | null = null;
  /** The writes of {@link FAILED_COVERS_FILE}, one after the other. */
  private failuresSaved: Promise<void> = Promise.resolve();
  /** Whether new covers go beside the comic (else only to the local cache). */
  sidecars = true;

  constructor(
    private readonly directory: string,
    private readonly open: (filePath: string) => Promise<ComicArchive> = openArchive,
  ) {}

  /**
   * Where the book's cover stands, what a resynchronization asks of every book before extracting the
   * missing covers: `cover` when it has one, beside it or in the local cache (two `stat`s, without reading
   * the image, nor asking whether a sidecar is a cloud placeholder: a cover there counts, it only has to be
   * downloaded); `failed` when it couldn't be made from this very file (see `knownFailure()`, one more
   * `stat`); `missing` otherwise. Never opens the book, so the caller can skip the broken ones before
   * anything costly (such as asking whether the comic itself is a cloud placeholder).
   */
  async state(filePath: string): Promise<'cover' | 'failed' | 'missing'> {
    for (const candidate of [coverSidecarPath(filePath), this.fileFor(filePath)]) {
      try {
        if ((await stat(candidate)).isFile()) return 'cover';
      } catch {
        // Not there: the next place, or none.
      }
    }
    return (await this.knownFailure(filePath, thumbnailKey(filePath))) ? 'failed' : 'missing';
  }

  /**
   * The cached thumbnail of a book, or null when there is none yet. Never generates one. The
   * sidecar comes first, unless it is a cloud placeholder (reading it would download it): the
   * local cache then answers, or nothing.
   */
  async read(filePath: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const sidecar = coverSidecarPath(filePath);
    try {
      // `stat` first: it does not download a placeholder, and spares `attrib` for the many books without a sidecar.
      await stat(sidecar);
      if (!(await isOnlineOnly(sidecar))) {
        return new Uint8Array(await readFile(sidecar));
      }
    } catch {
      // No sidecar (yet): the local cache may have one.
    }
    try {
      return new Uint8Array(await readFile(this.fileFor(filePath)));
    } catch {
      return null;
    }
  }

  /**
   * The thumbnail of a book, generated and cached first when missing. `readFirstPage` reads the
   * cover from an archive that is already open (the reader's); without it, the file is opened just
   * for this. Resolves to null when the book has no image page or can't be read.
   */
  ensure(filePath: string, readFirstPage?: () => Promise<ComicPage>): Promise<Uint8Array<ArrayBuffer> | null> {
    const key = thumbnailKey(filePath);
    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }
    const result = this.read(filePath).then(async (cached) => {
      if (cached || (!readFirstPage && (await this.knownFailure(filePath, key)))) {
        return cached;
      }
      return this.enqueue(() => this.generate(filePath, readFirstPage));
    });
    this.inFlight.set(key, result);
    void result.finally(() => this.inFlight.delete(key));
    return result;
  }

  /**
   * Generates the thumbnail of a book from an archive the caller has open (a folder scan), unless it
   * is already cached. Never throws: a book without a cover only goes without a thumbnail. The caller
   * is a timed decoder call (`inspect`), so the wait in the queue is bounded by `maxWaitMs`: past it the
   * cover is given up (the queued generation then does nothing) and made later, on demand or by the next
   * resynchronization, rather than letting the queue's backlog of covers cost the scan its own deadline.
   */
  async storeFromArchive(archive: ComicArchive, maxWaitMs = STORE_MAX_WAIT_MS): Promise<void> {
    if (await this.read(archive.path)) {
      return;
    }
    let abandoned = false;
    const queued = this.enqueue(async () => {
      if (abandoned) return null;
      return this.generate(archive.path, () => archive.readPage(0));
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        abandoned = true;
        resolve();
      }, maxWaitMs);
    });
    try {
      await Promise.race([queued, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Replaces a book's cover with a picture chosen by the user (any image `renderThumbnail()` accepts: it is
   * shrunk to the thumbnail size like a first page). Rejects with the decoding error when it isn't a usable
   * image, leaving the current cover as it was. Queued like a generation. When the cover can't go beside the
   * comic (setting off, read-only folder), an older sidecar is deleted if possible, since `read()` would prefer it.
   */
  replace(filePath: string, image: Uint8Array): Promise<void> {
    return this.enqueue(async () => {
      const thumbnail = await renderThumbnail(image);
      if (!(await this.write(filePath, thumbnail))) {
        await rm(coverSidecarPath(filePath), { force: true }).catch(() => undefined);
      } else {
        // The sidecar wins over the local cache: a stale local file would only waste space.
        await rm(this.fileFor(filePath), { force: true });
      }
      await this.forgetFailure(thumbnailKey(filePath));
    });
  }

  /**
   * Deletes the local cache's thumbnail of a book (removed from the library); does nothing when
   * there is none. A sidecar belongs to the comic's folder and is left alone.
   * Queued like a generation, so one still running for this book finishes first and its file is
   * deleted too, instead of being written after the deletion and left orphaned.
   */
  remove(filePath: string): Promise<void> {
    return this.enqueue(async () => {
      await this.forgetFailure(thumbnailKey(filePath));
      await rm(this.fileFor(filePath), { force: true });
    });
  }

  /**
   * Deletes every cached file that isn't the thumbnail of one of `filePaths`, including temporary
   * files left by a crash, and forgets the failures of the other books (all of them for an empty list,
   * which clears the cache). Queued like a generation, so it never deletes one being written.
   */
  prune(filePaths: readonly string[]): Promise<void> {
    const keys = new Set(filePaths.map(thumbnailKey));
    const keep = new Set([...keys].map((key) => key + THUMBNAIL_EXTENSION));
    keep.add(FAILED_COVERS_FILE);
    return this.enqueue(async () => {
      const failures = await this.loadFailures();
      for (const key of [...failures.keys()]) {
        if (!keys.has(key)) failures.delete(key);
      }
      await this.saveFailures();
      let names: string[];
      try {
        names = await readdir(this.directory);
      } catch {
        return;
      }
      await Promise.all(
        names.filter((name) => !keep.has(name)).map((name) => rm(path.join(this.directory, name), { force: true })),
      );
    });
  }

  /**
   * Brings the cache in line with the library after a JSON import: drops the thumbnails of books no
   * longer listed, then generates the missing ones, one book at a time, giving earlier failures a
   * new chance. Requests made meanwhile (the library page) take their turn between two books
   * instead of waiting for the whole rebuild.
   */
  async rebuild(filePaths: readonly string[]): Promise<void> {
    this.failed.clear();
    (await this.loadFailures()).clear();
    await this.prune(filePaths);
    for (const filePath of filePaths) {
      await this.ensure(filePath);
    }
  }

  private fileFor(filePath: string): string {
    return path.join(this.directory, thumbnailKey(filePath) + THUMBNAIL_EXTENSION);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async generate(
    filePath: string,
    readFirstPage?: () => Promise<ComicPage>,
  ): Promise<Uint8Array<ArrayBuffer> | null> {
    const key = thumbnailKey(filePath);
    try {
      const page = readFirstPage ? await readFirstPage() : await this.readCover(filePath);
      if (!page) {
        // No image page: opening the book again won't give it one.
        await this.recordFailure(filePath, key, null);
        return null;
      }
      const thumbnail = await renderThumbnail(page.data);
      await this.write(filePath, thumbnail);
      await this.forgetFailure(key);
      return thumbnail;
    } catch (error) {
      // An archive the reader closed meanwhile isn't the book's fault: only remember failures to open it.
      if (!readFirstPage) {
        await this.recordFailure(filePath, key, error);
      }
      return null;
    }
  }

  private loadFailures(): Promise<Map<string, FailedCover>> {
    this.failures ??= readFile(path.join(this.directory, FAILED_COVERS_FILE), 'utf8')
      .then((text) => {
        const failures = new Map<string, FailedCover>();
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null) return failures;
        // A file anyone can edit: only well-formed entries count.
        for (const [key, value] of Object.entries(parsed)) {
          const { size, mtimeMs } = (value ?? {}) as Partial<FailedCover>;
          if (typeof size === 'number' && typeof mtimeMs === 'number') failures.set(key, { size, mtimeMs });
        }
        return failures;
      })
      .catch(() => new Map<string, FailedCover>());
    return this.failures;
  }

  /** Writes the failures as they are now (deletes the file when there is none); a failed write only costs the memory of them. */
  private saveFailures(): Promise<void> {
    this.failuresSaved = this.failuresSaved.then(async () => {
      const failures = await this.loadFailures();
      const file = path.join(this.directory, FAILED_COVERS_FILE);
      try {
        if (failures.size === 0) {
          await rm(file, { force: true });
          return;
        }
        await mkdir(this.directory, { recursive: true });
        await this.writeAtomically(file, new TextEncoder().encode(JSON.stringify(Object.fromEntries(failures))));
      } catch {
        // Retried at the next change, or at the next session.
      }
    });
    return this.failuresSaved;
  }

  /** Whether the book's cover failed this session, or in an earlier one while its file was the same as now. */
  private async knownFailure(filePath: string, key: string): Promise<boolean> {
    if (this.failed.has(key)) return true;
    const failures = await this.loadFailures();
    const recorded = failures.get(key);
    if (!recorded) return false;
    try {
      const { size, mtimeMs } = await stat(filePath);
      if (size === recorded.size && mtimeMs === recorded.mtimeMs) {
        this.failed.add(key);
        return true;
      }
    } catch {
      // Gone or unreadable now: say nothing, the attempt will tell.
      return false;
    }
    // Replaced or repaired since: a new chance.
    failures.delete(key);
    await this.saveFailures();
    return false;
  }

  /**
   * Remembers that the book's cover failed: for the session, and across sessions when the failure is the
   * book's own (`error` null for a book without an image page) and its file can be described.
   */
  private async recordFailure(filePath: string, key: string, error: unknown): Promise<void> {
    this.failed.add(key);
    if (isPassingError(error)) return;
    try {
      const { size, mtimeMs } = await stat(filePath);
      (await this.loadFailures()).set(key, { size, mtimeMs });
      await this.saveFailures();
    } catch {
      // A file that can't be described can't be told apart from its repaired version: the session only.
    }
  }

  private async forgetFailure(key: string): Promise<void> {
    this.failed.delete(key);
    const failures = await this.loadFailures();
    if (failures.delete(key)) await this.saveFailures();
  }

  /** Beside the comic when the setting is on and its folder accepts it (read-only share, full disk…), else in the local cache. Returns whether the sidecar was written. */
  private async write(filePath: string, thumbnail: Uint8Array): Promise<boolean> {
    if (this.sidecars && (await this.writeAtomically(coverSidecarPath(filePath), thumbnail).catch(() => false))) {
      return true;
    }
    await mkdir(this.directory, { recursive: true });
    await this.writeAtomically(this.fileFor(filePath), thumbnail);
    return false;
  }

  /** Written aside then renamed, so a reader never sees a half-written file. */
  private async writeAtomically(target: string, data: Uint8Array): Promise<true> {
    const temporary = `${target}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, data);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return true;
  }

  private async readCover(filePath: string): Promise<ComicPage | null> {
    const archive = await this.open(filePath);
    try {
      return archive.pages.length > 0 ? await archive.readPage(0) : null;
    } finally {
      await archive.close();
    }
  }
}
