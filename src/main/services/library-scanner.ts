/**
 * Walks a directory tree for comics and registers everything it finds in the library.
 * @module
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { isSupportedComicFile } from '../../shared/comic';
import { DELETED_BY_TANKOBON_FOLDER, MAX_REPORTED_FAILURES, type ScanFailure, type ScanProgress } from '../../shared/library';
import type { ArchiveSummary } from '../decoder/protocol';
import type { LibraryRepository } from '../db/library-repository';
import { readNfoFor } from './nfo';

/** Counts reported at the end of `scanIntoLibrary`. */
export interface ScanSummary {
  added: number;
  skipped: number;
  failed: number;
  /** The first `MAX_REPORTED_FAILURES` files that failed, with the reason. */
  failures: ScanFailure[];
  total: number;
  /** The entries this scan created, for the library organization. */
  addedEntries: { id: string; path: string }[];
}

/**
 * Every supported comic under `directory`, recursively, sorted so a scan walks a series in a
 * predictable order. Directories that can't be read (permissions, a disconnected network share)
 * are skipped rather than failing the whole scan. Symlinks are never followed: `isDirectory()` is
 * false for them, which also rules out cycles.
 */
export async function collectComicFiles(directory: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // Where the CBR replaced by a CBZ wait to be emptied: not part of the library any more.
        if (entry.name !== DELETED_BY_TANKOBON_FOLDER) await walk(fullPath);
      } else if (entry.isFile() && isSupportedComicFile(entry.name)) {
        found.push(fullPath);
      }
    }
  }

  await walk(directory);
  return found;
}

/**
 * Adds every comic under `directory` to the library. Each file has to be opened to learn its page
 * count — that's the slow part, and why `onProgress` reports file by file. Files already in the
 * library are skipped without being opened, and one unreadable file only costs itself (`failed`),
 * never the rest of the scan. Opening is `inspect`'s job (the decoder process, which also caches the
 * cover): the scanner itself never parses an archive, it only owns the walk and the database.
 * An aborted `signal` stops it between two files.
 */
export async function scanIntoLibrary(
  repo: LibraryRepository,
  directory: string,
  onProgress: (progress: ScanProgress) => void,
  inspect: (filePath: string) => Promise<ArchiveSummary>,
  // Checked between files: an aborted scan stops after the file in hand and returns what it did.
  signal?: AbortSignal,
): Promise<ScanSummary> {
  onProgress({ phase: 'scanning', processed: 0, total: 0, currentFile: directory });
  const files = await collectComicFiles(directory);

  const summary: ScanSummary = { added: 0, skipped: 0, failed: 0, failures: [], total: files.length, addedEntries: [] };

  for (const [index, filePath] of files.entries()) {
    if (signal?.aborted) break;
    onProgress({ phase: 'importing', processed: index, total: files.length, currentFile: filePath });

    if (repo.hasPath(filePath)) {
      summary.skipped += 1;
      continue;
    }

    try {
      const { pageCount, fileCount } = await inspect(filePath);
      const { size } = await stat(filePath);
      const title = path.basename(filePath, path.extname(filePath));
      // Another run may have registered the file while it was being opened.
      if (repo.register(filePath, title, pageCount, fileCount, size) === 'existing') {
        summary.skipped += 1;
        continue;
      }
      summary.added += 1;
      const id = repo.idOfPath(filePath);
      if (id) {
        summary.addedEntries.push({ id, path: filePath });
        // A `.nfo` next to the comic documents the new row (never an existing one).
        const nfo = await readNfoFor(filePath);
        if (nfo) repo.updateMetadata(id, nfo);
      }
    } catch (error) {
      summary.failed += 1;
      if (summary.failures.length < MAX_REPORTED_FAILURES) {
        summary.failures.push({ path: filePath, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  onProgress({ phase: 'done', processed: files.length, total: files.length, currentFile: '' });
  return summary;
}
