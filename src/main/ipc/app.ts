import { app, net, shell } from 'electron';

import { APP_LINKS, isAppLink, type AppInfo, type UpdateCheckResult } from '../../shared/app';
import { MAX_AUTHOR_NAME_LENGTH, authorSearchUrl, isAuthorSearchProviderId } from '../../shared/author-search';
import { checkForUpdate } from '../services/update-checker';
import { broadcast } from './broadcast';
import { handle } from './handle';
import type { LaunchFiles } from './launch-files';
import { IpcArgumentError, args, expectNonEmptyString } from './validate';

// Channel names are shared with preload.ts: keep them in sync.
export const APP_CHANNELS = {
  getInfo: 'app:get-info',
  getSystemLanguages: 'app:get-system-languages',
  openLink: 'app:open-link',
  openAuthorSearch: 'app:open-author-search',
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

  // The renderer names a provider of the fixed list and a name; the main process builds the
  // address and only opens an `https:` URL on that provider's own host, never one the renderer made.
  handle(
    APP_CHANNELS.openAuthorSearch,
    args(
      (provider) => {
        if (!isAuthorSearchProviderId(provider)) throw new IpcArgumentError('provider', 'one of the author search sites');
        return provider;
      },
      (name) => expectNonEmptyString(name, 'name', MAX_AUTHOR_NAME_LENGTH),
    ),
    async (_event, provider, name) => {
      const url = authorSearchUrl(provider, name);
      if (url === null) throw new IpcArgumentError('name', 'a name to search');
      await shell.openExternal(url);
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
  broadcast(APP_CHANNELS.launchFile);
}
