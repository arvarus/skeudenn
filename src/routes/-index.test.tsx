// @vitest-environment jsdom
// The leading `-` keeps the router plugin from taking this file for a route.
import { installTankobon, renderWithTankobon } from '@/test/tankobon';

import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appData } from '@/lib/app-data';
import { libraryEntry } from '@/test/fixtures';
import { deferred } from '@/test/runs';
import type { DataChange } from '@/shared/data-changes';
import type { LibraryEntry } from '@/shared/library';
import { DEFAULT_SETTINGS, HOME_SECTIONS, toPublicSettings, type PublicSettings } from '@/shared/settings';
import type { UsersState } from '@/shared/users';
import { Route } from './index';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Navigate: () => null,
  Link: ({ children, 'aria-label': label }: { children: ReactNode; 'aria-label'?: string }) => (
    <a aria-label={label}>{children}</a>
  ),
}));
vi.mock('@/components/book-cover', () => ({ BookCover: () => null }));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(cleanup);

/** Only the suggestions block: the one drawn at random once the library is there. */
const settings = toPublicSettings({
  ...DEFAULT_SETTINGS,
  homeSections: HOME_SECTIONS.map((id) => ({ id, visible: id === 'suggestions' })),
});

const users = (activeId: string): UsersState => ({
  users: [
    { id: 'anne', nickname: 'Anne', avatar: null, avatarType: null },
    { id: 'bob', nickname: 'Bob', avatar: null, avatarType: null },
  ],
  activeId,
});

/** The same books, read by one user and not by the other. */
const annesLibrary = [libraryEntry('Alpha', { tags: ['Lu'] }), libraryEntry('Beta')];
const bobsLibrary = [libraryEntry('Alpha'), libraryEntry('Beta', { tags: ['Lu'] })];

describe('home page', () => {
  it('draws the suggestions again from the new user’s books after a switch of user', async () => {
    let state = users('anne');
    let library: LibraryEntry[] = annesLibrary;
    let settingsAnswer: Promise<PublicSettings> = Promise.resolve(settings);
    let notify: (change: DataChange) => void = () => undefined;
    const fake = {
      settings: { getAll: () => settingsAnswer },
      library: { list: () => Promise.resolve(library) },
      readingLists: { list: () => Promise.resolve([]) },
      achievements: { list: () => Promise.resolve([]) },
      users: { list: () => Promise.resolve(state) },
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
    const HomePage = Route.options.component as () => ReactNode;
    renderWithTankobon(<HomePage />, fake);

    expect(await screen.findByLabelText('Ouvrir Beta')).toBeTruthy();
    expect(screen.queryByLabelText('Ouvrir Alpha')).toBeNull();

    // Bob's library arrives before his settings, so before the block is remounted for him: the
    // draw made for Anne must not show through it.
    const bobsSettings = deferred<PublicSettings>();
    state = users('bob');
    library = bobsLibrary;
    settingsAnswer = bobsSettings.promise;
    act(() => notify({ scope: 'users' }));
    await waitFor(() => expect(screen.queryByLabelText('Ouvrir Alpha')).toBeTruthy());
    expect(screen.queryByLabelText('Ouvrir Beta')).toBeNull();

    await act(async () => bobsSettings.resolve(settings));
    expect(await screen.findByText('Bienvenue Bob')).toBeTruthy();
    expect(screen.getByLabelText('Ouvrir Alpha')).toBeTruthy();
    expect(screen.queryByLabelText('Ouvrir Beta')).toBeNull();
  });
});
