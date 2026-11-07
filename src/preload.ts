/**
 * Preload script: the only bridge between the renderer and the main process.
 * Expose a minimal, explicit API via contextBridge — never the raw ipcRenderer.
 * See https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
 * @module
 */
import { contextBridge, ipcRenderer } from 'electron';

import type { AchievementId, UnlockedAchievement } from './shared/achievements';
import type { AppInfo, AppLink, UpdateCheckResult } from './shared/app';
import type { ComicPage, OpenComicResult } from './shared/comic';
import type { DataChange } from './shared/data-changes';
import type {
  ClearCacheResult,
  ClearLibraryResult,
  BackupList,
  BackupResult,
  DatabaseLocation,
  DatabaseLocationResult,
  RestoreBackupResult,
  ExportResult,
  ImportResult,
} from './shared/data';
import type {
  AddFileResult,
  ImageScanProgress,
  LibraryEntry,
  MetadataUpdate,
  OrganizeResult,
  PickOrganizationFolderResult,
  RelinkFolderResult,
  CleanupAnalysisResult,
  ConvertCbrResult,
  ConvertDeflate64Result,
  Deflate64CountResult,
  CleanFoldersResult,
  ConvertCountResult,
  EmptyDeletedResult,
  OrphanFoldersCountResult,
  CleanupResult,
  RemoveEntryResult,
  RemoveEntriesResult,
  UnlinkedFolder,
  ResyncResult,
  UnorganizedCountResult,
  ScanProgress,
  ScanResult,
  SetCoverResult,
} from './shared/library';
import type { MetadataPageResult, MetadataQuery, MetadataSearchResult } from './shared/metadata';
import type { ReadingList, ReadingListAddResult, ReadingListOrderResult, ReadingListResult } from './shared/reading-list';
import type { ApiKeys, AppSettings, PublicSettings } from './shared/settings';
import type { ReadingHistoryEntry, ReadingStats } from './shared/stats';
import type { PickAvatarResult, UserResult, UsersState } from './shared/users';

/** The app itself (versions, OS languages, project links), as `window.tankobon.app`. */
export interface AppApi {
  /** Versions of the app, Electron, Chromium, Node.js and V8, and the OS and CPU architecture. */
  getInfo(): Promise<AppInfo>;
  /** The OS's preferred languages (BCP 47 tags, most preferred first), to resolve the `system` language setting as the main process does. */
  getSystemLanguages(): Promise<string[]>;
  /** Opens one of the project's pages (repository, documentation…) in the default browser. */
  openLink(link: AppLink): Promise<void>;
  /** Asks GitHub whether a release newer than the running version is published; a network failure comes back as an `error` result, not a rejection. */
  checkUpdate(): Promise<UpdateCheckResult>;
  /** The token of the comic the operating system asked to open (double click in the file explorer, "Open with…", a second launch with a file), or `null`; it is handed out once and opens like a `comic.pickFile` token. */
  takeLaunchFile(): Promise<string | null>;
  /** Subscribes to the main process's `app:launch-file` push, sent when such a comic is waiting (call `takeLaunchFile` then); returns the unsubscribe function. */
  onLaunchFile(listener: () => void): () => void;
}

/** Opening and reading comics, as `window.tankobon.comic`. */
export interface ComicApi {
  /** Opens a native file picker; resolves to an opaque token for the chosen file (to pass to `open`), or null if cancelled. The renderer never learns the path.
   * `addToLibrary` is true for the library's "add a file" (opening the token then always adds the book) and false for the reader's "open a file" (the book is added only if the `addOpenedBooksToLibrary` setting is on).
   */
  pickFile(addToLibrary: boolean): Promise<string | null>;
  /** Opens a comic and registers it in the library (or refreshes its entry); resolves with its saved page.
   * `ref` is a library entry id or a token from `pickFile`, never a path. A file that can't be opened (moved, deleted, corrupted, unsupported) resolves to an error result
   * with a message in the interface language, rather than rejecting.
   */
  open(ref: string): Promise<OpenComicResult>;
  /** Reads one page (0-based) of a comic opened with `open`, as image bytes. */
  readPage(id: string, index: number): Promise<ComicPage>;
  /** Closes a comic opened with `open`, releasing its archive in the main process. */
  close(id: string): Promise<void>;
}

