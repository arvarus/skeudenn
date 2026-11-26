import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BookDetails, BookRating, BookTags, ViewModePicker } from '@/components/book-row';
import { Button } from '@/components/ui/button';
import { useLibrary } from '@/hooks/use-library';
import { useSettings } from '@/hooks/use-settings';
import { authorBooks, authorProfile, authorSeriesSections, booksWithRole } from '@/lib/authors';
import { creditRoleLabel } from '@/lib/metadata-review';
import { cn } from '@/lib/utils';
import type { CreditRole, LibraryEntry } from '@/shared/library';

export const Route = createFileRoute('/authors/$personId')({
  component: AuthorPage,
  // The router keeps the component mounted when only `personId` changes: remount it so the role
  // chosen for the previous author doesn't leak into this one.
  remountDeps: ({ params }) => params,
});

/** An author's page: their books grouped by series, filtered by role, opening the reader on click. */
function AuthorPage() {
  const { personId } = Route.useParams();
  const { t } = useTranslation(['authors', 'library', 'common']);
  const navigate = useNavigate();
  const library = useLibrary();
  const { settings, update } = useSettings();
  const view = settings.authorBooksView;
  const [chosenRole, setChosenRole] = useState<CreditRole | 'all'>('all');

  const profile = useMemo(() => (library ? authorProfile(library, personId) : null), [library, personId]);
  const books = useMemo(() => (library ? authorBooks(library, personId) : []), [library, personId]);
  // A credit edited meanwhile can leave the chosen role with no book: back to every role then.
  const role = chosenRole !== 'all' && profile?.roles.includes(chosenRole) ? chosenRole : 'all';
  const sections = useMemo(() => authorSeriesSections(booksWithRole(books, role)), [books, role]);

  if (library === null) return null;
  if (profile === null) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <BackLink />
        <h1 className="text-2xl font-semibold tracking-tight">{t('notFound')}</h1>
        <p className="text-sm text-muted-foreground">{t('notFoundDetail')}</p>
      </div>
    );
  }

  const open = (entry: LibraryEntry) => void navigate({ to: '/reader', search: { book: entry.id } });

  return (
    <div className="flex flex-col gap-4 p-6">
      <BackLink />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
        <p className="text-sm text-muted-foreground">
          {[
            t('bookCount', { count: profile.bookCount }),
            t('readCount', { read: profile.readCount, count: profile.bookCount }),
            t('roles', { roles: profile.roles.map(creditRoleLabel).join(', ') }),
          ].join(' · ')}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label={t('roleFilter')} className="flex flex-wrap gap-1.5">
          {(['all', ...profile.roles] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setChosenRole(value)}
              aria-pressed={role === value}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                role === value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {value === 'all' ? t('allRoles') : creditRoleLabel(value)}
            </button>
          ))}
        </div>
        <ViewModePicker view={view} onChange={(next) => next !== 'grid' && update('authorBooksView', next)} />
      </div>

      {sections.map((section) => (
        <section key={section.key} className="flex flex-col overflow-hidden rounded-md border">
          <div className="flex items-center border-b bg-muted/50 px-3 py-2">
            <h2 className={cn('min-w-0 truncate font-semibold', section.series === null && 'text-muted-foreground italic')}>
              {section.series ?? t('library:noSeries')}
            </h2>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {t('library:seriesProgress', { finished: section.readCount, count: section.books.length })}
            </span>
          </div>
          <ul className="flex flex-col divide-y">
            {section.books.map(({ entry, roles }) => (
              <li key={entry.id} className={cn('flex flex-col gap-2 px-3', view === 'compact' ? 'py-2' : 'py-3')}>
                <div className="flex items-center gap-3">
                  <BookDetails
                    entry={entry}
                    view={view}
                    onOpen={() => open(entry)}
                    // Both roles of a book credited twice show on its row.
                    note={roles.length > 1 ? t('rolesOnBook', { roles: roles.map(creditRoleLabel).join(', ') }) : undefined}
                  />
                  {view !== 'compact' && <BookRating entry={entry} />}
                  <Button variant="secondary" size="sm" onClick={() => open(entry)}>
                    {t('common:open')}
                  </Button>
                </div>
                {view === 'full' && <BookTags entry={entry} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation('authors');
  return (
    <Link to="/authors" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      {t('backToIndex')}
    </Link>
  );
}
