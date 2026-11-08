/**
 * What happens to the library's files when comics are added or the library is walked again: the
 * library organization (moving comics into the organized folder, see `library-organizer.ts`), the
 * resynchronization with the remembered folders, and the lock that keeps the two from running at
 * once. Kept out of the IPC layer, which only calls it, so it runs under Vitest.
 * @module
 */
import { randomUUID } from 'node:crypto';

import type { DataChange } from '../../shared/data-changes';
import { t } from '../../shared/i18n';
import type {
  OrganizationOutcome,
  OrganizeResult,
  ResyncResult,
  ScanProgress,
  UnorganizedCountResult,
} from '../../shared/library';
import type { LibraryFolderRepository } from '../db/library-folder-repository';
import type { LibraryRepository } from '../db/library-repository';
import type { SettingsRepository } from '../db/settings-repository';
import type { ArchiveSummary, CoverState } from '../decoder/protocol';
import { isOnlineOnly } from './cloud-files';
import type { ImageStatsScanner } from './image-stats-scanner';
import { organizeEntries, planOrganization, unorganizedIds, type OrganizationTarget } from './library-organizer';
import { resyncLibrary } from './library-sync';
import { isDirectory, organizedFolderProblem } from './organized-folder';

/** The part of the decoder process these services call: opening a file to count its pages, and dropping a cover. */
export interface LibraryDecoder {
  /** Counts a file's pages and caches its cover. */
  inspect(filePath: string): Promise<ArchiveSummary>;
  /** A book's thumbnail, generated when missing (unless `cachedOnly`); null when it has none. */
  thumbnail(filePath: string, archiveId?: string, cachedOnly?: boolean): Promise<Uint8Array | null>;
  /** Where a book's cover stands (has one, failed before, missing), without reading it nor opening the book. */
  coverState(filePath: string): Promise<CoverState>;
  /** Deletes a book's cached thumbnail. */
  removeThumbnail(filePath: string): Promise<void>;
}

/** Announces a write to every window (`data:changed`); what the IPC layer passes as `notify`. */
export type LibraryNotifier = (change: DataChange) => void;

/** What can hold the {@link LibraryRunLock}. */
export type LibraryRun = 'resync' | 'organize' | 'add' | 'cleanup' | 'convert' | 'folders';

/**
 * Lets one long run over the library files at a time (a resynchronization, adding a file or a folder,
 * organizing, cleaning the books): moving or rewriting files while a walk registers them could register
 * a file twice, or recreate one that just moved.
 */
export interface LibraryRunLock {
  /** Takes the lock for `run`; false when another run holds it. */
  tryStart(run: LibraryRun): boolean;
  /** Releases the lock. */
  end(): void;
  /** The translated refusal for a run that couldn't start. */
  busyMessage(): string;
}

/** A free {@link LibraryRunLock}; one is shared by the organizer and the resynchronizer. */
export function createLibraryRunLock(): LibraryRunLock {
  let holder: LibraryRun | null = null;
  return {
    tryStart(run) {
      if (holder) return false;
      holder = run;
      return true;
    },
    end() {
      holder = null;
    },
    busyMessage() {
      if (holder === 'resync') return t('errors:library.resyncRunning');
      if (holder === 'folders') return t('errors:library.foldersRunning');
      if (holder === 'convert') return t('errors:library.convertRunning');
      return holder === 'cleanup' ? t('errors:library.cleanupRunning') : t('errors:library.organizeRunning');
    },
  };
}

/** The library organization (`AppSettings.libraryOrganization`) as the handlers use it; built once in `main.ts`. */
export interface LibraryOrganizer {
  /**
   * The folders a resynchronization walks: the remembered ones, plus the organized folder when the
   * organization is on (so a comic dropped there by hand is found, then moved into place).
   */
  watchedFolders(folders: string[]): string[];
  /**
   * Applies the organization to the comics an addition just brought in (see `planOrganization`):
   * moves those to move now and keeps the others behind a token for `organize()`.
   */
  afterAdd(added: { id: string; path: string }[]): Promise<OrganizationOutcome>;
  /** Moves the comics an earlier `afterAdd()` offered, as the user accepted. A token works once. */
  organize(token: string): Promise<OrganizeResult>;
  /** How many library comics aren't in their place in the organized folder yet (an error when the organization is off or its folder unreachable). */
  countUnorganized(): Promise<UnorganizedCountResult>;
  /**
   * Moves every library comic not in its place yet into the organized folder, one at a time,
   * reporting each through `onProgress`. Holds the `lock`, like a resynchronization.
   */
  organizeAll(onProgress?: (progress: ScanProgress) => void): Promise<OrganizeResult>;
  /** The lock shared with the resynchronizer. */
  lock: LibraryRunLock;
}