/** The library and its per-entry fields, as `window.tankobon.library`. */
export interface LibraryApi {
  /** Every library entry, most recently opened first. */
  list(): Promise<LibraryEntry[]>;
  /** Opens a native file picker, then adds the chosen comic to the library without opening it; an unreadable file resolves to an error result rather than rejecting. The library organization then moves it, or offers to (`organization`). */
  addFile(): Promise<AddFileResult>;
  /** Opens a native directory picker, then adds every comic found under it, recursively. The library organization then moves them, or offers to (`organization`). */
  addFolder(): Promise<ScanResult>;
  /** Opens a native directory picker and makes the chosen folder the library organization's folder (the `libraryOrganizationFolder` setting, which `settings.set` refuses), also remembered among the folders `resync` walks. */
  pickOrganizationFolder(): Promise<PickOrganizationFolderResult>;
  /** Moves into the organized folder the comics an addition offered to move (`organization.pending.token` of its result), each into its own subfolder; a token works once. */
  organize(token: string): Promise<OrganizeResult>;
  /** How many library comics aren't in their place in the organized folder yet; an error result when the organization is off or its folder unreachable. */
  countUnorganized(): Promise<UnorganizedCountResult>;
  /** Moves every library comic not in its place yet into the organized folder (its own subfolder each), whenever it was added. Reports through `onScanProgress`; an error result when the organization is off, its folder unreachable, or a resynchronization or another organization is running. */
  organizeAll(): Promise<OrganizeResult>;
  /** First step of cleaning the books: lists the files that are not images in the CBZ of `ids` (the whole library when empty), grouped by extension, without touching anything. Progress goes over `onScanProgress`. The result's `token` is what `applyCleanup()` takes. */
  analyzeCleanup(ids: string[]): Promise<CleanupAnalysisResult>;
  /** Second step: rewrites the archives of the analysis `token` without those files, except the kinds whose extension (`.xml`, empty for none) is in `keptExtensions`. The original is replaced only once the new archive has been checked. The token works once. */
  applyCleanup(token: string, keptExtensions: string[]): Promise<CleanupResult>;
  /** How many CBR of the organized folder `convertCbr()` would convert, and what its `.deletedByTankobon` folder holds; an error when the organization is off or its folder unreachable. */
  countConvertible(): Promise<ConvertCountResult>;
  /** Writes each CBR of the organized folder as a CBZ beside it, points the book at it (progress, rating, tags and lists are kept) and moves the CBR to `.deletedByTankobon` at the root of the organized folder. Progress goes over `onScanProgress`. */
  convertCbr(): Promise<ConvertCbrResult>;
  /** How many CBZ of the library use the Deflate64 compression, which the reader can't inflate (`convertDeflate64()` rewrites them). Opens every CBZ, so progress goes over `onScanProgress`; an error result when another run on the files is in progress. */
  countDeflate64(): Promise<Deflate64CountResult>;
  /** Rewrites each Deflate64 CBZ of the library with standard compression, in place: the book keeps its path, progress, rating, tags and lists. The original is replaced only once the new archive has been checked. Progress goes over `onScanProgress`; an error result when another run on the files is in progress. */
  convertDeflate64(): Promise<ConvertDeflate64Result>;
  /** Deletes for good everything in the `.deletedByTankobon` folder of the organized folder. */
  emptyDeleted(): Promise<EmptyDeletedResult>;
  /** How many folders of the organized folder `cleanFolders()` would move: those holding no book, only `.nfo` files and cover images; an error when the organization is off or its folder unreachable. */
  countOrphanFolders(): Promise<OrphanFoldersCountResult>;
  /** Moves those orphan folders to the `.deletedByTankobon` folder of the organized folder; progress arrives through `onScanProgress`. The folders books are added from are never touched. */
  cleanFolders(): Promise<CleanFoldersResult>;
  /** The folders added with `addFolder`, which `resync` walks again, in the order they were added. */
  listFolders(): Promise<string[]>;
  /** Forgets one of those folders (a path returned by `listFolders`); its comics stay in the library. */
  removeFolder(folder: string): Promise<void>;
  /** The library folders that have no path on this machine yet (the library was made on another one): their comics are listed but their files can't be found until `relinkFolder`. */
  listUnlinkedFolders(): Promise<UnlinkedFolder[]>;
  /** Opens a native directory picker to say where an unlinked folder (an `id` returned by `listUnlinkedFolders`) is on this machine; the comics stored relative to it are found again. */
  relinkFolder(id: string): Promise<RelinkFolderResult>;
  /** Walks the remembered folders (and the organized folder, when the organization is on) again: new comics are added (then moved or offered by the organization, a comic dropped in the organized folder being moved into place), and comics whose file no longer exists are removed from the library (with their progress, rating, tags and reading-list places; the files on disk are never touched). A folder that can't be read is skipped and counted as `unreachable`. Comics of those folders without a `.nfo` get one written from their library information (an existing one is never overwritten), counted as `nfoWritten`, and the missing cover thumbnails of those comics are extracted, counted as `coversExtracted`. Stores the date as the `lastResyncAt` setting. Reports through `onScanProgress`; an error result when one is already running. */
  resync(): Promise<ResyncResult>;
  /** Subscribes to the progress of `addFolder`, `resync`, `organizeAll`, `convertCbr`, `countDeflate64`, `convertDeflate64` and `cleanFolders`; returns the unsubscribe function. */
  onScanProgress(listener: (progress: ScanProgress) => void): () => void;
  /** Where the background measure of the books' page sizes is now (it runs after an import, a resync or the first opening of a book); resolves with the state a window that loads late missed. */
  imageScanStatus(): Promise<ImageScanProgress>;
  /** Subscribes to the progress of that background measure; returns the unsubscribe function. */
  onImageScanProgress(listener: (progress: ImageScanProgress) => void): () => void;
  /** Removes an entry from the library. The file on disk is moved, with its cover and `.nfo` sidecars, to a `.deletedByTankobon` folder (the organized folder's when it lives there, else beside it) so that a resynchronization doesn't add it back, unless `deleteFile` is true: it then goes to the OS trash. An `error` result means the entry is gone from the library but the file could not be moved or trashed. */
  remove(id: string, deleteFile?: boolean): Promise<RemoveEntryResult>;
  /** Removes several entries from the library; with `deleteFiles`, their files (and the covers beside them) are also moved to the system trash. A file that can't be trashed is counted as failed, its entry is removed anyway. */
  removeMany(ids: string[], deleteFiles: boolean): Promise<RemoveEntriesResult>;
  /** Saves the last page read (0-based) of a library entry. */
  updateProgress(id: string, currentPage: number): Promise<void>;
  /** Sets the rating of a library entry: 0 (unrated) to 5. */
  updateRating(id: string, rating: number): Promise<void>;
  /** Replaces the tags of a library entry. */
  updateTags(id: string, tags: string[]): Promise<void>;
  /** Writes the given metadata fields (title, series, credits…) of a library entry; resolves with the updated entry, or null if it is gone. */
  updateMetadata(id: string, update: MetadataUpdate): Promise<LibraryEntry | null>;
  /** Writes the same metadata fields on several library entries at once (all or none); resolves with the number of entries updated (unknown ids are skipped). */
  updateMetadataMany(ids: string[], update: MetadataUpdate): Promise<number>;
  /** Cover thumbnail (first page, shrunk) of a library entry as WebP bytes, generated and cached first when missing; null if the entry is unknown or unreadable. */
  thumbnail(id: string): Promise<Uint8Array<ArrayBuffer> | null>;
  /** Replaces the cover thumbnail of a library entry with `image` (PNG, JPEG or WebP, at most 8 MiB, already cropped to the cover's 2:3 proportions by the caller); the main process shrinks it to the thumbnail size and writes it beside the comic (or in the local cache). A picture that can't be decoded comes back as an error result and leaves the current cover as it was. */
  setCover(id: string, image: Uint8Array): Promise<SetCoverResult>;
}

