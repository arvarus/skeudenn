// @vitest-environment jsdom
// The leading `-` keeps the router plugin from taking this file for a route.
import { renderWithSkeudenn } from '@/test/skeudenn';

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { startAppData, type LibraryFake } from '@/test/data-store';
import { libraryEntry } from '@/test/fixtures';
import type { Credit } from '@/shared/library';
import { Route } from './index';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Link: ({ children, params }: { children: ReactNode; params: { personId: string } }) => (
    <a href={`/authors/${params.personId}`}>{children}</a>
  ),
}));

afterEach(cleanup);

const credit = (personId: string, firstName: string, lastName: string, role: Credit['role']): Credit => ({
  personId,
  firstName,
  lastName,
  role,
});
const goscinny = credit('gos', 'René', 'Goscinny', 'writer');
const uderzo = credit('ude', 'Albert', 'Uderzo', 'artist');
const library = [
  libraryEntry('a1', { credits: [goscinny, uderzo] }),
  libraryEntry('a2', { credits: [goscinny, { ...goscinny, role: 'letterer' }] }),
  libraryEntry('b1', { credits: [credit('her', '', 'Hergé', 'author')] }),
  libraryEntry('plain'),
];

let app: LibraryFake;
beforeAll(async () => {
  app = await startAppData(library);
});

const AuthorsPage = Route.options.component as () => ReactNode;
const renderPage = () => renderWithSkeudenn(<AuthorsPage />, app.fake);

describe('authors index', () => {
  it('lists everyone credited, under letter headings, with their books and roles', async () => {
    renderPage();
    const goscinnyRow = (await screen.findByRole('link', { name: /René Goscinny/ })) as HTMLAnchorElement;
    expect(goscinnyRow.href).toContain('/authors/gos');
    expect(goscinnyRow.textContent).toContain('Scénario, Lettrage');
    expect(goscinnyRow.textContent).toContain('2 livres');
    expect(screen.getByRole('link', { name: /Albert Uderzo/ }).textContent).toContain('1 livre');

    // G, H and U, in this order; the book with no credit adds nobody.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['G', 'H', 'U']);
    expect(within(screen.getByRole('region', { name: /commençant par G/ })).getAllByRole('link')).toHaveLength(1);
  });

  it('filters by name, ignoring accents and case', async () => {
    renderPage();
    const field = await screen.findByRole('searchbox', { name: 'Rechercher un auteur' });
    fireEvent.change(field, { target: { value: 'HERGE' } });
    expect(await screen.findByRole('link', { name: /Hergé/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Goscinny/ })).toBeNull();

    fireEvent.change(field, { target: { value: 'zzz' } });
    expect(await screen.findByText(/Aucun auteur ne correspond/)).toBeTruthy();
  });

  it('follows the library: an author with no book left disappears', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: /Albert Uderzo/ })).toBeTruthy();
    await app.setLibrary(library.filter((entry) => entry.id !== 'a1'));
    expect(screen.queryByRole('link', { name: /Albert Uderzo/ })).toBeNull();
    expect(screen.getByRole('link', { name: /René Goscinny/ }).textContent).toContain('1 livre');
  });

  it('points to the lookup and the edit form when no book has credits', async () => {
    await app.setLibrary([libraryEntry('plain')]);
    renderPage();
    expect(await screen.findByText(/Rechercher les infos/)).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
});