/** How many offers `createLibraryOrganizer` remembers; an older token expires. */
const MAX_PENDING_OFFERS = 20;

/** The outcome of an addition the organization had nothing to do with. */
export const NOTHING_ORGANIZED: OrganizationOutcome = { moved: 0, failed: 0, pending: null };

/** Builds the organizer, built once in `main.ts` and shared by the IPC handlers and the resynchronizer. */
export function createLibraryOrganizer(
  repo: LibraryRepository,
  settings: SettingsRepository,
  decoder: LibraryDecoder,
  notify: LibraryNotifier,
): LibraryOrganizer {
  // Token → ids of the comics offered. The renderer only ever holds the token, never a path or a
  // list it could make up.
  const offers = new Map<string, string[]>();
  const lock = createLibraryRunLock();

  const current = () => {
    const {
      libraryOrganization: mode,
      libraryOrganizationFolder: root,
      libraryStructure: structure,
      libraryFileName: fileName,
      libraryIgnoreArticles: ignoreArticles,
      libraryArticles,
      libraryVolumePrefix: volumePrefix,
      libraryVolumePrefixNumericOnly: prefixNumericOnly,
    } = settings.getAll();
    return { mode, root, structure, fileName, articles: ignoreArticles ? libraryArticles : [], volumePrefix, prefixNumericOnly };
  };

  /** The organized folder when the organization is on and its folder is there, else the error to return. */
  const usableRoot = async (): Promise<{ target: OrganizationTarget } | { status: 'error'; message: string }> => {
    const { mode, root, structure, fileName, articles, volumePrefix, prefixNumericOnly } = current();
    const problem = await organizedFolderProblem(mode, root);
    return problem === null
      ? { target: { root, structure, fileName, articles, volumePrefix, prefixNumericOnly } }
      : { status: 'error', message: problem };
  };

  const move = async (
    target: OrganizationTarget,
    ids: string[],
    onProgress?: (processed: number, total: number, file: string) => void,
  ) => {
    const summary = await organizeEntries(repo, target, ids, onProgress);
    if (summary.moved.length > 0) {
      notify({ scope: 'library' });
      // Covers are cached by path: the old ones are useless, the new ones come back on demand.
      await Promise.all(summary.moved.map((entry) => decoder.removeThumbnail(entry.from).catch(() => undefined)));
    }
    return { moved: summary.moved.length, failed: summary.failed };
  };

  return {
    watchedFolders(folders) {
      const { mode, root } = current();
      return mode === 'off' || root === '' || folders.includes(root) ? folders : [...folders, root];
    },

    async afterAdd(added) {
      const { mode, root, structure, fileName, articles } = current();
      const plan = planOrganization(mode, root, added);
      if (plan.now.length === 0 && plan.offer.length === 0) return NOTHING_ORGANIZED;
      if (!(await isDirectory(root))) {
        // An unplugged drive: nothing moves, and offering would only fail again.
        return { moved: 0, failed: plan.now.length + plan.offer.length, pending: null };
      }
      const { moved, failed } = await move({ root, structure, fileName, articles }, plan.now);
      if (plan.offer.length === 0) return { moved, failed, pending: null };

      const token = randomUUID();
      offers.set(token, plan.offer);
      for (const oldest of offers.keys()) {
        if (offers.size <= MAX_PENDING_OFFERS) break;
        offers.delete(oldest);
      }
      return { moved, failed, pending: { token, count: plan.offer.length, folder: root } };
    },

    async organize(token) {
      const ids = offers.get(token);
      if (!ids) return { status: 'error', message: t('errors:library.organizationExpired') };
      const usable = await usableRoot();
      if (!('target' in usable)) return usable;
      // The offer is kept when another run holds the lock: the user can accept it again.
      if (!lock.tryStart('organize')) return { status: 'error', message: lock.busyMessage() };
      try {
        offers.delete(token);
        return { status: 'ok', ...(await move(usable.target, ids)) };
      } finally {
        lock.end();
      }
    },

    async countUnorganized() {
      const usable = await usableRoot();
      if (!('target' in usable)) return usable;
      return { status: 'ok', count: unorganizedIds(repo, usable.target).length, folder: usable.target.root };
    },

    async organizeAll(onProgress = () => undefined) {
      const usable = await usableRoot();
      if (!('target' in usable)) return usable;
      if (!lock.tryStart('organize')) return { status: 'error', message: lock.busyMessage() };
      try {
        const ids = unorganizedIds(repo, usable.target);
        const result = await move(usable.target, ids, (processed, total, currentFile) =>
          onProgress({ phase: 'importing', processed, total, currentFile }),
        );
        return { status: 'ok', ...result };
      } finally {
        onProgress({ phase: 'done', processed: 0, total: 0, currentFile: '' });
        lock.end();
      }
    },

    lock,
  };
}

