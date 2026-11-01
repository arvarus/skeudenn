import { app, BrowserWindow, net, shell } from 'electron';

import { APP_LINKS, isAppLink, type AppInfo, type UpdateCheckResult } from '../../shared/app';
import { checkForUpdate } from '../services/update-checker';
import { handle } from './handle';
import type { LaunchFiles } from './launch-files';
import { IpcArgumentError, args } from './validate';

// Channel names are shared with preload.ts: keep them in sync.
export const APP_CHANNELS = {
  getInfo: 'app:get-info',
  getSystemLanguages: 'app:get-system-languages',
  openLink: 'app:open-link',
  checkUpdate: 'app:check-update',
  takeLaunchFile: 'app:take-launch-file',
  /** Main → renderer: a comic the OS asked to open is waiting (see `takeLaunchFile`). */
  launchFile: 'app:launch-file',
} as const;

/**
 * Information shown in the "À propos" settings section. The versions are read here rather than in
 * the preload: `app.getVersion()` only exists in the main process.
 */
export function registerAppIpc(launchFiles: LaunchFiles): void {
  handle(APP_CHANNELS.takeLaunchFile, args(), (): string | null => launchFiles.take());

  handle(APP_CHANNELS.getInfo, args(), (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
  }));

  // The OS's preferred languages, for the renderer to resolve the `system` language setting
  // exactly as the main process does (see `applyMainLanguage()`).
  handle(APP_CHANNELS.getSystemLanguages, args(), (): string[] => app.getPreferredSystemLanguages());

  // Only the project's own pages, named by key: the renderer never hands a URL to `openExternal`.
  handle(
    APP_CHANNELS.openLink,
    args((link) => {
      if (!isAppLink(link)) throw new IpcArgumentError('link', 'one of the project links');
      return link;
    }),
    async (_event, link) => {
      await shell.openExternal(APP_LINKS[link]);
    },
  );

  // Asks GitHub for the latest release; the answer only says whether a newer version exists. The
  // renderer opens the releases page through `app:open-link`, so it never handles a URL.
  handle(
    APP_CHANNELS.checkUpdate,
    args(),
    (): Promise<UpdateCheckResult> =>
      checkForUpdate(app.getVersion(), {
        // Chromium's network stack: it honours the system proxy settings.
        fetch: net.fetch as typeof fetch,
        userAgent: `Skeudenn/${app.getVersion()}`,
        timeoutMs: 15_000,
      }),
  );
}

/** Tells every window a comic the OS asked to open is waiting: the renderer then calls `app:take-launch-file`. */
export function announceLaunchFile(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(APP_CHANNELS.launchFile);
    }
  }
}
