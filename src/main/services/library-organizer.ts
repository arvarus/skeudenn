/**
 * Library organization: moves the comics of the library into a folder whose layout the app manages,
 * either one subfolder per comic or the tree of levels the user chose (`AppSettings.libraryStructure`).
 * @module
 */
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { moveArticleToEnd } from '../../shared/articles';
import { isSupportedComicFile } from '../../shared/comic';
import { fillFileNameTemplate } from '../../shared/file-name-template';
import { t } from '../../shared/i18n';
import type { LibraryEntry } from '../../shared/library';
import type { LibraryLevel, LibraryOrganization } from '../../shared/settings';
import type { LibraryRepository } from '../db/library-repository';
import { coverSidecarPath } from './cover-sidecar';
import { nfoPathFor } from './nfo';
import { isInside } from '../path-containment';
import { isDirectory, pathExists } from './organized-folder';

/**
 * Longest file or folder name, in UTF-8 bytes: 255 on Linux (ext4…) and macOS (APFS). Windows (NTFS)
 * counts 255 UTF-16 units, never more than the UTF-8 bytes, so the limit holds there too.
 */
export const MAX_NAME_BYTES = 255;

/** Drops whole characters from the end of `text` until it fits in `maxBytes` UTF-8 bytes (a surrogate pair is never split). */
function truncateToBytes(text: string, maxBytes: number): string {
  let bytes = 0;
  let result = '';
  for (const char of text) {
    bytes += Buffer.byteLength(char);
    if (bytes > maxBytes) break;
    result += char;
  }
  return result;
}

/** The file name of `filePath` without its extension, less the ` (<id>)` a name collision may have added. */
function originalStem(filePath: string, id: string): string {
  const stem = path.basename(filePath, path.extname(filePath));
  const suffix = ` (${id})`;
  return stem.endsWith(suffix) && stem.length > suffix.length ? stem.slice(0, -suffix.length) : stem;
}

/**
 * Name of the subfolder that holds a comic in the organized folder (default layout): the original file
 * name without its extension, then the library id in parentheses (`Astérix T01 (3f2a…)`), so two files of
 * the same name never collide. The name part is cut when the whole would exceed {@link MAX_NAME_BYTES}, and
 * a cut name loses its trailing spaces and dots (Windows refuses a name ending with them).
 */
function folderNameOf(name: string, id: string): string {
  const suffix = ` (${id})`;
  const room = MAX_NAME_BYTES - Buffer.byteLength(suffix);
  const kept = Buffer.byteLength(name) > room ? truncateToBytes(name, room).replace(/[\s.]+$/, '') : name;
  return kept === '' ? `(${id})` : `${kept}${suffix}`;
}

/** Names Windows reserves for devices, with or without an extension. */
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * `text` made into a folder name every OS accepts: the characters Windows refuses (`<>:"/\|?*` and
 * control characters) become `_`, leading and trailing spaces and trailing dots go, a reserved device
 * name (`CON`, `LPT1`…) gets a `_`, and the result is cut to {@link MAX_NAME_BYTES}. Nothing left gives
 * the translated "Unknown".
 */
export function safeFolderName(text: string): string {
  // eslint-disable-next-line no-control-regex
  let name = text.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  name = truncateToBytes(name, MAX_NAME_BYTES).replace(/[\s.]+$/, '');
  if (name === '') return t('library:organizationUnknown');
  return RESERVED_NAME.test(name) ? `${name}_` : name;
}

/**
 * The folder name of a `letter` level: the first character of the next level's name, accents
 * dropped and upper-cased for a letter (`É` → `E`), as is for a digit, `#` for anything else.
 */
export function letterFolderName(next: string): string {
  const first = [...next.normalize('NFD')][0] ?? '';
  if (/\p{L}/u.test(first)) return first.toUpperCase();
  if (/\p{Nd}/u.test(first)) return first;
  return '#';
}

/** What the organization reads of a library entry to place its file. */
export type OrganizedEntry = Pick<
  LibraryEntry,
  'id' | 'path' | 'title' | 'series' | 'volume' | 'releaseDate' | 'language' | 'credits'
>;

/**
 * Whether the entry has a fiche (the same rule as `hasFiche()`, which lives in the renderer): a
 * series, volume, release date, language or credit, as brought by a lookup, an `.nfo` or a manual edit.
 */
