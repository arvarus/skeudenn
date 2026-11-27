import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useLibrary } from '@/hooks/use-library';
import { useReadingLists } from '@/hooks/use-reading-lists';
import { bulkAddFeedback, bulkAddRequest, seriesEntries, type DropFeedback } from '@/lib/reading-list';
import { cn } from '@/lib/utils';
import type { LibraryEntry } from '@/shared/library';
import { MAX_READING_LIST_SIZE, type ReadingList, type ReadingListResult } from '@/shared/reading-list';

/**
 * Puts library entries in reading lists. With one book: one checkbox per list to put it in or
 * take it out, and, when the book belongs to a series of several books in the library, the
 * choice of adding the whole series instead. With several books (the library page's selection,
 * or a series): each list adds the ones it doesn't hold yet, in order, as far as it has room;
 * a list holding them all is checked. A field creates a new list that the book(s) go straight
 * into. Changes are saved as they're made.
 */
export function AddToListDialog({ entries, onClose }: { entries: LibraryEntry[]; onClose: () => void }) {
  const { t } = useTranslation(['lists', 'common']);
  const lists = useReadingLists();
  const library = useLibrary();
  const [newName, setNewName] = useState('');
  const [feedback, setFeedback] = useState<DropFeedback | null>(null);
  const [wholeSeries, setWholeSeries] = useState(false);

  const single = entries.length === 1 ? entries[0] : null;
  const series = single && library ? seriesEntries(single, library) : [];
  const offerSeries = single !== null && series.length > 1;
  const books = offerSeries && wholeSeries ? series : entries;
  const ids = books.map((book) => book.id);

  const apply = (result: ReadingListResult): ReadingList | null => {
    if (result.status === 'error') {
      setFeedback({ message: result.message, error: true });
      return null;
    }
    setFeedback(null);
    return result.list;
  };

  const addAll = async (list: ReadingList) => {
    const request = bulkAddRequest(list, ids);
    const result = request.ids.length > 0 ? await window.skeudenn.readingLists.addEntries(list.id, request.ids) : null;
    setFeedback(bulkAddFeedback(list, request, result));
  };

  const toggle = async (list: ReadingList) => {
    if (books.length > 1) {
      await addAll(list);
      return;
    }
    const [book] = books;
    apply(
      list.entryIds.includes(book.id)
        ? await window.skeudenn.readingLists.removeEntry(list.id, book.id)
        : await window.skeudenn.readingLists.addEntry(list.id, book.id),
    );
  };

  const create = async () => {
    const created = apply(await window.skeudenn.readingLists.create(newName));
    if (!created) return;
    setNewName('');
    if (books.length > 1) await addAll(created);
    else apply(await window.skeudenn.readingLists.addEntry(created.id, books[0].id));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={single ? single.title : t('selectedBooks', { count: entries.length })}
      className="max-w-md"
    >
      {offerSeries && (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="sr-only">{t('addWhat')}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="add-what" checked={!wholeSeries} onChange={() => setWholeSeries(false)} />
            {t('thisBook')}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="add-what" checked={wholeSeries} onChange={() => setWholeSeries(true)} />
            <span className="truncate">{t('wholeSeries', { series: single?.series, count: series.length })}</span>
          </label>
        </fieldset>
      )}

      {lists === null ? (
        <p className="text-sm text-muted-foreground">{t('common:loading')}</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('emptyInDialog')}</p>
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {lists.map((list) => {
            const held = ids.filter((id) => list.entryIds.includes(id)).length;
            const included = held === ids.length;
            const full = !included && list.entryIds.length >= MAX_READING_LIST_SIZE;
            // A group already wholly in the list can't be taken out at once: the list page does that.
            const locked = full || (books.length > 1 && included);
            return (
              <li key={list.id}>
                <label
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
                    full && 'opacity-50',
                  )}
                  title={full ? t('full', { max: MAX_READING_LIST_SIZE }) : undefined}
                >
                  <input
                    type="checkbox"
                    checked={included}
                    ref={(input) => {
                      if (input) input.indeterminate = held > 0 && !included;
                    }}
                    disabled={locked}
                    onChange={() => void toggle(list)}
                  />
                  <span className="flex-1 truncate">{list.name}</span>
                  {books.length > 1 && held > 0 && !included && (
                    <span className="text-xs text-muted-foreground">{t('someAlreadyIn', { count: held, total: ids.length })}</span>
                  )}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {list.entryIds.length} / {MAX_READING_LIST_SIZE}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder={t('newListPlaceholder')}
          aria-label={t('newListName')}
          className="h-8 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring"
        />
        <Button type="submit" size="sm" disabled={newName.trim() === ''}>
          <Plus />
          {t('createAndAdd')}
        </Button>
      </form>

      {feedback && (
        <p role="status" className={cn('text-sm', feedback.error ? 'text-destructive' : 'text-muted-foreground')}>
          {feedback.message}
        </p>
      )}
    </Dialog>
  );
}
