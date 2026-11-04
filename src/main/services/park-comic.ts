/**
 * Parking a comic removed from the library without deleting it. A file left in place would be added
 * back by the next resynchronization, so it goes to a `.deletedByTankobon` folder (which the walk skips)
 * with its cover and `.nfo`: at the root of the organized folder when the comic is inside it (where the
 * user empties it), else beside the comic. Free of Electron, so it runs under Vitest.
 * @module
 */
import path from 'node:path';

import { DELETED_BY_TANKOBON_FOLDER } from '../../shared/library';
import { isInside } from '../path-containment';
import { coverSidecarPath } from './cover-sidecar';
import { moveFile } from './library-organizer';
import { nfoPathFor } from './nfo';
import { firstFreeName, markParked, pathExists } from './organized-folder';

/** The `.deletedByTankobon` folder a comic goes to: the organized folder's when it lives there, else its own folder's. */
export function parkingFolder(comicPath: string, organizedRoot: string): string {
  const base = organizedRoot !== '' && isInside(organizedRoot, comicPath) ? organizedRoot : path.dirname(comicPath);
  return path.join(base, DELETED_BY_TANKOBON_FOLDER);
}

/**
 * Moves `comicPath` and its sidecars to the parking folder (`name (2)`… on a collision) and stamps the
 * comic with the current time for the automatic emptying. A comic already gone is fine; any other
 * failure is thrown, the file staying where it was. A sidecar that can't be moved is left.
 */
export async function parkComic(comicPath: string, organizedRoot: string): Promise<void> {
  if (!(await pathExists(comicPath))) return;
  const folder = parkingFolder(comicPath, organizedRoot);
  const extension = path.extname(comicPath);
  const parked = await firstFreeName(folder, path.basename(comicPath, extension), extension);
  await moveFile(comicPath, parked);
  await markParked(parked);
  for (const sidecar of [coverSidecarPath, nfoPathFor]) {
    const to = sidecar(parked);
    if (!(await pathExists(to))) await moveFile(sidecar(comicPath), to).catch(() => undefined);
  }
}