function hasFiche(entry: OrganizedEntry): boolean {
  return Boolean(entry.series || entry.volume || entry.releaseDate || entry.language) || entry.credits.length > 0;
}

/**
 * The author a comic is filed under: its first writer, else the first person credited, as
 * "Last name First name"; null when nobody is credited.
 */
function authorName(entry: OrganizedEntry): string | null {
  const credit = entry.credits.find((c) => c.role === 'writer') ?? entry.credits[0];
  if (!credit) return null;
  return `${credit.lastName} ${credit.firstName}`.trim() || null;
}

/** The raw name of a level other than `letter` for `entry`, or null when the entry doesn't say. A leading article of `articles` goes to the end of a series or album name. */
function levelValue(
  level: Exclude<LibraryLevel, 'letter'>,
  entry: OrganizedEntry,
  articles: readonly string[] = [],
): string | null {
  switch (level) {
    case 'year':
      return /^\d{4}/.exec(entry.releaseDate ?? '')?.[0] ?? null;
    case 'author':
      return authorName(entry);
    case 'series':
      // A one-shot is its own series.
      return moveArticleToEnd(entry.series?.trim() || entry.title, articles);
    case 'album':
      return moveArticleToEnd(entry.title, articles);
  }
}

/**
 * The folders `structure` puts `entry` in, from the organized folder down: one per level, a missing
 * value (no year, nobody credited) giving the translated "Unknown" folder and a `letter` level the
 * first character of the next level's folder. With `articles`, a leading article is moved to the end of the
 * series and album names (so `Le vent du nord` is filed under `V`).
 */
export function structureFolders(
  structure: readonly LibraryLevel[],
  entry: OrganizedEntry,
  articles: readonly string[] = [],
): string[] {
  const folders: string[] = [];
  for (let index = structure.length - 1; index >= 0; index -= 1) {
    const level = structure[index];
    folders.unshift(
      level === 'letter'
        ? letterFolderName(folders[0] ?? '')
        : safeFolderName(levelValue(level, entry, articles) ?? ''),
    );
  }
  return folders;
}

/**
 * The name, without extension, that the template `fileName` (`AppSettings.libraryFileName`) gives
 * `entry`'s file: each field filled from the entry (a missing series, year or author giving the
 * translated "Unknown", a missing volume being left out with the text glued before it; the author as in the `author` level), then made safe like a folder name and cut
 * so that `extension` still fits in {@link MAX_NAME_BYTES}. With `articles`, a leading article of the series and
 * of the title goes to the end (`Vent du nord (Le)`), and `volumePrefix` (`AppSettings.libraryVolumePrefix`) is put
 * in front of the volume, only when it is a whole number with `prefixNumericOnly`.
 */
export function templatedStem(
  fileName: string,
  entry: OrganizedEntry,
  extension: string,
  articles: readonly string[] = [],
  volumePrefix = '',
  prefixNumericOnly = false,
): string {
  const unknown = t('library:organizationUnknown');
  const name = fillFileNameTemplate(
    fileName,
    {
      series: moveArticleToEnd(entry.series?.trim() ?? '', articles) || unknown,
      volume: entry.volume?.trim() ?? '',
      title: moveArticleToEnd(entry.title, articles),
      year: levelValue('year', entry) ?? unknown,
      author: authorName(entry) ?? unknown,
    },
    volumePrefix,
    prefixNumericOnly,
  );
  const room = MAX_NAME_BYTES - Buffer.byteLength(extension);
  return safeFolderName(truncateToBytes(safeFolderName(name), room));
}

/**
 * Where the organization files comics: the organized folder, its tree (`AppSettings.libraryStructure`)
 * and the file name template (`AppSettings.libraryFileName`, empty to keep the original names).
 */
export interface OrganizationTarget {
  root: string;
  structure: readonly LibraryLevel[];
  fileName: string;
  /** Articles moved to the end of the series and album names (`AppSettings.libraryArticles`); empty or missing when the option is off. */
  articles?: readonly string[];
  /** Text put in front of the volume (`AppSettings.libraryVolumePrefix`); empty or missing for none. */
  volumePrefix?: string;
  /** Whether the prefix only goes in front of a whole-number volume (`AppSettings.libraryVolumePrefixNumericOnly`). */
  prefixNumericOnly?: boolean;
}

