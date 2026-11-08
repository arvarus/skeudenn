/**
 * Resynchronizes the library with the folders it was built from: new comics are added, comics whose
 * file is gone are removed.
 * @module
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  MAX_REPORTED_FAILURES,
  type ResyncStep,
  type ResyncStepName,
  type ScanFailure,
  type ScanProgress,
} from '../../shared/library';
import type { ArchiveSummary } from '../decoder/protocol';
import type { LibraryRepository } from '../db/library-repository';
import { ROOT_PREFIX } from '../db/path-roots';
import { isInside } from '../path-containment';
import { collectComicFiles, scanIntoLibrary } from './library-scanner';
import { writeNfoIfMissing } from './nfo';

/** What `resyncLibrary` did. */
export interface ResyncSummary {
  /** Comics added to the library. */
  added: number;
  /** Library entries removed because their file no longer exists. */
  removed: number;
  /** Files that couldn't be opened. */
  failed: number;
  /** The first `MAX_REPORTED_FAILURES` of those files, with the reason. */
  failures: ScanFailure[];
  /** `.nfo` sidecars created for comics that had none. */
  nfoWritten: number;
  /** Cover thumbnails created for comics that had none. */
  coversExtracted: number;
  /** Folders that couldn't be read (missing, unplugged drive): left alone, nothing removed from them. */
  unreachable: number;
  /** The entries added, for the library organization. */
  addedEntries: { id: string; path: string }[];
  /** Ids of the removed entries and the path of their file, for the caller's follow-up (thumbnails, notifications). */
  removedEntries: { id: string; path: string }[];
  /** Stopped through the signal before the end. */
  cancelled: boolean;
}

async function isReadableDirectory(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

/** True only when the file is certainly gone (ENOENT): any other error (permissions, I/O) keeps the entry. */
async function isMissing(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }
}

/**
 * Walks every folder again: new comics are added (as a folder scan does), then the entries under
 * that folder whose file no longer exists are removed, with their credits and reading-list places.
 * Safety rules, because a removal loses the user's progress, rating and tags: a folder that can't
 * be read as a directory is skipped entirely (an unplugged drive must not empty the library), and an
 * entry goes only when `stat` says the file is gone (`ENOENT`), not merely absent from the walk,
 * which skips the subfolders it can't read. Entries outside every folder (a file added on its own)
 * are checked one by one afterwards: they go when their file is gone and the directory that held it
 * is still readable, so a vanished drive or folder keeps them. Comics inside the folders whose cover
 * is missing get it extracted (`extractCover`, asked of each of them: it makes the cover only when there
 * is none, skipping a cloud placeholder, since reading it would download it, and says whether it made one). Comics inside the folders that have no
 * `.nfo` sidecar get one written from their library information (unless `writeNfos` is off); no other file on disk is touched.
 *
 * Every progress carries its {@link ResyncStep} (one `scan` per folder, then `nfo`, `covers` and
 * `missing`), so the bar that fills once per step can say which one it is. An aborted `signal` stops
 * the run between two files: what was done stays, and the summary says `cancelled`.
 */
export async function resyncLibrary(
  repo: LibraryRepository,
  folders: string[],
  onProgress: (progress: ScanProgress) => void,
  inspect: (filePath: string) => Promise<ArchiveSummary>,
  extractCover: (filePath: string) => Promise<boolean> = async () => false,
  writeNfos = true,
  signal?: AbortSignal,
): Promise<ResyncSummary> {
  const summary: ResyncSummary = {
    added: 0,
    removed: 0,
    failed: 0,
    failures: [],
    nfoWritten: 0,
    coversExtracted: 0,
    unreachable: 0,
    removedEntries: [],
    addedEntries: [],
    cancelled: false,
  };
  const stopped = () => signal?.aborted === true;

  const stepCount = folders.length + (writeNfos ? 1 : 0) + 2;
  let step: ResyncStep = { index: 0, count: stepCount, name: 'scan', folder: '' };
  // Each folder's scan reports its own `done`; the caller only wants the one after the last.
  const report = (progress: ScanProgress) => {
    if (progress.phase !== 'done') onProgress({ ...progress, step });
  };
  /** Moves to the next step and says so at once, even when the step has nothing to do. */
  const startStep = (name: ResyncStepName, total: number, folder = '') => {
    step = { index: step.index + 1, count: stepCount, name, folder };
    report({ phase: name === 'scan' ? 'scanning' : 'importing', processed: 0, total, currentFile: folder });
  };

  for (const folder of folders) {
    if (stopped()) break;
    startStep('scan', 0, folder);
    if (!(await isReadableDirectory(folder))) {
      summary.unreachable += 1;
      continue;
    }

    const scanned = await scanIntoLibrary(repo, folder, report, inspect, signal);
    summary.added += scanned.added;
    summary.failed += scanned.failed;
    summary.failures.push(...scanned.failures.slice(0, MAX_REPORTED_FAILURES - summary.failures.length));
    summary.addedEntries.push(...scanned.addedEntries);
    if (stopped()) break;

    const found = new Set(await collectComicFiles(folder));
    for (const entry of repo.list()) {
      if (stopped()) break;
      if (found.has(entry.path) || !isInside(folder, entry.path)) continue;
      if (await isMissing(entry.path)) {
        repo.remove(entry.id);
        summary.removed += 1;
        summary.removedEntries.push({ id: entry.id, path: entry.path });
      }
    }
  }

  // Comics inside the walked folders get the `.nfo` they lack (an existing one is never touched).
  const inFolders = stopped() ? [] : repo.list().filter((entry) => folders.some((folder) => isInside(folder, entry.path)));
  if (writeNfos && !stopped()) {
    startStep('nfo', inFolders.length);
    for (const [index, entry] of inFolders.entries()) {
      if (stopped()) break;
      report({ phase: 'importing', processed: index, total: inFolders.length, currentFile: entry.path });
      if (await writeNfoIfMissing(entry)) summary.nfoWritten += 1;
    }
  }

  // Same entries, after the removals above: the missing covers are extracted, one book at a time.
  if (!stopped()) {
    const remaining = inFolders.filter((entry) => repo.hasPath(entry.path));
    startStep('covers', remaining.length);
    for (const [index, entry] of remaining.entries()) {
      if (stopped()) break;
      report({ phase: 'importing', processed: index, total: remaining.length, currentFile: entry.path });
      if (await extractCover(entry.path).catch(() => false)) summary.coversExtracted += 1;
    }
  }

  if (!stopped()) {
    // Still in its stored form: its library folder has no path on this machine (not relinked yet), so its
    // file can't be looked for here, and its absence says nothing.
    const outside = repo
      .list()
      .filter((entry) => !folders.some((folder) => isInside(folder, entry.path)) && !entry.path.startsWith(ROOT_PREFIX));
    startStep('missing', outside.length);
    for (const [index, entry] of outside.entries()) {
      if (stopped()) break;
      report({ phase: 'importing', processed: index, total: outside.length, currentFile: entry.path });
      if ((await isMissing(entry.path)) && (await isReadableDirectory(path.dirname(entry.path)))) {
        repo.remove(entry.id);
        summary.removed += 1;
        summary.removedEntries.push({ id: entry.id, path: entry.path });
      }
    }
  }

  summary.cancelled = stopped();
  onProgress({ phase: 'done', processed: 0, total: 0, currentFile: '' });
  return summary;
}
