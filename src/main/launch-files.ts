import path from 'node:path';

import { isSupportedComicFile } from '../shared/comic';

/**
 * The comic a launch's command line names (a double click in the file explorer, "Open with…", or
 * `skeudenn book.cbz` in a terminal), as an absolute path, or `null` when it names none.
 * Options (`--flag`) are skipped and so is anything that isn't a supported comic, which also
 * rules out the executable and the application folder that come first in a development launch.
 * `cwd` resolves a relative path: for a second instance, that of the process that was started.
 */
export function comicPathFromArgv(argv: readonly string[], cwd: string): string | null {
  for (const arg of argv) {
    if (arg.startsWith('-') || !isSupportedComicFile(arg)) continue;
    return path.resolve(cwd, arg);
  }
  return null;
}
