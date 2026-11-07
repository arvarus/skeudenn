/**
 * Library types shared between the main process and the renderer (via preload).
 * @module
 */

/**
 * The tag that marks a book as read, also one of the library page's quick tags. It is stored as
 * is whatever the interface language (existing libraries and exports carry it); only its label
 * is translated.
 */
export const READ_TAG = 'Lu';

/** A comic registered in the local library database. */
export interface LibraryEntry {
  id: string;
  /** Absolute path on disk. */
  path: string;
  title: string;
  pageCount: number;
  /** Last page read, for resuming where the user left off. */
  currentPage: number;
  /** ISO timestamps. */
  addedAt: string;
  lastOpenedAt: string;
  /** Total entries in the archive (not just image pages). */
  fileCount: number;
  /** Size in bytes of the archive file on disk. */
  fileSize: number;
  /** User rating, 0 (unrated) to 5. */
  rating: number;
  /** Free-form user labels, e.g. "Lu", "À lire". */
  tags: string[];
  /**
   * Whether `title` was set by the user (accepted from a metadata lookup or typed in the edit form)
   * rather than derived from the file name. A locked title survives reopening the file, which
   * otherwise refreshes it.
   */
  titleLocked: boolean;
  /** Series the book belongs to ("Tintin", "X-Men"), null when unknown or a one-shot. */
  series: string | null;
  /** Volume or issue number within `series`, as text ("3", "12.1", "HS"). Null for one-shots. */
  volume: string | null;
  /** Release date as precise as known: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
  releaseDate: string | null;
  /** Language of the book, as an ISO 639-1 code ("fr", "en"). */
  language: string | null;
  /**
   * Simple average width of the pages' images, in pixels, once the background scan has measured
   * the book (see `ImageScanProgress`); null until then. For a PDF, the size pages are rendered at.
   */
  avgPageWidth: number | null;
  /** Simple average height of the pages' images, in pixels; null until measured. */
  avgPageHeight: number | null;
  /** People credited on the book, with their role. */
  credits: Credit[];
}

/**
 * What a person did on a book. `author` is for sources that don't say (Google Books lists
 * "authors" without telling the writer from the artist).
 */
export type CreditRole = 'writer' | 'artist' | 'colorist' | 'inker' | 'letterer' | 'cover' | 'author';

/** Every `CreditRole`, in display order. */
export const CREDIT_ROLES: readonly CreditRole[] = [
  'writer',
  'artist',
  'colorist',
  'inker',
  'letterer',
  'cover',
  'author',
];

/** A person, as identified by name. `firstName` is empty for a single-word name or pen name ("Hergé"). */
export interface PersonName {
  firstName: string;
  lastName: string;
}

/** A person credited on a book: one row of the `credits` table joined with `people`. */
export interface Credit extends PersonName {
  /** Id of the row in the `people` table; the same person shares it across books. */
  personId: string;
  role: CreditRole;
}

/** A credit as written by `library.updateMetadata()`: people are matched (or created) by name. */
export interface CreditInput extends PersonName {
  role: CreditRole;
}

/**
 * Metadata fields to write on a library entry with `library.updateMetadata()`. Only the fields
 * present are changed; `credits`, when present, replaces the entry's whole credit list.
 */
export interface MetadataUpdate {
  /** Replaces the title and locks it (see `LibraryEntry.titleLocked`). */
  title?: string;
  series?: string | null;
  volume?: string | null;
  releaseDate?: string | null;
  language?: string | null;
  credits?: CreditInput[];
}

/** Outcome of `library.addFile()`. */
export type AddFileResult =
  | { status: 'cancelled' }
  /** The comic was added to the library; the reader is not opened. */
  | { status: 'added'; title: string; organization: OrganizationOutcome }
  /** The comic was already in the library, and is left untouched. */
  | { status: 'exists'; title: string }
  /** The file can't be opened (corrupted, unsupported…); `message` is in the interface language. */
  | { status: 'error'; message: string };

/** Progress of a folder scan, pushed from the main process while it runs. */
export interface ScanProgress {
  /** `scanning`: walking the tree, `total` not known yet. `importing`: opening each file found. */
  phase: 'scanning' | 'importing' | 'done';
  processed: number;
  total: number;
  /** Absolute path currently being handled, for the progress label. */
  currentFile: string;
}

/**
 * State of the background scan that measures the pages of the library's books, pushed from the
 * main process while it runs (and returned by `library.imageScanStatus()`).
 */
