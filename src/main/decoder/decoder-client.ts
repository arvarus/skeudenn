/**
 * Main-process side of the decoder process: sends it calls and turns its crashes into errors.
 * @module
 */
import type { ArchiveInfo, ComicPage } from '../../shared/comic';
import type { ConvertedArchive } from '../services/cbr-converter';
import type { Deflate64Converted } from '../services/cbz-deflate64';
import type { CleanedArchive, JunkEntry } from '../services/cbz-cleaner';
import { currentLanguage, t, type Language } from '../../shared/i18n';
import type {
  ArchiveSummary,
  DecoderInbound,
  DecoderMethod,
  DecoderMethods,
  DecoderRequest,
  DecoderResponse,
  PageSizeAverage,
} from './protocol';

/** A running decoder process, as the client sees it: Electron's `utilityProcess` in the app, a fake in tests. */
export interface DecoderChannel {
  /** Sends a message to the process. */
  post(message: DecoderInbound): void;
  /** Registers the receiver of the process's answers (once, right after spawning). */
  onResponse(listener: (response: DecoderResponse) => void): void;
  /** Registers what runs when the process is gone, crashed or killed (once, right after spawning). */
  onExit(listener: () => void): void;
  /** Stops the process. */
  kill(): void;
}

interface Pending {
  resolve: (result: never) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/** How long the calls that open a file may take before the decoder process is abandoned (ADR 0018). */
export const OPEN_TIMEOUT_MS = 60_000;

/** The calls bounded by a timeout: the ones that parse a whole file on untrusted input. */
const TIMED_METHODS: ReadonlySet<DecoderMethod> = new Set<DecoderMethod>(['open', 'inspect', 'measure', 'listJunk']);

/**
 * Calls into the decoder process, started on the first call. When it dies (a native crash, an
 * out-of-memory kill on a booby-trapped file) every call waiting for it rejects with a "could not
 * be decoded" error, and the next call starts a fresh process: the app, the database and the
 * window are untouched. Archives opened in the dead process are gone with it.
 *
 * A call that opens a file (`open`, `inspect`, `measure`) that is still unanswered after `timeoutMs`
 * counts as a hang (a file that makes a decoder loop): the process is killed like after a crash,
 * the call rejects with a "took too long" error, the others with the crash error.
 */
export class DecoderClient {
  private channel: DecoderChannel | undefined;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private language: Language = currentLanguage();
  private sidecarCovers = true;

  /** `spawn` starts a decoder process; `thumbnailsDirectory` is where its thumbnail cache lives. */
  constructor(
    private readonly spawn: () => DecoderChannel,
    private readonly thumbnailsDirectory: string,
    private readonly timeoutMs: number = OPEN_TIMEOUT_MS,
  ) {}

  /** Opens a comic in the decoder process; see `DecoderMethods.open`. */
  open(filePath: string): Promise<ArchiveInfo> {
    return this.call('open', filePath);
  }

  /** Reads a page of an open comic. */
  readPage(id: string, index: number): Promise<ComicPage> {
    return this.call('readPage', id, index);
  }

  /** Closes an open comic. */
  close(id: string): Promise<void> {
    return this.call('close', id);
  }

  /** Counts a file's pages (and caches its cover); see `DecoderMethods.inspect`. */
  inspect(filePath: string): Promise<ArchiveSummary> {
    return this.call('inspect', filePath);
  }

  /** Averages a file's page dimensions; see `DecoderMethods.measure`. */
  measure(filePath: string): Promise<PageSizeAverage | null> {
    return this.call('measure', filePath);
  }

  /** The non-image files of a CBZ, null for another format; see `DecoderMethods.listJunk`. */
  listJunk(filePath: string): Promise<JunkEntry[] | null> {
    return this.call('listJunk', filePath);
  }

  /** Writes a CBR as a CBZ; see `DecoderMethods.convertCbr`. Not timed: a large archive may take long. */
  convertCbr(cbrPath: string, cbzPath: string): Promise<ConvertedArchive> {
    return this.call('convertCbr', cbrPath, cbzPath);
  }

  /** Whether a CBZ uses Deflate64; see `DecoderMethods.hasDeflate64`. */
  hasDeflate64(filePath: string): Promise<boolean> {
    return this.call('hasDeflate64', filePath);
  }