/** Reading lists (ordered piles of library entries), as `window.tankobon.readingLists`. */
export interface ReadingListApi {
  /** Every reading list, in the user's order (new lists last), each with its library entry ids in reading order. */
  list(): Promise<ReadingList[]>;
  /** Creates an empty reading list; refused when the name is empty. */
  create(name: string): Promise<ReadingListResult>;
  /** Renames a reading list; refused when the name is empty. */
  rename(id: string, name: string): Promise<ReadingListResult>;
  /** Deletes a reading list; its books stay in the library. */
  remove(id: string): Promise<void>;
  /** Appends a library entry to a reading list; refused when the list already holds 50 books. */
  addEntry(id: string, libraryId: string): Promise<ReadingListResult>;
  /** Appends several library entries to a reading list, in the order given: books already in it are skipped, and once it holds 50 books the rest are left out (the result counts each case). */
  addEntries(id: string, libraryIds: string[]): Promise<ReadingListAddResult>;
  /** Takes a library entry out of a reading list. */
  removeEntry(id: string, libraryId: string): Promise<ReadingListResult>;
  /** Stores a new order for a reading list; `entryIds` must hold exactly the list's current entries. */
  reorder(id: string, entryIds: string[]): Promise<ReadingListResult>;
  /** Stores a new order for the reading lists themselves; `listIds` must hold exactly the current lists. */
  reorderLists(listIds: string[]): Promise<ReadingListOrderResult>;
}