/** Everything a resynchronization needs; built once in `main.ts`. */
export interface Resynchronizer {
  /**
   * Walks the library's folders again (new comics added, comics whose file is gone removed), stores
   * the date in `lastResyncAt` and tells the views. Only one runs at a time: a call during another
   * one resolves to an error result.
   */
  run(onProgress?: (progress: ScanProgress) => void): Promise<ResyncResult>;
  /**
   * Stops the run in progress between two files; it then resolves with `cancelled`, keeping what it
   * did. False when no resynchronization is running.
   */
  cancel(): boolean;
  /**
   * The last progress of the run in progress, null when none runs: what a window that loads during a
   * resynchronization (the one started at launch) shows before the next progress arrives.
   */
  progress(): ScanProgress | null;
}

/** Builds the resynchronizer, built once in `main.ts`; it takes the organizer's lock. */
export function createResynchronizer(
  repo: LibraryRepository,
  folders: LibraryFolderRepository,
  settings: SettingsRepository,
  decoder: LibraryDecoder,
  notify: LibraryNotifier,
  imageScanner: ImageStatsScanner,
  organizer: LibraryOrganizer,
  // Who the run is for: the date and the organization are the user's who started it, not whoever is active at the end.
  activeUser: () => string = () => '',
): Resynchronizer {
  // The run in progress, to stop it; null between runs.
  let running: AbortController | null = null;
  let latest: ScanProgress | null = null;
  return {
    async run(onProgress = () => undefined) {
      if (!organizer.lock.tryStart('resync')) return { status: 'error', message: organizer.lock.busyMessage() };
      const startedBy = activeUser();
      const controller = new AbortController();
      running = controller;
      const report = (progress: ScanProgress) => {
        latest = progress.phase === 'done' ? null : progress;
        onProgress(progress);
      };
      try {
        const summary = await resyncLibrary(
          repo,
          organizer.watchedFolders(folders.list()),
          report,
          (filePath) => decoder.inspect(filePath),
          // Asked of every book: a cover already there, or one that failed from this very file, costs a few
          // `stat`s; only a missing one is worth checking for a cloud placeholder (an `attrib` process on
          // Windows), which isn't read.
          async (filePath) =>
            (await decoder.coverState(filePath)) === 'missing' &&
            !(await isOnlineOnly(filePath)) &&
            (await decoder.thumbnail(filePath)) !== null,
          settings.getAll().libraryWriteNfo,
          controller.signal,
        );
        // The user switched meanwhile: the organized folder and the date are now another user's settings.
        // A stopped run is not a resynchronization: no date, and nothing moved after the user asked to stop.
        const sameUser = activeUser() === startedBy;
        const complete = sameUser && !summary.cancelled;
        const organization = complete ? await organizer.afterAdd(summary.addedEntries) : NOTHING_ORGANIZED;
        const finishedAt = new Date().toISOString();
        if (complete) settings.set('lastResyncAt', finishedAt);

        notify({ scope: 'library' });
        if (complete) notify({ scope: 'settings', values: { lastResyncAt: finishedAt } });
        void imageScanner.kick();
        if (summary.removed > 0) {
          // The removed books left the reading lists they were in, and their covers are useless.
          notify({ scope: 'readingLists' });
          await Promise.all(summary.removedEntries.map((entry) => decoder.removeThumbnail(entry.path).catch(() => undefined)));
        }
        return {
          status: 'ok',
          added: summary.added,
          removed: summary.removed,
          failed: summary.failed,
          failures: summary.failures,
          unreachable: summary.unreachable,
          nfoWritten: summary.nfoWritten,
          coversExtracted: summary.coversExtracted,
          finishedAt,
          cancelled: summary.cancelled,
          organization,
        };
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
      } finally {
        running = null;
        latest = null;
        organizer.lock.end();
      }
    },

    progress() {
      return latest;
    },

    cancel() {
      if (!running || running.signal.aborted) return false;
      running.abort();
      return true;
    },
  };
}
