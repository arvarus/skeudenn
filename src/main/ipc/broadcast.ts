import { BrowserWindow } from 'electron';

/**
 * Sends a main → renderer push to every open window. A window being closed (the window or its
 * `webContents` already destroyed) is skipped. Replies to a single window go through its own
 * `event.sender` instead.
 */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, ...args);
    }
  }
}