/** The achievements the user has earned, as `window.tankobon.achievements`. */
export interface AchievementsApi {
  /** Every achievement earned so far, with the moment it was earned. */
  list(): Promise<UnlockedAchievement[]>;
  /** Records achievements as earned (the renderer evaluates the rules); ones already earned are left as they are, an unknown id is refused. Resolves with those that are new, which `data:changed` announces too. */
  unlock(ids: AchievementId[]): Promise<UnlockedAchievement[]>;
}

/** Book information lookups in public APIs, as `window.tankobon.metadata`. */
export interface MetadataApi {
  /** Looks a book up in the public APIs enabled in the settings (Comic Vine, Google Books), or only in those named by `query.sources`. */
  search(query: MetadataQuery): Promise<MetadataSearchResult>;
  /** Reads a book from the page at `url`, a link the user pasted (Bédéthèque album, BDfugue product or Nautiljon volume). */
  fromPage(url: string): Promise<MetadataPageResult>;
  /** Stops the lookup this window is waiting for (`search()` or `fromPage()`): its requests are aborted and the call fails. Does nothing when none is under way. */
  cancel(): Promise<void>;
  /** Saves what the user accepted in the lookup dialog: updates the library entry, rewrites the `.nfo` beside the file and makes the cover thumbnail if it has none, or replaces it with the picture at `coverUrl` (an address of the sources' cover hosts, else ignored; a picture that can't be downloaded keeps the current cover); resolves with the updated entry, or null if it is gone. */
  apply(id: string, update: MetadataUpdate, coverUrl: string | null): Promise<LibraryEntry | null>;
}

/** The user's settings, as `window.tankobon.settings`. */
export interface SettingsApi {
  /** Every setting except the API keys, with defaults for the ones never stored. */
  getAll(): Promise<PublicSettings>;
  /** The metadata sources' API keys, kept out of `getAll()` so only the page that edits them loads them. */
  getApiKeys(): Promise<ApiKeys>;
  /** Stores one setting; the main process refuses an unknown key or a value its validator rejects. */
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;
}

/** Reading history for the statistics page, as `window.tankobon.stats`. */
export interface StatsApi {
  /** The reading history: the dates at which books were finished and the reading time per day, oldest first. */
  get(): Promise<ReadingStats>;
  /** Adds seconds (1 to 3600) of reading time on a library entry to today; the reader reports it every few minutes while a book is open. */
  addReadingTime(libraryId: string, seconds: number): Promise<void>;
  /** The active user's reading history for the profile page: reading time per day and book, most recent first, at most 200 lines. */
  history(): Promise<ReadingHistoryEntry[]>;
  /** Deletes the active user's reading history (the time spent per book and day, hence the statistics' reading time too); books, progress and completion dates are kept. */
  clearHistory(): Promise<void>;
}

