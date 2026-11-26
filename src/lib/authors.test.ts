import { beforeEach, describe, expect, it } from 'vitest';

import {
  authorBooks,
  authorProfile,
  authorSeriesSections,
  authorsIndex,
  booksWithRole,
  filterAuthors,
  groupAuthorsByLetter,
} from '@/lib/authors';
import { applyLanguage } from '@/shared/i18n';
import type { Credit, LibraryEntry } from '@/shared/library';
import { libraryEntry } from '@/test/fixtures';

beforeEach(() => applyLanguage('fr'));

const credit = (personId: string, firstName: string, lastName: string, role: Credit['role']): Credit => ({
  personId,
  firstName,
  lastName,
  role,
});

const goscinny = (role: Credit['role'] = 'writer') => credit('p-gos', 'René', 'Goscinny', role);
const uderzo = (role: Credit['role'] = 'artist') => credit('p-ude', 'Albert', 'Uderzo', role);

const library: LibraryEntry[] = [
  libraryEntry('a1', { series: 'Astérix', volume: '1', credits: [goscinny(), uderzo()] }),
  libraryEntry('a2', { series: 'Astérix', volume: '10', credits: [goscinny(), uderzo()], tags: ['Lu'] }),
  libraryEntry('a3', { series: 'Astérix', volume: '2', credits: [goscinny('writer'), goscinny('letterer')] }),
  libraryEntry('lucky', { title: 'Lucky Luke', credits: [goscinny()] }),
  libraryEntry('plain'),
];

describe('authorsIndex()', () => {
  it('counts each book once and lists the roles in display order', () => {
    const index = authorsIndex(library);
    const rene = index.find((author) => author.personId === 'p-gos');
    // a3 holds two roles for him: still one book.
    expect(rene).toMatchObject({ name: 'René Goscinny', bookCount: 4, roles: ['writer', 'letterer'] });
    expect(index.find((author) => author.personId === 'p-ude')).toMatchObject({ bookCount: 2, roles: ['artist'] });
  });

  it('keeps two people with the same last name apart', () => {
    const entries = [
      libraryEntry('x', { credits: [credit('p1', 'Jean', 'Martin', 'writer')] }),
      libraryEntry('y', { credits: [credit('p2', 'Paul', 'Martin', 'artist')] }),
    ];
    expect(authorsIndex(entries).map((author) => [author.personId, author.bookCount])).toEqual([
      ['p1', 1],
      ['p2', 1],
    ]);
  });

  it('sorts by last name then first name', () => {
    const entries = [
      libraryEntry('x', {
        credits: [
          credit('p3', 'Zoé', 'Adam', 'writer'),
          credit('p2', 'Paul', 'Martin', 'writer'),
          credit('p1', 'Jean', 'Martin', 'writer'),
          credit('p4', '', 'Hergé', 'writer'),
        ],
      }),
    ];
    expect(authorsIndex(entries).map((author) => author.name)).toEqual(['Zoé Adam', 'Hergé', 'Jean Martin', 'Paul Martin']);
  });

  it('drops people with no book left, and gives nothing for a library without credits', () => {
    expect(authorsIndex([libraryEntry('plain')])).toEqual([]);
    expect(authorsIndex([])).toEqual([]);
  });
});

describe('filterAuthors()', () => {
  const authors = authorsIndex(library);

  it('ignores accents and case, and the order of the names', () => {
    expect(filterAuthors(authors, 'RENE').map((author) => author.personId)).toEqual(['p-gos']);
    expect(filterAuthors(authors, 'goscinny rené').map((author) => author.personId)).toEqual(['p-gos']);
    expect(filterAuthors(authors, 'ude').map((author) => author.personId)).toEqual(['p-ude']);
  });

  it('keeps everyone for an empty search and no one for an unknown name', () => {
    expect(filterAuthors(authors, '  ')).toBe(authors);
    expect(filterAuthors(authors, 'zzz')).toEqual([]);
  });
});

describe('groupAuthorsByLetter()', () => {
  it('puts the authors under the initial of their last name, accents removed', () => {
    const entries = [
      libraryEntry('x', {
        credits: [
          credit('p1', 'Jean', 'Étienne', 'writer'),
          credit('p2', 'Paul', 'Evans', 'writer'),
          credit('p3', 'Pierre', 'Dupont', 'writer'),
          credit('p4', '', '1984', 'writer'),
        ],
      }),
    ];
    const groups = groupAuthorsByLetter(authorsIndex(entries));
    expect(groups.map((group) => [group.letter, group.authors.map((a) => a.personId)])).toEqual([
      ['#', ['p4']],
      ['D', ['p3']],
      ['E', ['p1', 'p2']],
    ]);
  });
});

describe('authorBooks()', () => {
  it('lists the books of the person once, with their roles, in library order', () => {
    expect(authorBooks(library, 'p-gos').map(({ entry, roles }) => [entry.id, roles])).toEqual([
      ['a1', ['writer']],
      ['a2', ['writer']],
      ['a3', ['writer', 'letterer']],
      ['lucky', ['writer']],
    ]);
  });

  it('is empty for an unknown person', () => {
    expect(authorBooks(library, 'nobody')).toEqual([]);
  });
});

describe('authorProfile()', () => {
  it('gives the counts of the person, the read books included', () => {
    expect(authorProfile(library, 'p-ude')).toMatchObject({ name: 'Albert Uderzo', bookCount: 2, readCount: 1, roles: ['artist'] });
  });

  it('is null for an unknown or no longer credited person', () => {
    expect(authorProfile(library, 'nobody')).toBeNull();
    expect(authorProfile([libraryEntry('plain')], 'p-gos')).toBeNull();
  });
});

describe('booksWithRole()', () => {
  const books = authorBooks(library, 'p-gos');

  it('keeps every book for "all" and the books holding the role otherwise', () => {
    expect(booksWithRole(books, 'all')).toHaveLength(4);
    expect(booksWithRole(books, 'letterer').map(({ entry }) => entry.id)).toEqual(['a3']);
    expect(booksWithRole(books, 'colorist')).toEqual([]);
  });
});

describe('authorSeriesSections()', () => {
  it('groups by series in volume order, the books without a series last', () => {
    const sections = authorSeriesSections(authorBooks(library, 'p-gos'));
    expect(sections.map((section) => [section.series, section.books.map(({ entry }) => entry.id), section.readCount])).toEqual([
      ['Astérix', ['a1', 'a3', 'a2'], 1],
      [null, ['lucky'], 0],
    ]);
    // The roles come with each book.
    expect(sections[0].books[1].roles).toEqual(['writer', 'letterer']);
  });

  it('is empty without books', () => {
    expect(authorSeriesSections([])).toEqual([]);
  });
});