/**
 * Where the organization puts a comic, best first. Its name is the original file name, or the one
 * {@link templatedStem} gives when the target has a file name template and the entry has a fiche, the
 * extension being kept.
 * Without a structure, a single place: `<root>/<name> (<library id>)/<name>.<extension>` (see
 * `folderNameOf()`). With one, the file goes in the last level's folder under that name,
 * or, when another file has that name there, `<name> (<library id>).<extension>`. A comic at any of
 * these places is in place.
 */
export function organizedPaths(target: OrganizationTarget, entry: OrganizedEntry): string[] {
  const extension = path.extname(entry.path);
  // Without a fiche the template would fill its fields with "Unknown": the original name is kept.
  const stem =
    target.fileName === '' || !hasFiche(entry)
      ? originalStem(entry.path, entry.id)
      : templatedStem(target.fileName, entry, extension, target.articles, target.volumePrefix, target.prefixNumericOnly);
  if (target.structure.length === 0) {
    return [path.join(target.root, folderNameOf(stem, entry.id), `${stem}${extension}`)];
  }
  const folder = path.join(target.root, ...structureFolders(target.structure, entry, target.articles));
  const suffix = ` (${entry.id})`;
  const room = MAX_NAME_BYTES - Buffer.byteLength(suffix + extension);
  const short = Buffer.byteLength(stem) > room ? truncateToBytes(stem, room).replace(/[\s.]+$/, '') : stem;
  return [path.join(folder, `${stem}${extension}`), path.join(folder, `${short}${suffix}${extension}`)];
}

/** Whether `entry`'s file is at one of its {@link organizedPaths}. */
function isInPlace(target: OrganizationTarget, entry: OrganizedEntry): boolean {
  return organizedPaths(target, entry).includes(entry.path);
}

