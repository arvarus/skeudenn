/**
 * The authors of the library, built from the credits of its entries (pure, no DOM): the index of
 * everyone credited on at least one book, and the books of one person grouped by series.
 * @module
 */
import { currentLanguage } from '@/shared/i18n';
import { isFinished } from '@/lib/reading-list';
import { groupBySeries, NO_SERIES_KEY } from '@/lib/library-groups';
import { normalize } from '@/lib/library-filter';
import { CREDIT_ROLES, type CreditRole, type LibraryEntry, type PersonName } from '@/shared/library';
import { formatPersonName } from '@/shared/title-parsing';

/** A person credited on at least one book, as the authors index lists them. */
export interface AuthorSummary extends PersonName {
  /** Id of the person (`Credit.personId`): two people with the same name keep different ones. */
  personId: string;
  /** The name as shown ("First Last", or "Last" alone). */
  name: string;
  /** Number of books the person is credited on, a book counting once whatever their roles. */
  bookCount: number;
  /** The roles the person holds on any book, in `CREDIT_ROLES` order. */
  roles: CreditRole[];
}

/** A book of an author's page, with the roles the author holds on it. */
export interface AuthorBook {
  entry: LibraryEntry;
  /** The author's roles on this book, in `CREDIT_ROLES` order (at least one). */
  roles: CreditRole[];
}

/** The roles of `held`, without repeats, in `CREDIT_ROLES` order. */
function orderedRoles(held: ReadonlySet<CreditRole>): CreditRole[] {
  return CREDIT_ROLES.filter((role) => held.has(role));
}

/**
 * Everyone credited on at least one of `entries`, sorted by last name then first name (compared
 * in the current language, numbers and accents handled as a person would). A person with no
 * credit left on any book isn't listed.
 */
export function authorsIndex(entries: LibraryEntry[]): AuthorSummary[] {
  const people = new Map<string, { person: PersonName; books: Set<string>; roles: Set<CreditRole> }>();
  for (const entry of entries) {
    for (const credit of entry.credits) {
      let person = people.get(credit.personId);
      if (!person) {
        person = { person: { firstName: credit.firstName, lastName: credit.lastName }, books: new Set(), roles: new Set() };
        people.set(credit.personId, person);
      }
      person.books.add(entry.id);
      person.roles.add(credit.role);
    }
  }
  const collator = new Intl.Collator(currentLanguage(), { numeric: true });
  return [...people.entries()]
    .map(([personId, { person, books, roles }]): AuthorSummary => ({
      personId,
      firstName: person.firstName,
      lastName: person.lastName,
      name: formatPersonName(person),
      bookCount: books.size,
      roles: orderedRoles(roles),
    }))
    .sort(
      (a, b) =>
        collator.compare(a.lastName, b.lastName) ||
        collator.compare(a.firstName, b.firstName) ||
        a.personId.localeCompare(b.personId),
    );
}

/** The authors whose name contains `search`, ignoring case, accents and the order of first and last name; an empty search keeps them all. */
export function filterAuthors(authors: AuthorSummary[], search: string): AuthorSummary[] {
  const words = normalize(search.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return authors;
  return authors.filter((author) => {
    const name = normalize(author.name);
    return words.every((word) => name.includes(word));
  });
}

/** One letter heading of the authors index and the authors under it. */
export interface AuthorLetterGroup {
  /** The heading: the capital initial of the last name without its accent, or `#` when it isn't a letter. */
  letter: string;
  authors: AuthorSummary[];
}

/**
 * The authors (already sorted, see `authorsIndex()`) under letter headings. The initial is that of
 * the last name, else of the first name for a person with no last name.
 */
export function groupAuthorsByLetter(authors: AuthorSummary[]): AuthorLetterGroup[] {
  const groups: AuthorLetterGroup[] = [];
  for (const author of authors) {
    const initial = normalize(author.lastName || author.firstName).trimStart().charAt(0).toLocaleUpperCase();
    const letter = /^\p{L}$/u.test(initial) ? initial : '#';
    const last = groups.at(-1);
    if (last?.letter === letter) last.authors.push(author);
    else groups.push({ letter, authors: [author] });
  }
  return groups;
}

/**
 * The books of `entries` the person is credited on, in the order of `entries`, each with the roles
 * they hold on it. A book credited under two roles appears once. Empty for an unknown person.
 */
export function authorBooks(entries: LibraryEntry[], personId: string): AuthorBook[] {
  return entries.flatMap((entry) => {
    const roles = new Set(entry.credits.filter((credit) => credit.personId === personId).map((credit) => credit.role));
    return roles.size > 0 ? [{ entry, roles: orderedRoles(roles) }] : [];
  });
}

/** What the header of an author's page shows. */
export interface AuthorProfile extends AuthorSummary {
  /** Books of the person that count as read (`isFinished()`). */
  readCount: number;
}

/** The author's summary and read count, or null when `personId` is credited on no book (unknown, or no longer credited). */
export function authorProfile(entries: LibraryEntry[], personId: string): AuthorProfile | null {
  const author = authorsIndex(entries.filter((entry) => entry.credits.some((credit) => credit.personId === personId))).find(
    (candidate) => candidate.personId === personId,
  );
  if (!author) return null;
  return { ...author, readCount: authorBooks(entries, personId).filter(({ entry }) => isFinished(entry)).length };
}

/** The books that hold `role` for the author; `'all'` keeps every one. */
export function booksWithRole(books: AuthorBook[], role: CreditRole | 'all'): AuthorBook[] {
  return role === 'all' ? books : books.filter((book) => book.roles.includes(role));
}

/** A series of an author's page and the author's books in it. */
export interface AuthorSeriesSection {
  /** Key of the series (`NO_SERIES_KEY` for the books without one). */
  key: string;
  /** The series as written, `null` for the books without one. */
  series: string | null;
  /** Books in volume order. */
  books: AuthorBook[];
  /** Of those, how many count as read. */
  readCount: number;
}

/**
 * The books grouped by series like the grouped library: series in alphabetical order, books by
 * volume, the books without a series last.
 */
export function authorSeriesSections(books: AuthorBook[]): AuthorSeriesSection[] {
  const byId = new Map(books.map((book) => [book.entry.id, book]));
  const sections: AuthorSeriesSection[] = [];
  for (const row of groupBySeries(books.map((book) => book.entry))) {
    if (row.kind === 'series') {
      sections.push({ key: row.key, series: row.key === NO_SERIES_KEY ? null : row.series, books: [], readCount: row.finished });
    } else {
      sections.at(-1)!.books.push(byId.get(row.entry.id)!);
    }
  }
  return sections;
}