  /** Rewrites a CBZ with standard compression; see `DecoderMethods.convertDeflate64`. Not timed: a large archive may take long. */
  convertDeflate64(filePath: string): Promise<Deflate64Converted> {
    return this.call('convertDeflate64', filePath);
  }

  /** Rewrites a CBZ without the entries `names`; see `DecoderMethods.cleanArchive`. */
  cleanArchive(filePath: string, names: string[]): Promise<CleanedArchive> {
    return this.call('cleanArchive', filePath, names);
  }

  /** A book's thumbnail, generated when missing (unless `cachedOnly`); null when it has no cover. */
  thumbnail(filePath: string, archiveId?: string, cachedOnly?: boolean): Promise<Uint8Array<ArrayBuffer> | null> {
    return this.call('thumbnail', filePath, archiveId, cachedOnly);
  }

  /** Whether a book has a thumbnail already, without reading it; see `DecoderMethods.hasThumbnail`. */
  hasThumbnail(filePath: string): Promise<boolean> {
    return this.call('hasThumbnail', filePath);
  }

  /** Replaces a book's cover with `image`; rejects when it isn't a usable image. */
  setThumbnail(filePath: string, image: Uint8Array): Promise<void> {
    return this.call('setThumbnail', filePath, image);
  }

  /** Deletes a book's thumbnail. */
  removeThumbnail(filePath: string): Promise<void> {
    return this.call('removeThumbnail', filePath);
  }

  /** Deletes the thumbnails of books that aren't in `filePaths`. */
  pruneThumbnails(filePaths: string[]): Promise<void> {
    return this.call('pruneThumbnails', filePaths);
  }

  /** Prunes, then generates the missing thumbnails of `filePaths`. */
  rebuildThumbnails(filePaths: string[]): Promise<void> {
    return this.call('rebuildThumbnails', filePaths);
  }

  /** Switches the language of the messages the decoder process produces. */
  setLanguage(language: Language): void {
    this.language = language;
    this.channel?.post({ type: 'language', language });
  }

  /** Whether the covers it makes go beside the comics (`AppSettings.librarySidecarCovers`). */
  setSidecarCovers(enabled: boolean): void {
    this.sidecarCovers = enabled;
    this.channel?.post({ type: 'sidecarCovers', enabled });
  }

  /** Stops the decoder process (app quit); a later call would start another one. */
  dispose(): void {
    this.channel?.kill();
  }

  private call<M extends DecoderMethod>(
    method: M,
    ...args: Parameters<DecoderMethods[M]>
  ): Promise<Awaited<ReturnType<DecoderMethods[M]>>> {
    const channel = this.ensureChannel();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const pending: Pending = { resolve: resolve as Pending['resolve'], reject };
      if (TIMED_METHODS.has(method)) {
        pending.timer = setTimeout(() => this.abandon(channel, id), this.timeoutMs);
      }
      this.pending.set(id, pending);
      channel.post({ type: 'request', id, method, args } as DecoderRequest);
    });
  }

  private ensureChannel(): DecoderChannel {
    if (this.channel) {
      return this.channel;
    }
    const channel = this.spawn();
    this.channel = channel;
    channel.onResponse((response) => this.settle(response));
    channel.onExit(() => this.handleExit(channel));
    channel.post({ type: 'init', thumbnailsDirectory: this.thumbnailsDirectory, language: this.language, sidecarCovers: this.sidecarCovers });
    return channel;
  }

  private settle(response: DecoderResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.ok) {
      pending.resolve(response.result as never);
    } else {
      pending.reject(new Error(response.message));
    }
  }

  private handleExit(channel: DecoderChannel): void {
    if (this.channel !== channel) {
      return;
    }
    this.channel = undefined;
    this.rejectAll(t('errors:decoder.crashed'));
  }

  /** The call `id` hung: kills the process (its other calls fail like in a crash) and starts afresh next time. */
  private abandon(channel: DecoderChannel, id: number): void {
    if (this.channel !== channel || !this.pending.has(id)) {
      return;
    }
    this.channel = undefined;
    const hung = this.pending.get(id);
    this.pending.delete(id);
    clearTimeout(hung?.timer);
    hung?.reject(new Error(t('errors:decoder.timeout')));
    this.rejectAll(t('errors:decoder.crashed'));
    channel.kill();
  }

  private rejectAll(message: string): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const { reject, timer } of pending) {
      clearTimeout(timer);
      reject(new Error(message));
    }
  }
}