/** `text` as a case-insensitive file system compares it, near enough: Unicode-composed, then lower-cased. */
function foldCase(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/** The error a move refuses an existing destination with. */
function alreadyExists(to: string): Error {
  return Object.assign(new Error(`${to} already exists`), { code: 'EEXIST' });
}

/**
 * Whether `from` and `to`, two paths that differ only by letter case, name the same file or folder:
 * true on a case-insensitive file system (NTFS, APFS by default), where both resolve to one entry
 * (same device and inode, read as bigints for Windows' 64-bit file ids). Two hard links are never
 * taken for one: their names differ by more than case.
 */
async function isSameEntry(from: string, to: string): Promise<boolean> {
  if (foldCase(path.resolve(from)) !== foldCase(path.resolve(to))) return false;
  try {
    const [a, b] = await Promise.all([stat(from, { bigint: true }), stat(to, { bigint: true })]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}

/**
 * Renames `from` to `to`, two names of one entry that differ only by letter case, in two steps
 * through a temporary name in the same folder, since a case-insensitive file system may take a
 * direct rename for a no-op. If the second step fails, the entry goes back to `from`.
 */
async function renameCase(from: string, to: string): Promise<void> {
  const temporary = path.join(path.dirname(from), `.skeudenn-case-${randomBytes(6).toString('hex')}`);
  await rename(from, temporary);
  try {
    // Still there: `to` was another entry after all (a case-sensitive folder), never overwritten.
    if (await pathExists(to)) throw alreadyExists(to);
    await rename(temporary, to);
  } catch (error) {
    await rename(temporary, from).catch(() => undefined);
    throw error;
  }
}

/**
 * Moves a file, creating the destination's folder. Refuses to overwrite an existing destination,
 * unless it is the file itself under another letter case (a case-insensitive file system): the file
 * is then renamed to the new case, in two steps (see `renameCase()`). A
 * move to another drive (`EXDEV`, which `rename` can't do) copies then deletes the original; if
 * the original can't be deleted (a file in use on Windows), the copy is deleted and the move fails,
 * so the file is never left in two places.
 */
export async function moveFile(from: string, to: string): Promise<void> {
  if (await pathExists(to)) {
    if (await isSameEntry(from, to)) return renameCase(from, to);
    throw alreadyExists(to);
  }
  const folder = path.dirname(to);
  // The first folder that has to be created, if any: the top of what a failure removes. Not the path
  // `mkdir` returns, which is a namespaced `\\?\C:\…` path on Windows that no other path is inside of.
  const created = await firstMissingFolder(folder);
  await mkdir(folder, { recursive: true });
  try {
    try {
      await rename(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await copyFile(from, to, constants.COPYFILE_EXCL);
      try {
        await unlink(from);
      } catch (unlinkError) {
        await unlink(to).catch(() => undefined);
        throw unlinkError;
      }
    }
  } catch (error) {
    // The folders made for the move go too, when they are still empty.
    if (created !== undefined) await removeEmptyFolders(path.dirname(created), folder);
    throw error;
  }
}

/** The outermost of `folder` and its parents that doesn't exist, or `undefined` when `folder` exists. */
async function firstMissingFolder(folder: string): Promise<string | undefined> {
  let missing: string | undefined;
  let current = folder;
  while (!(await pathExists(current))) {
    missing = current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return missing;
}

/** A comic the organization moved. */
export interface MovedEntry {
  id: string;
  from: string;
  to: string;
}

/** What {@link organizeEntries} did. */
export interface OrganizeSummary {
  /** The comics moved, with their old and new path. */
  moved: MovedEntry[];
  /** Comics whose move failed (file in use, missing, destination taken…); they stay where they were. */
  failed: number;
  /** True when `signal` stopped the run before every comic was handled; those left stay where they were. */
  cancelled: boolean;
  /**
   * Other comics whose path changed because a folder holding them was renamed to a new letter case
   * (see {@link organizeEntries}); their files didn't move otherwise.
   */
  relocated: MovedEntry[];
}

/**
 * Deletes `folder` and then its parents while they are empty, stopping at `root` (kept) and never
 * leaving it.
 */
async function removeEmptyFolders(root: string, folder: string): Promise<void> {
  let current = folder;
  while (isInside(root, current)) {
    try {
      await rmdir(current);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

/**
 * Points the entries under `from`, a folder just renamed to `to`, at their file's new path, and returns
 * those moved but `exceptId`'s, which the caller moves next. The stored paths are compared ignoring
 * case, like the file system that told the two names apart only by it.
 */
function repointEntries(repo: LibraryRepository, from: string, to: string, exceptId: string): MovedEntry[] {
  const prefix = foldCase(from);
  const moved: MovedEntry[] = [];
  for (const entry of repo.list()) {
    const rest = entry.path.slice(from.length);
    if (!rest.startsWith(path.sep) || foldCase(entry.path.slice(0, from.length)) !== prefix) continue;
    const next = to + rest;
    if (next === entry.path || !repo.updatePath(entry.id, next)) continue;
    if (entry.id !== exceptId) moved.push({ id: entry.id, from: entry.path, to: next });
  }
  return moved;
}

/**
 * Gives the existing folders of `folder`, below `root`, the letter case `folder` spells them with: on a
 * case-insensitive file system, `<root>/tintin` is where `<root>/Tintin` goes, and would otherwise keep
 * its old name. Each such folder is renamed (see `renameCase()`) and the library entries under it are
 * repointed; those other than `movingId`'s are returned. A folder that can't be renamed keeps its case,
 * which only costs the looks: the paths still resolve.
 */
async function matchFolderCase(
  repo: LibraryRepository,
  root: string,
  folder: string,
  movingId: string,
): Promise<MovedEntry[]> {
  const relocated: MovedEntry[] = [];
  if (!isInside(root, folder)) return relocated;
  let parent = root;
  for (const name of path.relative(root, folder).split(path.sep)) {
    const wanted = path.join(parent, name);
    // The folders below don't exist either: the move creates them with the right case.
    if (!(await isDirectory(wanted))) break;
    const names = await readdir(parent).catch(() => [name]);
    const actual = names.includes(name) ? undefined : names.find((other) => foldCase(other) === foldCase(name));
    if (actual !== undefined) {
      const from = path.join(parent, actual);
      if (await isSameEntry(from, wanted)) {
        try {
          await renameCase(from, wanted);
          relocated.push(...repointEntries(repo, from, wanted, movingId));
        } catch {
          // Left with its old case.
        }
      }
    }
    parent = wanted;
  }
  return relocated;
}

/** Moves `from` to the first of `candidates` free in the library and on disk; the path used, or null. */
async function moveToFirstFree(repo: LibraryRepository, from: string, candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (repo.hasPath(candidate)) continue;
    try {
      await moveFile(from, candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return null;
    }
  }
  return null;
}

/**
 * Moves each entry's file to its {@link organizedPaths} under the target and points the entry at it,
 * one after the other. An entry already in place, or no longer in the library, is skipped. A failure
 * only costs that comic. A destination that differs from the comic's place only by letter case (a
 * case-insensitive file system) is reached by renaming: its folders first, the entries of the other
 * comics they hold being repointed (`relocated`), then the file. When a comic leaves a subfolder of the organized folder (one dropped there by
 * hand, or the place of an older structure), that subfolder and its parents are deleted if they are
 * now empty; nothing outside the organized folder is ever deleted. An aborted `signal` stops the run
 * before its next comic (the one being moved is finished), with `cancelled` set.
 */
export async function organizeEntries(
  repo: LibraryRepository,
  target: OrganizationTarget,
  ids: string[],
  onProgress: (processed: number, total: number, currentFile: string) => void = () => undefined,
  signal?: AbortSignal,
): Promise<OrganizeSummary> {
  const summary: OrganizeSummary = { moved: [], failed: 0, cancelled: false, relocated: [] };
  for (const [index, id] of ids.entries()) {
    if (signal?.aborted) {
      summary.cancelled = true;
      break;
    }
    const entry = repo.get(id);
    if (entry) onProgress(index, ids.length, entry.path);
    if (!entry || isInPlace(target, entry)) continue;
    // Only comics are moved: an entry from an edited export could name any file.
    if (!isSupportedComicFile(entry.path)) {
      summary.failed += 1;
      continue;
    }
    const candidates = organizedPaths(target, entry);
    summary.relocated.push(...(await matchFolderCase(repo, target.root, path.dirname(candidates[0]), id)));
    // Renaming the folders was enough when the file's own name already had the right case.
    const repointed = repo.get(id)?.path;
    if (repointed !== undefined && repointed !== entry.path && candidates.includes(repointed)) {
      summary.moved.push({ id, from: entry.path, to: repointed });
      continue;
    }
    const to = await moveToFirstFree(repo, entry.path, candidates);
    if (to === null) {
      summary.failed += 1;
      continue;
    }
    if (!repo.updatePath(id, to)) {
      // The database refused the new path: the file goes back where the entry says it is.
      await moveFile(to, entry.path).catch(() => undefined);
      summary.failed += 1;
      continue;
    }
    summary.moved.push({ id, from: entry.path, to });
    // The cover kept beside the comic follows it (best effort: it is regenerated when missing).
    await moveFile(coverSidecarPath(entry.path), coverSidecarPath(to)).catch(() => undefined);
    // So does its `.nfo` (same best effort: one already at the destination is left alone).
    await moveFile(nfoPathFor(entry.path), nfoPathFor(to)).catch(() => undefined);
    await removeEmptyFolders(target.root, path.dirname(entry.path));
  }
  return summary;
}

/** Ids of the library entries whose file isn't at one of its {@link organizedPaths} yet, in library order. */
export function unorganizedIds(repo: LibraryRepository, target: OrganizationTarget): string[] {
  return repo
    .list()
    .filter((entry) => isSupportedComicFile(entry.path) && !isInPlace(target, entry))
    .map((entry) => entry.id);
}

/** The comics to move now and those to offer to move, as decided by {@link planOrganization}. */
export interface OrganizationPlan {
  now: string[];
  offer: string[];
}

/**
 * Decides what happens to the comics an addition brought in: nothing when the organization is `off`
 * or has no folder; with `always`, they all move now; with `ask`, those found inside the organized
 * folder (added there by hand) move now and the others are offered.
 */
export function planOrganization(
  mode: LibraryOrganization,
  root: string,
  added: { id: string; path: string }[],
): OrganizationPlan {
  if (mode === 'off' || root === '') return { now: [], offer: [] };
  if (mode === 'always') return { now: added.map((entry) => entry.id), offer: [] };
  const now: string[] = [];
  const offer: string[] = [];
  for (const entry of added) (isInside(root, entry.path) ? now : offer).push(entry.id);
  return { now, offer };
}
