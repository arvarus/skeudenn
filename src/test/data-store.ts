// A test helper, not a test: Vitest only runs `*.test.*` files.
/**
 * Starts the renderer's data store (`appData`) on a fake main process holding a library, for the
 * tests of the pages that read `useLibrary()`. The store starts once per test file: change the
 * library with {@link LibraryFake.setLibrary}.
 * @module
 */
import { act } from '@testing-library/react';

import { appData } from '@/lib/app-data';
import type { DataChange } from '@/shared/data-changes';
import type { LibraryEntry } from '@/shared/library';
import { DEFAULT_SETTINGS, toPublicSettings } from '@/shared/settings';
import { installTankobon, type FakeTankobon } from '@/test/tankobon';

/** The fake main process of {@link startAppData}. */
export interface LibraryFake {
  /** The fake `window.tankobon`, to pass to `renderWithTankobon()`. */
  fake: FakeTankobon;
  /** Replaces the library and tells the store, as the main process does after a bulk write. */
  setLibrary(entries: LibraryEntry[]): Promise<void>;
}

/** Installs a fake `window.tankobon` serving `library` and starts `appData` on it, once the settings are loaded. */
export async function startAppData(library: LibraryEntry[]): Promise<LibraryFake> {
  let current = library;
  let notify: (change: DataChange) => void = () => undefined;
  const fake: FakeTankobon = {
    settings: { getAll: () => Promise.resolve(toPublicSettings(DEFAULT_SETTINGS)), set: () => Promise.resolve() },
    library: { list: () => Promise.resolve(current) },
    readingLists: { list: () => Promise.resolve([]) },
    achievements: { list: () => Promise.resolve([]) },
    users: { list: () => Promise.resolve({ users: [{ id: 'anne', nickname: 'Anne', avatar: null, avatarType: null }], activeId: 'anne' }) },
    data: {
      onChanged: (listener: (change: DataChange) => void) => {
        notify = listener;
        return () => undefined;
      },
    },
  };
  installTankobon(fake);
  appData.start();
  await appData.ready;
  return {
    fake,
    setLibrary: async (entries) => {
      current = entries;
      await act(async () => notify({ scope: 'library' }));
    },
  };
}