export interface ImageScanProgress {
  /** Whether books are being measured; false once the queue is empty. */
  running: boolean;
  /** Books measured (or given up on) since the scan started. */
  processed: number;
  /** Books to measure in this run, those added while it runs included. */
  total: number;
}

/** Outcome of `library.addFolder()`. */
export type ScanResult =
  | { status: 'cancelled' }
  /** Another run over the library files is in progress; `message` is in the interface language. */
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      directory: string;
      /** Comics added to the library. */
      added: number;
      /** Comics already in the library, left untouched. */
      skipped: number;
      /** Files that couldn't be opened (corrupt, unsupported variant…). */
      failed: number;
      /** The first `MAX_REPORTED_FAILURES` of those files, with the reason each one failed. */
      failures: ScanFailure[];
      /** Supported files found in the tree, i.e. `added + skipped + failed`. */
      total: number;
      /** What the library organization did with the comics added. */
      organization: OrganizationOutcome;
    };

/** A file a scan, a resynchronization or a cleanup couldn't handle, and why. */
export interface ScanFailure {
  /** Absolute path of the file. */
  path: string;
  /** The error message, in the interface language. */
  reason: string;
}

/** The most failures a scan, a resynchronization or a cleanup reports (the count in `failed` stays exact). */
export const MAX_REPORTED_FAILURES = 200;

/** Outcome of `library.resync()`. */
export type ResyncResult =
  | {
      status: 'ok';
      /** Comics added to the library. */
      added: number;
      /** Comics removed because their file no longer exists. */
      removed: number;
      /** Files that couldn't be opened. */
      failed: number;
      /** The first `MAX_REPORTED_FAILURES` of those files, with the reason each one failed. */
      failures: ScanFailure[];
      /** Folders that couldn't be read, left untouched. */
      unreachable: number;
      /** `.nfo` sidecars created for comics that had none. */
      nfoWritten: number;
      /** Cover thumbnails created for comics that had none. */
      coversExtracted: number;
      /** When it finished (ISO 8601); also stored as the `lastResyncAt` setting. */
      finishedAt: string;
      /** What the library organization did with the comics added. */
      organization: OrganizationOutcome;
    }
  | { status: 'error'; message: string };

/**
 * What the library organization (`AppSettings.libraryOrganization`) did with the comics an addition
 * (a file, a folder, a resynchronization) brought into the library.
 */
export interface OrganizationOutcome {
  /** Comics moved into the organized folder right away. */
  moved: number;
  /** Comics whose move failed: they stay where they were, still in the library. */
  failed: number;
  /**
   * In `ask` mode, the comics to offer to move: `token` stands for them in `library.organize()`,
   * `count` is how many, `folder` the organized folder. Null when there is nothing to offer.
   */
  pending: { token: string; count: number; folder: string } | null;
}

/** Result of `library.organize()` and `library.organizeAll()`; an error (no organized folder, folder unreachable, unknown token) has a translated `message`. */
export type OrganizeResult = { status: 'ok'; moved: number; failed: number } | { status: 'error'; message: string };

/** Result of `library.countUnorganized()`: how many library comics aren't in their place in the organized `folder` yet. */
export type UnorganizedCountResult = { status: 'ok'; count: number; folder: string } | { status: 'error'; message: string };

/** Name of the folder, at the root of the organized folder, where the CBR replaced by a CBZ are moved (see `library.convertCbr()`); a scan never walks it. */
export const DELETED_BY_TANKOBON_FOLDER = '.deletedByTankobon';

/** Result of `library.countConvertible()`: the CBR of the organized `folder` that could become CBZ, and what its `.deletedByTankobon` folder holds. */
export type ConvertCountResult =
  | { status: 'ok'; count: number; folder: string; deletedFiles: number; deletedBytes: number }
  | { status: 'error'; message: string };

/** Result of `library.convertCbr()`: books converted, and books left as they were because the conversion failed. */
export type ConvertCbrResult = { status: 'ok'; converted: number; failed: number } | { status: 'error'; message: string };

/** Result of `library.countDeflate64()`: how many CBZ of the library use the Deflate64 compression, which only `library.convertDeflate64()` can make readable. */
export type Deflate64CountResult = { status: 'ok'; count: number } | { status: 'error'; message: string };

/** Result of `library.convertDeflate64()`: CBZ rewritten with standard compression, and CBZ left as they were because the rewrite failed. */
export type ConvertDeflate64Result = { status: 'ok'; converted: number; failed: number } | { status: 'error'; message: string };

