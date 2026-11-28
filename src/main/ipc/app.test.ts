import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, ...raw: unknown[]) => unknown>();
const openExternal = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()));
vi.mock('electron', () => ({
  app: { getName: () => 'Skeudenn', getVersion: () => '0.0.0', getPreferredSystemLanguages: () => [] },
  net: { fetch: vi.fn() },
  shell: { openExternal },
  ipcMain: { handle: (channel: string, fn: (event: unknown, ...raw: unknown[]) => unknown) => handlers.set(channel, fn) },
}));

import { AUTHOR_SEARCH_PROVIDERS, MAX_AUTHOR_NAME_LENGTH } from '../../shared/author-search';
import { APP_CHANNELS, registerAppIpc } from './app';
import type { LaunchFiles } from './launch-files';

describe('app:open-author-search', () => {
  beforeEach(() => {
    handlers.clear();
    openExternal.mockClear();
    registerAppIpc({ take: () => null } as unknown as LaunchFiles);
  });

  const open = async (...raw: unknown[]) => handlers.get(APP_CHANNELS.openAuthorSearch)?.({}, ...raw);

  it('opens the search of a known site, built by the main process', async () => {
    await open('wikipedia', 'Hergé');

    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://fr.wikipedia.org/w/index.php?search=Herg%C3%A9');
  });

  it('flips a "Last, First" name', async () => {
    await open('comicvine', 'Goscinny, René');

    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://comicvine.gamespot.com/search/?i=person&q=Ren%C3%A9%20Goscinny');
  });

  it("only ever opens an https URL on the provider's own host", async () => {
    for (const provider of AUTHOR_SEARCH_PROVIDERS) {
      openExternal.mockClear();
      await open(provider.id, 'https://evil.example/ @evil.example\\..//x');
      const url = openExternal.mock.calls[0][0];
      expect(new URL(url).protocol).toBe('https:');
      expect(new URL(url).hostname).toBe(new URL(provider.urlPattern.replace('{q}', 'x')).hostname);
    }
  });

  it.each([
    ['an unknown provider', ['evil', 'Hergé']],
    ['a URL in place of a provider', ['https://evil.example/', 'Hergé']],
    ['an inherited property as a provider', ['constructor', 'Hergé']],
    ['a missing provider', [undefined, 'Hergé']],
    ['an empty name', ['wikipedia', '']],
    ['a blank name', ['wikipedia', '  \n ']],
    ['a name that is not a string', ['wikipedia', 42]],
    ['a name that is too long', ['wikipedia', 'x'.repeat(MAX_AUTHOR_NAME_LENGTH + 1)]],
    ['a missing name', ['wikipedia']],
    ['an extra argument', ['wikipedia', 'Hergé', 'https://evil.example/']],
  ])('refuses %s without opening anything', async (_label, raw) => {
    await expect(Promise.resolve().then(() => open(...raw))).rejects.toThrow();

    expect(openExternal).not.toHaveBeenCalled();
  });
});
