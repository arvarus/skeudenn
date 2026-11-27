import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, GripVertical, Pencil, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfirm } from '@/components/confirm-dialog';
import { BookDetails, BookRating, BookTags, ViewModePicker } from '@/components/book-row';
import { ReadingListProgress } from '@/components/reading-list-progress';
import { Button } from '@/components/ui/button';
import { useLibrary } from '@/hooks/use-library';
import { useReadingLists } from '@/hooks/use-reading-lists';
import { useSettings } from '@/hooks/use-settings';
import { isFinished, listEntries, listProgress, moveUnfinished, nextToRead, tagLabel } from '@/lib/reading-list';
import { cn } from '@/lib/utils';
import { READ_TAG, type LibraryEntry } from '@/shared/library';
import { MAX_READING_LIST_SIZE, type ReadingListResult } from '@/shared/reading-list';

export const Route = createFileRoute('/lists/$listId')({
  component: ReadingListPage,
  // The router keeps the component mounted when only `listId` changes: remount it so the
  // rename, error and drag states (and a load in flight) of the previous list don't leak.
  remountDeps: ({ params }) => params,
});

function ReadingListPage() {
  const { listId } = Route.useParams();
  const { t } = useTranslation(['lists', 'common']);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const navigate = useNavigate();
  const lists = useReadingLists();
  const library = useLibrary();
  const { settings, update } = useSettings();
  const view = settings.readingListView;
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  // undefined while loading, null once the list turns out not to exist.
  const list = lists && library ? (lists.find((l) => l.id === listId) ?? null) : undefined;

  const entries = useMemo(() => (list && library ? listEntries(list, library) : []), [list, library]);
  const finished = useMemo(() => new Set(entries.filter(isFinished).map((entry) => entry.id)), [entries]);
  const next = nextToRead(entries);

  if (list === undefined) return null;
  if (list === null) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <BackLink />
        <p className="text-sm text-muted-foreground">{t('notFound')}</p>
      </div>
    );
  }

  const apply = (result: ReadingListResult) => {
    // The list itself comes back through the store, on the main process's `data:changed`.
    setError(result.status === 'error' ? result.message : null);
  };

  // Ids of the books actually shown: ids of entries gone from the library are left out.
  const order = entries.map((entry) => entry.id);

  const move = async (from: number, to: number) => {
    const reordered = moveUnfinished(order, finished, from, to);
    if (!reordered) return;
    // The ids missing from the library keep their place at the end; the repository wants them all.
    const missing = list.entryIds.filter((id) => !order.includes(id));
    apply(await window.skeudenn.readingLists.reorder(list.id, [...reordered, ...missing]));
  };

  /** The nearest unfinished book's index from `index` in direction `step`, for the arrow buttons. */
  const neighbour = (index: number, step: 1 | -1): number | null => {
    for (let i = index + step; i >= 0 && i < order.length; i += step) {
      if (!finished.has(order[i])) return i;
    }
    return null;
  };

  const rename = async () => {
    if (renaming === null) return;
    apply(await window.skeudenn.readingLists.rename(list.id, renaming));
    setRenaming(null);
  };

  const removeList = async () => {
    const confirmed = await confirm({
      title: t('confirmDeleteTitle'),
      message: t('confirmDelete', { name: list.name }),
      action: t('confirmDeleteAction'),
    });
    if (!confirmed) return;
    await window.skeudenn.readingLists.remove(list.id);
    void navigate({ to: '/lists' });
  };

  const read = (entry: LibraryEntry) => navigate({ to: '/reader', search: { book: entry.id, list: list.id } });

  return (
    <div className="flex flex-col gap-4 p-6">
      <BackLink />
      <div className="flex items-center gap-2">
        {renaming === null ? (
          <>
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{list.name}</h1>
            <Button variant="ghost" size="icon-sm" onClick={() => setRenaming(list.name)} title={t('renameList')}>
              <Pencil />
            </Button>
          </>
        ) : (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void rename();
            }}
          >
            <input
              autoFocus
              value={renaming}
              onChange={(event) => setRenaming(event.target.value)}
              onKeyDown={(event) => event.key === 'Escape' && setRenaming(null)}
              aria-label={t('listName')}
              className="h-9 max-w-md flex-1 rounded-md border bg-background px-3 text-lg font-semibold outline-none focus-visible:border-ring"
            />
            <Button type="submit" size="sm" disabled={renaming.trim() === ''}>
              {t('rename')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>
              {t('common:cancel')}
            </Button>
          </form>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void removeList()}>
          <Trash2 />
          {t('deleteList')}
        </Button>
      </div>

      <div className="max-w-xl">
        <ReadingListProgress progress={listProgress(entries)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t('count', { count: entries.length, max: MAX_READING_LIST_SIZE, readTag: tagLabel(READ_TAG) })}
        </p>
        {entries.length > 0 && <ViewModePicker
            view={view}
            onChange={(next) => next !== 'grid' && update('readingListView', next)}
          />}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('emptyDetail')}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-md border">
          {entries.map((entry, index) => {
            const done = finished.has(entry.id);
            const isNext = next?.id === entry.id;
            const up = done ? null : neighbour(index, -1);
            const down = done ? null : neighbour(index, 1);
            return (
              <li
                key={entry.id}
                onDragOver={(event) => {
                  // Only unfinished books are drop targets: finished ones keep their place.
                  if (dragged !== null && !done) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged !== null) void move(dragged, index);
                  setDragged(null);
                }}
                className={cn(
                  'flex flex-col gap-2 px-3',
                  view === 'compact' ? 'py-2' : 'py-3',
                  done && 'opacity-50',
                  isNext && 'bg-primary/5',
                  dragged === index && 'opacity-30',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  {done ? (
                    <Check className="size-4 shrink-0 text-muted-foreground" aria-label={tagLabel(READ_TAG)} />
                  ) : (
                    // Only the grip drags the book (the rest of the row opens it and holds the rating and
                    // tag field); the whole row is the drag image.
                    <div
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        const row = event.currentTarget.closest('li');
                        if (row) event.dataTransfer.setDragImage(row, 0, 0);
                        setDragged(index);
                      }}
                      onDragEnd={() => setDragged(null)}
                      className="-mx-1 shrink-0 cursor-grab rounded-sm px-1 py-2 text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
                      title={t('dragHint')}
                      aria-label={t('dragHandle', { title: entry.title })}
                    >
                      <GripVertical className="size-4" />
                    </div>
                  )}
                  <BookDetails
                    entry={entry}
                    view={view}
                    onOpen={() => void read(entry)}
                    progress={done ? tagLabel(READ_TAG) : undefined}
                    note={isNext ? t('upNextShort') : undefined}
                    finished={done}
                  />
                  {view !== 'compact' && <BookRating entry={entry} />}
                  {done ? (
                    // The arrows' room, so that the stars and buttons of a read book line up with the others.
                    <span className="w-19 shrink-0" aria-hidden />
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={up === null}
                        onClick={() => up !== null && void move(index, up)}
                        aria-label={t('moveUp')}
                        title={t('moveUp')}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={down === null}
                        onClick={() => down !== null && void move(index, down)}
                        aria-label={t('moveDown')}
                        title={t('moveDown')}
                      >
                        <ArrowDown />
                      </Button>
                    </>
                  )}
                  <Button variant={isNext ? 'default' : 'secondary'} size="sm" onClick={() => void read(entry)}>
                    {isNext && <BookOpen />}
                    {isNext ? t('read') : t('common:open')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => apply(await window.skeudenn.readingLists.removeEntry(list.id, entry.id))}
                    title={t('removeFromList')}
                    aria-label={t('removeFromList')}
                  >
                    <X />
                  </Button>
                </div>
                {view === 'full' && <BookTags entry={entry} />}
              </li>
            );
          })}
        </ol>
      )}
      {confirmDialog}
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation('lists');
  return (
    <Link to="/lists" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      {t('title')}
    </Link>
  );
}