/** Result of `library.emptyDeleted()`: files removed for good from `.deletedByTankobon`, the space freed and the files that could not be removed. */
export type EmptyDeletedResult =
  | { status: 'ok'; deleted: number; bytesFreed: number; failed: number }
  | { status: 'error'; message: string };

/** Result of `library.countOrphanFolders()`: how many folders of the organized `folder` hold no book, only `.nfo` files and cover images. */
export type OrphanFoldersCountResult = { status: 'ok'; count: number; folder: string } | { status: 'error'; message: string };

/** Result of `library.cleanFolders()`: orphan folders moved to `.deletedByTankobon`, and folders that could not be moved. */
export type CleanFoldersResult = { status: 'ok'; moved: number; failed: number } | { status: 'error'; message: string };

/** A library folder that has no path on this machine yet, because the library comes from another one. */
export interface UnlinkedFolder {
  id: string;
  /** The path it had where it was added, to recognize it. */
  path: string;
}

/** Result of `library.remove()`: `error` when the entry left the library but its file could not be moved to the trash. */
export type RemoveEntryResult = { status: 'ok' } | { status: 'error'; message: string };

/** Result of `library.relinkFolder()`. */
export type RelinkFolderResult = { status: 'cancelled' } | { status: 'ok' } | { status: 'error'; message: string };

/** Result of `library.pickOrganizationFolder()`. */
export type PickOrganizationFolderResult = { status: 'cancelled' } | { status: 'ok'; folder: string };

/** Outcome of `library:remove-many`: how many entries left the library and how many files went with them. */
export interface RemoveEntriesResult {
  /** Entries removed from the library. */
  removed: number;
  /** Files moved to the trash (0 unless the files were to be deleted too). */
  filesDeleted: number;
  /** Files that could not be deleted (already gone, no permission); their entries were removed anyway. */
  filesFailed: number;
}

/** A book holding files of one {@link CleanupGroup}, for the unfolded detail of the cleanup dialog. */
export interface CleanupGroupBook {
  /** The book's file name (no folders). */
  name: string;
  /** The entries of that kind in its archive, with their path inside it. */
  files: string[];
}

/** One kind of non-image file found in the archives while cleaning the books, grouped by extension. */
export interface CleanupGroup {
  /** Lower-cased extension with its dot (`.xml`), empty for a name without extension. */
  extension: string;
  /** How many files of that kind the books hold. */
  files: number;
  /** In how many books. */
  books: number;
  /** Total size in bytes of those files, uncompressed. */
  size: number;
  /** A few of the file names, to recognize the kind. */
  examples: string[];
  /** The books holding that kind, in analysis order, cut to the first 100 (`books` is the real count). */
  details: CleanupGroupBook[];
}

/**
 * Outcome of `library.analyzeCleanup()`: what removing the non-image files from the archives would
 * delete. Nothing is touched yet; `token` is what `library.applyCleanup()` takes to do it.
 */
export type CleanupAnalysisResult =
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      /** Opaque handle of the analysis; works once, the latest ones only. */
      token: string;
      /** The kinds of files found, biggest first (empty when the books are already clean). */
      groups: CleanupGroup[];
      /** Books analyzed. */
      scanned: number;
      /** Books holding at least one non-image file. */
      booksWithJunk: number;
      /** Books left out: not a CBZ (RAR and PDF can't be rewritten) or a cloud placeholder not downloaded. */
      skipped: number;
      /** Books that could not be read. */
      failed: number;
      /** The first `MAX_REPORTED_FAILURES` of those books, with the reason. */
      failures: ScanFailure[];
    };

/** Outcome of `library.applyCleanup()`. */
export type CleanupResult =
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      /** Books rewritten without the removed files. */
      cleaned: number;
      /** Files removed from the archives. */
      filesRemoved: number;
      /** Disk space gained, in bytes. */
      bytesFreed: number;
      /** Books that could not be rewritten (left as they were). */
      failed: number;
      /** The first `MAX_REPORTED_FAILURES` of those books, with the reason. */
      failures: ScanFailure[];
    };

/** Largest image `library:set-cover` accepts, in bytes (the renderer sends the cropped picture, a few hundred kilobytes at most). */
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** Outcome of replacing a book's cover. Same rationale as `ImportResult`. */
export type SetCoverResult = { status: 'ok' } | { status: 'error'; message: string };
