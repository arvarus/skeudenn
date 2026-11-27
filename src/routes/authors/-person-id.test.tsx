// @vitest-environment jsdom
// The leading `-` keeps the router plugin from taking this file for a route.
import { renderWithSkeudenn } from '@/test/skeudenn';

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { startAppData, type LibraryFake } from '@/test/data-store';
import { libraryEntry } from '@/test/fixtures';
import type { Credit } from '@/shared/library';
import { Route } from './$personId';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), params: { personId: 'gos' } }));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => mocks.params }),
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/components/book-cover', () => ({ BookCover: () => null }));

afterEach(cleanup);
beforeEach(() => {
  mocks.navigate.mockClear();
  mocks.params.personId = 'gos';
});

const credit = (personId: string, firstName: string, lastName: string, role: Credit['role']): Credit => ({
  personId,
  firstName,
  lastName,
  role,
});
const goscinny = (role: Credit['role']) => credit('gos', 'René', 'Goscinny', role);
const uderzo = credit('ude', 'Albert', 'Uderzo', 'artist');
const library = [
  libraryEntry('a1', { title: 'Astérix le Gaulois', series: 'Astérix', volume: '1', credits: [goscinny('writer'), uderzo] }),
  libraryEntry('a10', { title: 'Astérix en Corse', series: 'Astérix', volume: '10', tags: ['Lu'], credits: [goscinny('writer')] }),
  libraryEntry('a2', { title: 'La Serpe d’or', series: 'Astérix', volume: '2', credits: [goscinny('writer'), goscinny('letterer')] }),
  libraryEntry('lucky', { title: 'Lucky Luke seul', credits: [goscinny('writer')] }),
  libraryEntry('other', { title: 'Autre', credits: [uderzo] }),
];

let app: LibraryFake;
beforeAll(async () => {
  app = await startAppData(library);
});

const AuthorPage = Route.options.component as () => ReactNode;
const renderPage = () => renderWithSkeudenn(<AuthorPage />, app.fake);
const openButtons = () => screen.getAllByRole('button', { name: /^Ouvrir / }).map((button) => button.getAttribute('aria-label'));

describe('author page', () => {
  it('shows the name, how many books are read and the roles', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'René Goscinny' })).toBeTruthy();
    expect(screen.getByText('4 livres · Lus : 1 / 4 · Rôles : Scénario, Lettrage')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Auteurs' })).toBeTruthy();
  });

  it('groups the books by series in volume order, the books without a series last', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['Astérix', 'Sans série']);

    const series = screen.getByRole('heading', { level: 2, name: 'Astérix' }).closest('section')!;
    expect(within(series).getByText('Lus : 1 / 3')).toBeTruthy();
    expect(openButtons()).toEqual([
      'Ouvrir Astérix le Gaulois',
      'Ouvrir La Serpe d’or',
      'Ouvrir Astérix en Corse',
      'Ouvrir Lucky Luke seul',
    ]);
  });

  it('shows a book credited under two roles once, with both roles', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('button', { name: 'Ouvrir La Serpe d’or' })).toHaveLength(1);
    expect(screen.getAllByText(/Rôle : Scénario, Lettrage/)).toHaveLength(1);
  });

  it('filters the books by role', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    const chips = within(screen.getByRole('group', { name: 'Filtrer par rôle' })).getAllByRole('button');
    expect(chips.map((chip) => chip.textContent)).toEqual(['Tous', 'Scénario', 'Lettrage']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chips[2]);
    expect(openButtons()).toEqual(['Ouvrir La Serpe d’or']);
    expect(screen.queryByRole('heading', { level: 2, name: 'Sans série' })).toBeNull();
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('opens the reader on a book', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir Lucky Luke seul' }));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/reader', search: { book: 'lucky' } });
  });

  it('shows the not-found state, with a link to the index, for an unknown author', async () => {
    mocks.params.personId = 'nobody';
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Auteur introuvable' })).toBeTruthy();
    expect((screen.getByRole('link', { name: 'Auteurs' }) as HTMLAnchorElement).href).toContain('/authors');
  });

  it('follows the library: a removed book leaves, and an author no longer credited is not found', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'René Goscinny' });
    await app.setLibrary(library.filter((entry) => entry.id !== 'lucky'));
    expect(screen.getByText(/^3 livres/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ouvrir Lucky Luke seul' })).toBeNull();

    await app.setLibrary(library.filter((entry) => !entry.credits.some((c) => c.personId === 'gos')));
    expect(screen.getByRole('heading', { name: 'Auteur introuvable' })).toBeTruthy();
  });
});
