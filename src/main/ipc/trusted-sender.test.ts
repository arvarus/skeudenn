import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, ...raw: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (event: unknown, ...raw: unknown[]) => unknown) => handlers.set(channel, fn) },
}));

import { handle } from './handle';
import { assertTrustedSender, isAppUrl, setAppUrl, UntrustedSenderError } from './trusted-sender';
import { args } from './validate';

const DEV = new URL('http://localhost:5173/');
const PACKAGED = new URL('file:///opt/Skeudenn/resources/app.asar/.vite/renderer/main_window/index.html');

describe('isAppUrl', () => {
  it('matches the dev server by origin, whatever the path, query or fragment', () => {
    expect(isAppUrl('http://localhost:5173/', DEV)).toBe(true);
    expect(isAppUrl('http://localhost:5173/reader?book=1#top', DEV)).toBe(true);
    expect(isAppUrl('http://localhost:5174/', DEV)).toBe(false);
    expect(isAppUrl('https://localhost:5173/', DEV)).toBe(false);
    expect(isAppUrl('http://evil.example/', DEV)).toBe(false);
  });

  it('matches the packaged page by file', () => {
    expect(isAppUrl(`${PACKAGED.href}#/library`, PACKAGED)).toBe(true);
    expect(isAppUrl('file:///opt/Skeudenn/resources/app.asar/.vite/renderer/main_window/other.html', PACKAGED)).toBe(false);
    expect(isAppUrl('file:///tmp/evil.html', PACKAGED)).toBe(false);
    expect(isAppUrl('about:blank', PACKAGED)).toBe(false);
    expect(isAppUrl('not a url', PACKAGED)).toBe(false);
  });
});

function event(frameUrl: string | null, isMainFrame = true): IpcMainInvokeEvent {
  const frame = frameUrl === null ? null : { url: frameUrl };
  return {
    senderFrame: frame,
    sender: { mainFrame: isMainFrame ? frame : { url: PACKAGED.href } },
  } as unknown as IpcMainInvokeEvent;
}

describe('assertTrustedSender', () => {
  afterEach(() => handlers.clear());

  it('accepts the application page in its main frame', () => {
    setAppUrl(PACKAGED.href);
    expect(() => assertTrustedSender(event(PACKAGED.href))).not.toThrow();
  });

  it('refuses another page, a sub-frame and a frame that is gone', () => {
    setAppUrl(PACKAGED.href);
    expect(() => assertTrustedSender(event('https://evil.example/'))).toThrow(UntrustedSenderError);
    expect(() => assertTrustedSender(event(PACKAGED.href, false))).toThrow(UntrustedSenderError);
    expect(() => assertTrustedSender(event(null))).toThrow(UntrustedSenderError);
  });

  it('makes handle() answer the application page only', () => {
    setAppUrl(PACKAGED.href);
    const fn = vi.fn(() => 'ok');
    handle('test:channel', args(), fn);
    const registered = handlers.get('test:channel')!;

    expect(registered(event(PACKAGED.href))).toBe('ok');
    expect(() => registered(event('https://evil.example/'))).toThrow(UntrustedSenderError);
    expect(fn).toHaveBeenCalledOnce();
  });
});
