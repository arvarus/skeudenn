import { LayoutGrid, LayoutList, Rows2, Rows3, Star, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { AuthorLink } from '@/components/author-link';
import { BookCover } from '@/components/book-cover';
import { bookTooltip } from '@/lib/book-tooltip';
import { LanguageFlag } from '@/components/language-flag';
import { Button } from '@/components/ui/button';
import { appData } from '@/lib/app-data';
import { formatPageSize } from '@/lib/image-scan';
import { languageCountry } from '@/lib/language-flag';
import { creditRoleLabel } from '@/lib/metadata-review';
import { QUICK_TAGS, tagLabel, toggleTag } from '@/lib/reading-list';
import { cn, formatFileSize, formatLanguage } from '@/lib/utils';
import { comicFormat } from '@/shared/comic';
import { currentLanguage } from '@/shared/i18n';
import { CREDIT_ROLES, type LibraryEntry } from '@/shared/library';
import type { BookRowView, LibraryView } from '@/shared/settings';
import { formatPersonName } from '@/shared/title-parsing';

// The parts of a book row shared by the library page and a reading list's page, so that both show a
// book the same way in each display mode. Each page keeps its own row layout and actions around them.

/**
 * Switches a list of books between the display modes: one icon button per mode. `withGrid` adds the
 * grid of covers, which only the library offers.
 */
export function ViewModePicker({
  view,
  onChange,
  withGrid = false,
}: {
  view: LibraryView;
  onChange: (view: LibraryView) => void;
  withGrid?: boolean;
}) {
  const { t } = useTranslation('library');
  const modes: { value: LibraryView; Icon: typeof LayoutList; label: string }[] = [
    { value: 'full', Icon: LayoutList, label: t('viewFull') },
    { value: 'medium', Icon: Rows2, label: t('viewMedium') },
    { value: 'compact', Icon: Rows3, label: t('viewCompact') },
    ...(withGrid ? [{ value: 'grid' as const, Icon: LayoutGrid, label: t('viewGrid') }] : []),
  ];
  return (
    <div role="group" aria-label={t('viewMode')} className="flex h-9 w-fit items-center gap-0.5 rounded-md border p-px">
      {modes.map(({ value, Icon, label }) => (
        <Button
          key={value}
          variant={view === value ? 'secondary' : 'ghost'}
          size="icon-sm"
          onClick={() => onChange(value)}
          aria-pressed={view === value}
          title={label}
          aria-label={label}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}

/**
 * The cover (except in compact mode), the title and the details of a book, as much as `view` shows;
 * a click anywhere on it calls `onOpen`. `progress` replaces the page counter (a reading list says
 * "Read" for a finished book), `note` is appended to it, and `finished` strikes the title through.
 */
export function BookDetails({
  entry,
  view,
  onOpen,
  progress,
  note,
  finished = false,
}: {
  entry: LibraryEntry;
  view: BookRowView;
  onOpen: () => void;
  progress?: string;
  note?: string;
  finished?: boolean;
}) {
  const { t } = useTranslation(['library', 'common']);
  const pageOf = progress ?? t('common:pageOf', { page: entry.currentPage + 1, total: entry.pageCount });
  const pageSize = formatPageSize(entry, currentLanguage());
  const status =
    view === 'full'
      ? [
          pageOf,
          comicFormat(entry.path),
          t('fileCount', { count: entry.fileCount }),
          formatFileSize(entry.fileSize),
          pageSize && t('pageSize', { size: pageSize }),
          note,
        ]
      : [pageOf, note];
  const title = cn('font-medium', finished && 'line-through');
  return (
    // A click anywhere on the row opens the book for the mouse. Keyboard and screen-reader users have the
    // "open" buttons (the cover, and the row's own button), so this isn't a link of its own: a `role="link"`
    // that can't be focused would be announced and then be unreachable.
    <div onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
      {view !== 'compact' && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          title={t('common:open')}
          aria-label={t('openNamed', { title: entry.title })}
          className="shrink-0 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <BookCover entryId={entry.id} title={entry.title} className="h-20 w-14" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {view === 'compact' ? (
          <p className="truncate" title={bookTooltip(entry)}>
            <span className={title}>{entry.title}</span>
            <span className="text-xs text-muted-foreground">{seriesLine(entry, t) && ` — ${seriesLine(entry, t)}`}</span>
          </p>
        ) : (
          <>
            <p className={cn('truncate', title)} title={bookTooltip(entry)}>
              {entry.title}
            </p>
            {view === 'full' ? <EntryMetadata entry={entry} /> : <p className="truncate text-xs">{seriesLine(entry, t)}</p>}
            <p className="text-xs text-muted-foreground">{status.filter(Boolean).join(' · ')}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** "Series · Vol. 3": what the medium and compact views show under or next to the title. */
function seriesLine(entry: LibraryEntry, t: TFunction<['library', 'common']>): string {
  return [entry.series, entry.volume && t('volumeShort', { volume: entry.volume })].filter(Boolean).join(' · ');
}

/** Series, volume, date, language and credits found by a metadata lookup; nothing when there are none. */
function EntryMetadata({ entry }: { entry: LibraryEntry }) {
  const { t } = useTranslation(['library', 'common']);
  const series = seriesLine(entry, t);
  const languageName = formatLanguage(entry.language);
  const language = languageCountry(entry.language) ? (
    <span key="language" title={languageName ?? undefined}>
      <LanguageFlag code={entry.language} className="align-[-1px]" />
    </span>
  ) : (
    languageName
  );
  const details = [series, entry.releaseDate?.slice(0, 4), language].filter(Boolean);
  const credits = CREDIT_ROLES.flatMap((role) => {
    const people = entry.credits.filter((credit) => credit.role === role);
    return people.length > 0 ? [{ role, people }] : [];
  });
  if (details.length === 0 && credits.length === 0) return null;

  // The tooltip lists the credits as plain text; in the line itself each name links to the author's page.
  const tooltip = credits
    .map(({ role, people }) => t('common:labelValue', { label: creditRoleLabel(role), value: people.map(formatPersonName).join(', ') }))
    .join('\n');
  return (
    <p className="truncate text-xs" title={tooltip || undefined}>
      {details.flatMap((detail, index) => (index === 0 ? [detail] : [' · ', detail]))}
      {details.length > 0 && credits.length > 0 && ' — '}
      <span className="text-muted-foreground">
        {credits.map(({ role, people }, index) => (
          <span key={role}>
            {index > 0 && ' · '}
            {/* The label with an empty value: "Writer: ", the value (the names) always comes last. */}
            {t('common:labelValue', { label: creditRoleLabel(role), value: '' })}
            {people.map((person, i) => (
              <span key={`${person.personId}-${i}`}>
                {i > 0 && ', '}
                <AuthorLink person={person} />
              </span>
            ))}
          </span>
        ))}
      </span>
    </p>
  );
}

/** The book's rating as five stars; a click saves the new one (on the star already set, clears it). */
export function BookRating({ entry }: { entry: LibraryEntry }) {
  const { t } = useTranslation('library');
  const { id, rating } = entry;
  const rate = (value: number) =>
    // A refused write is rolled back by the store; nothing more to show here.
    void appData.patchEntry(id, { rating: value }, () => window.skeudenn.library.updateRating(id, value)).catch(() => undefined);
  return (
    <div
      role="group"
      aria-label={t('ratingLabel')}
      className="flex shrink-0 items-center gap-0.5"
      title={rating > 0 ? t('rating', { rating }) : t('notRated')}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => rate(value === rating ? 0 : value)}
          aria-label={t('rate', { count: value })}
          // Clicking the star that is set clears the rating, so only that one is "pressed".
          aria-pressed={value === rating}
          className="text-muted-foreground hover:text-yellow-500"
        >
          <Star className={cn('size-4', value <= rating && 'fill-yellow-400 text-yellow-500')} />
        </button>
      ))}
    </div>
  );
}

/** The book's tags: the quick tags as toggles, its own tags with a remove button, and a field to add one. */
export function BookTags({ entry }: { entry: LibraryEntry }) {
  const { t } = useTranslation('library');
  const [newTag, setNewTag] = useState('');
  const customTags = entry.tags.filter((tag) => !QUICK_TAGS.includes(tag));

  const toggle = (tag: string) => {
    const tags = toggleTag(entry.tags, tag);
    void appData
      .patchEntry(entry.id, { tags }, () => window.skeudenn.library.updateTags(entry.id, tags))
      .catch(() => undefined);
  };

  const addCustomTag = () => {
    const tag = newTag.trim();
    if (tag && !entry.tags.includes(tag)) toggle(tag);
    setNewTag('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {QUICK_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => toggle(tag)}
          aria-pressed={entry.tags.includes(tag)}
          aria-label={t('toggleTag', { tag: tagLabel(tag) })}
          className={cn(
            'rounded-full border px-2 py-0.5 text-xs',
            entry.tags.includes(tag)
              ? 'border-primary bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {tagLabel(tag)}
        </button>
      ))}
      {customTags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2 py-0.5 text-xs text-primary"
        >
          {tag}
          <button type="button" onClick={() => toggle(tag)} aria-label={t('removeTag', { tag })}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={newTag}
        onChange={(event) => setNewTag(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            addCustomTag();
          }
        }}
        placeholder={t('newTag')}
        aria-label={t('addTagLabel')}
        className="w-24 rounded-full border border-dashed bg-transparent px-2 py-0.5 text-xs outline-none focus:border-solid focus:border-primary"
      />
    </div>
  );
}
