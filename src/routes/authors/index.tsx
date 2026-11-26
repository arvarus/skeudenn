import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLibrary } from '@/hooks/use-library';
import { authorsIndex, filterAuthors, groupAuthorsByLetter } from '@/lib/authors';
import { creditRoleLabel } from '@/lib/metadata-review';

export const Route = createFileRoute('/authors/')({
  component: AuthorsPage,
});

/** The authors index: everyone credited on a book of the library, under letter headings, with a search field. */
function AuthorsPage() {
  const { t } = useTranslation('authors');
  const library = useLibrary();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  // Built from the whole library: it follows every change of the data store.
  const authors = useMemo(() => (library ? authorsIndex(library) : null), [library]);
  const groups = useMemo(
    () => (authors ? groupAuthorsByLetter(filterAuthors(authors, deferredSearch)) : []),
    [authors, deferredSearch],
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('intro')}</p>

      {authors === null ? null : authors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchLabel')}
              className="h-9 w-full rounded-md border bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noMatch', { search: deferredSearch.trim() })}</p>
          ) : (
            groups.map((group) => (
              <section key={group.letter} aria-label={t('letterHeading', { letter: group.letter })} className="flex flex-col gap-1">
                <h2 className="border-b pb-1 text-sm font-semibold text-muted-foreground">{group.letter}</h2>
                <ul className="flex flex-col">
                  {group.authors.map((author) => (
                    <li key={author.personId}>
                      <Link
                        to="/authors/$personId"
                        params={{ personId: author.personId }}
                        className="flex items-baseline gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                      >
                        <span className="min-w-0 truncate font-medium">{author.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {author.roles.map(creditRoleLabel).join(', ')}
                        </span>
                        <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {t('bookCount', { count: author.bookCount })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