/** JSON export and import of the library and settings, and clearing the library, as `window.tankobon.data`. */
export interface DataApi {
  /** Opens a native save dialog and writes a JSON export there; an error (full or read-only disk…) comes back as a result, not a rejection. */
  export(): Promise<ExportResult>;
  /** Opens a native file picker and merges the chosen JSON export into the local database. */
  import(): Promise<ImportResult>;
  /** Empties the library (entries, credits, people) and deletes every reading list and cover thumbnail; the comic files and the settings are left untouched. A failure comes back as an error result. */
  clearLibrary(): Promise<ClearLibraryResult>;
  /** Deletes the cover thumbnails kept in the application's cache folder (they are made again on demand); the library, the settings and the covers beside the comics are left untouched. A failure comes back as an error result. */
  clearCache(): Promise<ClearCacheResult>;
  /** Subscribes to the main process's `data:changed` push, sent after every database write (library, reading lists, settings); returns the unsubscribe function. */
  onChanged(listener: (change: DataChange) => void): () => void;
}

/**
 * The people sharing the app, as `window.tankobon.users`. Each has a nickname and a picture (no
 * password); ratings, tags, progress, reading lists, history, achievements and most settings are
 * personal, the library and its organization are common. Edits always concern the active user.
 */
export interface UsersApi {
  /** Every user and the active one's id. */
  list(): Promise<UsersState>;
  /** Adds a user (nickname trimmed, not empty, unique ignoring case) with the default picture; it doesn't switch to them. */
  create(nickname: string): Promise<UserResult>;
  /** Makes another user the active one: everything personal, and the interface language, follow. `data:changed` announces it to every window. */
  switch(id: string): Promise<UserResult>;
  /** Changes the active user's nickname. */
  rename(nickname: string): Promise<UserResult>;
  /** Opens a native picker for the active user's picture and returns the picked file's bytes (a PNG, JPEG or WebP), for the renderer to shrink before `setAvatar()`. */
  pickAvatar(): Promise<PickAvatarResult>;
  /** Stores the active user's picture (PNG, JPEG or WebP of at most 256 KiB). */
  setAvatar(bytes: Uint8Array): Promise<UserResult>;
  /** Puts the active user's default picture back. */
  removeAvatar(): Promise<UserResult>;
  /** Deletes the active user and all their personal data (progress, ratings, tags, lists, statistics, achievements, settings); the library is untouched. Refused for the last remaining user. On success the result is the user the app switched to. */
  remove(): Promise<UserResult>;
}

/** Where the database file lives, as `window.tankobon.database`. */
export interface DatabaseApi {
  /** Where the database file currently lives. */
  getLocation(): Promise<DatabaseLocation>;
  /** Opens a native directory picker; the new location only takes effect on the next start. */
  chooseLocation(): Promise<DatabaseLocationResult>;
  /** Points the app back at the default location; takes effect on the next start. */
  resetLocation(): Promise<DatabaseLocation>;
  /** Names the database file (`.db` is added when missing; null goes back to `tankobon.db`); an invalid name comes back as an error result. Like the folder, it takes effect on the next start and the existing file is not renamed. */
  setFileName(fileName: string | null): Promise<DatabaseLocationResult>;
  /** Restarts the app, e.g. to open the database from its new location. */
  relaunch(): Promise<void>;
  /** The copies of the database kept beside it, most recent first, and the one waiting to be restored. */
  listBackups(): Promise<BackupList>;
  /** Makes a copy of the database now (and deletes the ones beyond the number to keep). */
  createBackup(): Promise<BackupResult>;
  /** Schedules the restoration of a copy (by its `name`): the database file is overwritten at the next start. */
  restoreBackup(name: string): Promise<RestoreBackupResult>;
  /** Cancels a restoration that has not been applied yet. */
  cancelRestore(): Promise<void>;
}

/**
 * Type of the `window.tankobon` object the renderer uses to reach the main process (see
 * `src/global.d.ts`), one member per area. Each method maps to one IPC channel, listed in the
 * generated IPC reference.
 */
