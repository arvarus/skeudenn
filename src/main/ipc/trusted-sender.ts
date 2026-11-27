/**
 * Which pages may call the IPC handlers: the application's own page, in its main frame, and nothing
 * else. The window can't navigate elsewhere (see `main.ts`), so this is defence in depth: should a
 * foreign page or a sub-frame ever load, `window.skeudenn` still couldn't reach the main process.
 * @module
 */
import type { IpcMainInvokeEvent } from 'electron';

/** A call from a page or frame that isn't the application's own. */
export class UntrustedSenderError extends Error {
  constructor(url: string) {
    super(`IPC call refused: "${url}" is not the application page`);
    this.name = 'UntrustedSenderError';
  }
}

let appUrl: URL | null = null;

/**
 * Declares the page the window loads (the dev server's URL, or the packaged `index.html`). Called
 * once, before the handlers are registered; until then (unit tests of a single handler) no sender is checked.
 */
export function setAppUrl(url: string): void {
  appUrl = new URL(url);
}

/**
 * Whether `candidate` is the application page `app`: same origin for the dev server (`http:`), same
 * file for the packaged app (`file:` has no useful origin). The query and the fragment don't matter.
 */
export function isAppUrl(candidate: string, app: URL): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== app.protocol) return false;
  return app.protocol === 'file:' ? url.pathname === app.pathname : url.origin === app.origin;
}

/** Throws an {@link UntrustedSenderError} unless `event` comes from the main frame of the application page. */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!appUrl) return;
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame || !isAppUrl(frame.url, appUrl)) {
    throw new UntrustedSenderError(frame?.url ?? '');
  }
}
