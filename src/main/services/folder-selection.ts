/**
 * What "Ajouter des dossiers…" does with the folders the user picked before scanning them: leaving out what a
 * parent's walk already covers, and choosing where the next dialog opens. Pure functions of paths.
 * @module
 */
import path from 'node:path';

import { isInside } from '../path-containment';

/**
 * The folders to scan out of a pick: resolved, without repeats and without a folder nested in another one
 * of the pick (its comics are found by the parent's walk, and would be reported twice). The order picked is
 * kept. Containment is judged by `isInside()`, so the case rules are those of the platform's paths.
 */
export function normalizeFolders(picked: readonly string[]): string[] {
  const resolved = picked.map((folder) => path.resolve(folder));
  const unique: string[] = [];
  for (const folder of resolved) {
    if (!unique.some((other) => path.relative(other, folder) === '')) unique.push(folder);
  }
  return unique.filter((folder) => !unique.some((other) => isInside(other, folder)));
}

/**
 * The folder the next dialog should open in: the folder itself when there is one, else the deepest folder
 * holding all of them, else (they share none, such as two drives) the last one.
 */
export function startingFolder(folders: readonly string[]): string {
  if (folders.length === 0) return '';
  if (folders.length === 1) return folders[0];
  let candidate = path.dirname(folders[0]);
  for (;;) {
    if (folders.every((folder) => isInside(candidate, folder))) return candidate;
    const parent = path.dirname(candidate);
    if (parent === candidate) return folders[folders.length - 1];
    candidate = parent;
  }
}