export interface TankobonApi {
  /** The app itself: versions, OS languages and project links. */
  app: AppApi;
  /** Opening and reading comics. */
  comic: ComicApi;
  /** The library and its per-entry fields. */
  library: LibraryApi;
  /** Reading lists. */
  readingLists: ReadingListApi;
  /** Reading statistics. */
  stats: StatsApi;
  /** The user's settings. */
  settings: SettingsApi;
  /** JSON export and import. */
  data: DataApi;
  /** Location of the database file. */
  database: DatabaseApi;
  /** Book information lookups. */
  metadata: MetadataApi;
  /** Achievements earned. */
  achievements: AchievementsApi;
  /** The users of the app. */
  users: UsersApi;
}

// Mirror of the CHANNELS constants in main/ipc/*.ts (preload cannot import main code). The method
// descriptions live on the interfaces above, where TypeDoc and the IPC reference read them.
const api: TankobonApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info'),
    getSystemLanguages: () => ipcRenderer.invoke('app:get-system-languages'),
    openLink: (link) => ipcRenderer.invoke('app:open-link', link),
    checkUpdate: () => ipcRenderer.invoke('app:check-update'),
    takeLaunchFile: () => ipcRenderer.invoke('app:take-launch-file'),
    onLaunchFile: (listener) => {
      const handler = () => listener();
      ipcRenderer.on('app:launch-file', handler);
      return () => {
        ipcRenderer.removeListener('app:launch-file', handler);
      };
    },
  },
  comic: {
    pickFile: (addToLibrary) => ipcRenderer.invoke('comic:pick-file', addToLibrary),
    open: (filePath) => ipcRenderer.invoke('comic:open', filePath),
    readPage: (id, index) => ipcRenderer.invoke('comic:read-page', id, index),
    close: (id) => ipcRenderer.invoke('comic:close', id),
  },
  library: {
    list: () => ipcRenderer.invoke('library:list'),
    addFile: () => ipcRenderer.invoke('library:add-file'),
    addFolder: () => ipcRenderer.invoke('library:add-folder'),
    pickOrganizationFolder: () => ipcRenderer.invoke('library:pick-organization-folder'),
    organize: (token) => ipcRenderer.invoke('library:organize', token),
    countUnorganized: () => ipcRenderer.invoke('library:count-unorganized'),
    organizeAll: () => ipcRenderer.invoke('library:organize-all'),
    analyzeCleanup: (ids) => ipcRenderer.invoke('library:analyze-cleanup', ids),
    applyCleanup: (token, keptExtensions) => ipcRenderer.invoke('library:apply-cleanup', token, keptExtensions),
    countConvertible: () => ipcRenderer.invoke('library:count-convertible'),
    convertCbr: () => ipcRenderer.invoke('library:convert-cbr'),
    countDeflate64: () => ipcRenderer.invoke('library:count-deflate64'),
    convertDeflate64: () => ipcRenderer.invoke('library:convert-deflate64'),
    emptyDeleted: () => ipcRenderer.invoke('library:empty-deleted'),
    countOrphanFolders: () => ipcRenderer.invoke('library:count-orphan-folders'),
    cleanFolders: () => ipcRenderer.invoke('library:clean-folders'),
    onScanProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ScanProgress) => listener(progress);
      ipcRenderer.on('library:scan-progress', handler);
      return () => {
        ipcRenderer.removeListener('library:scan-progress', handler);
      };
    },
    imageScanStatus: () => ipcRenderer.invoke('library:image-scan-status'),
    onImageScanProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ImageScanProgress) => listener(progress);
      ipcRenderer.on('library:image-scan-progress', handler);
      return () => {
        ipcRenderer.removeListener('library:image-scan-progress', handler);
      };
    },
    listFolders: () => ipcRenderer.invoke('library:list-folders'),
    removeFolder: (folder) => ipcRenderer.invoke('library:remove-folder', folder),
    listUnlinkedFolders: () => ipcRenderer.invoke('library:list-unlinked-folders'),
    relinkFolder: (id) => ipcRenderer.invoke('library:relink-folder', id),
    resync: () => ipcRenderer.invoke('library:resync'),
    remove: (id, deleteFile = false) => ipcRenderer.invoke('library:remove', id, deleteFile),
    removeMany: (ids, deleteFiles) => ipcRenderer.invoke('library:remove-many', ids, deleteFiles),
    updateProgress: (id, currentPage) => ipcRenderer.invoke('library:update-progress', id, currentPage),
    updateRating: (id, rating) => ipcRenderer.invoke('library:update-rating', id, rating),
    updateTags: (id, tags) => ipcRenderer.invoke('library:update-tags', id, tags),
    updateMetadata: (id, update) => ipcRenderer.invoke('library:update-metadata', id, update),
    updateMetadataMany: (ids, update) => ipcRenderer.invoke('library:update-metadata-many', ids, update),
    thumbnail: (id) => ipcRenderer.invoke('library:thumbnail', id),
    setCover: (id, image) => ipcRenderer.invoke('library:set-cover', id, image),
  },
  readingLists: {
    list: () => ipcRenderer.invoke('reading-lists:list'),
    create: (name) => ipcRenderer.invoke('reading-lists:create', name),
    rename: (id, name) => ipcRenderer.invoke('reading-lists:rename', id, name),
    remove: (id) => ipcRenderer.invoke('reading-lists:remove', id),
    addEntry: (id, libraryId) => ipcRenderer.invoke('reading-lists:add-entry', id, libraryId),
    addEntries: (id, libraryIds) => ipcRenderer.invoke('reading-lists:add-entries', id, libraryIds),
    removeEntry: (id, libraryId) => ipcRenderer.invoke('reading-lists:remove-entry', id, libraryId),
    reorder: (id, entryIds) => ipcRenderer.invoke('reading-lists:reorder', id, entryIds),
    reorderLists: (listIds) => ipcRenderer.invoke('reading-lists:reorder-lists', listIds),
  },
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    addReadingTime: (libraryId, seconds) => ipcRenderer.invoke('stats:add-reading-time', libraryId, seconds),
    history: () => ipcRenderer.invoke('stats:history'),
    clearHistory: () => ipcRenderer.invoke('stats:clear-history'),
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    getApiKeys: () => ipcRenderer.invoke('settings:get-api-keys'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
    clearLibrary: () => ipcRenderer.invoke('data:clear-library'),
    clearCache: () => ipcRenderer.invoke('data:clear-cache'),
    onChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, change: DataChange) => listener(change);
      ipcRenderer.on('data:changed', handler);
      return () => {
        ipcRenderer.removeListener('data:changed', handler);
      };
    },
  },
  database: {
    getLocation: () => ipcRenderer.invoke('database:get-location'),
    chooseLocation: () => ipcRenderer.invoke('database:choose-location'),
    resetLocation: () => ipcRenderer.invoke('database:reset-location'),
    setFileName: (fileName) => ipcRenderer.invoke('database:set-file-name', fileName),
    relaunch: () => ipcRenderer.invoke('database:relaunch'),
    listBackups: () => ipcRenderer.invoke('database:list-backups'),
    createBackup: () => ipcRenderer.invoke('database:create-backup'),
    restoreBackup: (name) => ipcRenderer.invoke('database:restore-backup', name),
    cancelRestore: () => ipcRenderer.invoke('database:cancel-restore'),
  },
  metadata: {
    search: (query) => ipcRenderer.invoke('metadata:search', query),
    fromPage: (url) => ipcRenderer.invoke('metadata:from-page', url),
    cancel: () => ipcRenderer.invoke('metadata:cancel'),
    apply: (id, update, coverUrl) => ipcRenderer.invoke('metadata:apply', id, update, coverUrl),
  },
  achievements: {
    list: () => ipcRenderer.invoke('achievements:list'),
    unlock: (ids) => ipcRenderer.invoke('achievements:unlock', ids),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (nickname) => ipcRenderer.invoke('users:create', nickname),
    switch: (id) => ipcRenderer.invoke('users:switch', id),
    rename: (nickname) => ipcRenderer.invoke('users:rename', nickname),
    pickAvatar: () => ipcRenderer.invoke('users:pick-avatar'),
    setAvatar: (bytes) => ipcRenderer.invoke('users:set-avatar', bytes),
    removeAvatar: () => ipcRenderer.invoke('users:remove-avatar'),
    remove: () => ipcRenderer.invoke('users:remove'),
  },
};

contextBridge.exposeInMainWorld('tankobon', api);
