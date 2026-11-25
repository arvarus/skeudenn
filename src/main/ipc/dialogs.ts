import { stat } from 'node:fs/promises';

import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';

/**
 * Shows an open dialog, modal to the window that sent `event` when there is one (the window may
 * be gone by the time the handler runs).
 */
export function openDialogFor(
  event: IpcMainInvokeEvent,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
}

/** Like {@link openDialogFor}, for a save dialog. */
export function saveDialogFor(
  event: IpcMainInvokeEvent,
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options);
}

/** Whether `path` is a UNC network path (two leading slashes or backslashes). */
function isNetworkPath(path: string): boolean {
  return /^[\\/]{2}/.test(path);
}

/**
 * `directory` when it still exists, else undefined (i.e. the OS default location): an external
 * drive unplugged or a folder moved would otherwise leave a stale `defaultPath`, whose behaviour
 * in Electron is platform-dependent. A network path (`\\host\share`, `//host/share`) is never
 * checked and gives undefined: on Windows, reaching it sends the user's credentials to that host,
 * and a stored value may come from an older import.
 */
export async function existingDirectory(directory: string | null | undefined): Promise<string | undefined> {
  if (!directory || isNetworkPath(directory)) {
    return undefined;
  }
  try {
    return (await stat(directory)).isDirectory() ? directory : undefined;
  } catch {
    return undefined;
  }
}
