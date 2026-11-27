import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDown, List, ListOrdered } from 'lucide-react';
import { type DragEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useReadingLists } from '@/hooks/use-reading-lists';
import {
  bulkAddFeedback,
  bulkAddRequest,
  decodeDraggedEntries,
  dropFeedback,
  type DropFeedback,
  LIBRARY_ENTRY_DRAG_TYPE,
  moveItem,
} from '@/lib/reading-list';
import { cn } from '@/lib/utils';
import type { ReadingList } from '@/shared/reading-list';

import { activeLinkClass, linkClass, subLinkClass } from './sidebar-styles';

/**
 * "Reading lists" with each list underneath, for direct access. Unlike "Settings", the entry
 * has its own page (every list's progress), so its label always navigates there, unfolding the
 * lists on the way; only the chevron folds them back. The lists can be reordered by dragging
 * them, which sets their order everywhere they are shown. A book dragged from the library page
 * and dropped on a list is added to it (dragging it over the entry unfolds the lists).
 */
export function ReadingListsNav({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation(['nav', 'lists']);
  const onLists = useRouterState({
    select: (state) => state.location.pathname.startsWith('/lists'),
  });
  const lists = useReadingLists();
  // Starts unfolded when the app is already on a list page (e.g. after a reload).
  const [open, setOpen] = useState(onLists);
  const unfolded = open && !collapsed;
  // Index of the list being dragged, and of the one under the pointer (where it would land).
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // Id of the list a library book is dragged over, and the message about the last book dropped.
  const [bookOver, setBookOver] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DropFeedback | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  // During a drag only the data's types can be read, not the data itself.
  const isBookDrag = (event: DragEvent) => event.dataTransfer.types.includes(LIBRARY_ENTRY_DRAG_TYPE);

  const dropBook = async (list: ReadingList, data: string) => {
    setBookOver(null);
    const entries = decodeDraggedEntries(data);
    if (!entries) return;
    if (entries.length === 1) {
      const [entry] = entries;
      setFeedback(dropFeedback(list, entry, await window.skeudenn.readingLists.addEntry(list.id, entry.id)));
      return;
    }
    // Several books: the library page's selection, added like from the "add to a list" dialog.
    const request = bulkAddRequest(list, entries.map((entry) => entry.id));
    const result = request.ids.length > 0 ? await window.skeudenn.readingLists.addEntries(list.id, request.ids) : null;
    setFeedback(bulkAddFeedback(list, request, result));
  };

  const drop = async (to: number) => {
    const order = lists && dragged !== null ? moveItem(lists.map((list) => list.id), dragged, to) : null;
    setDragged(null);
    setOver(null);
    if (!order) return;
    // A refused (stale) order needs no message: reloading shows the lists as they are.
    await window.skeudenn.readingLists.reorderLists(order);
  };

  return (
    <>
      <div
        className={cn(linkClass(collapsed), 'p-0', onLists && activeLinkClass)}
        onDragEnter={(event) => {
          if (isBookDrag(event)) setOpen(true);
        }}
      >
        <Link
          to="/lists"
          className={cn('flex min-w-0 flex-1 items-center gap-2 py-1.5', collapsed ? 'justify-center px-2' : 'pl-2')}
          onClick={() => setOpen(true)}
          title={collapsed ? t('readingLists') : undefined}
        >
          <ListOrdered className="size-4" />
          {!collapsed && <span className="truncate">{t('readingLists')}</span>}
        </Link>
        {!collapsed && (
          <button
            type="button"
            className="self-stretch px-2"
            onClick={() => setOpen(!unfolded)}
            title={unfolded ? t('lists:hideLists') : t('lists:showLists')}
            aria-expanded={unfolded}
          >
            <ChevronDown className={cn('size-4 transition-transform', !unfolded && '-rotate-90')} />
          </button>
        )}
      </div>
      {unfolded &&
        lists !== null &&
        (lists.length === 0 ? (
          <p className="ml-4 px-2 py-1.5 text-xs text-muted-foreground">{t('lists:noLists')}</p>
        ) : (
          lists.map((list, index) => (
            <Link
              key={list.id}
              to="/lists/$listId"
              params={{ listId: list.id }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDragged(index);
              }}
              onDragEnd={() => {
                setDragged(null);
                setOver(null);
              }}
              onDragOver={(event) => {
                if (dragged !== null) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setOver(index);
                } else if (isBookDrag(event)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setBookOver(list.id);
                }
              }}
              onDragLeave={() => {
                if (bookOver === list.id) setBookOver(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged !== null) void drop(index);
                else if (isBookDrag(event)) void dropBook(list, event.dataTransfer.getData(LIBRARY_ENTRY_DRAG_TYPE));
              }}
              className={cn(
                subLinkClass,
                dragged === index && 'opacity-30',
                // A line on the side the dragged list would land: above when moving up, below when moving down.
                dragged !== null && over === index && dragged > index && 'shadow-[inset_0_2px_0_0_var(--color-primary)]',
                dragged !== null && over === index && dragged < index && 'shadow-[inset_0_-2px_0_0_var(--color-primary)]',
                bookOver === list.id && 'bg-primary/10 text-primary ring-1 ring-primary',
              )}
              activeProps={{ className: activeLinkClass }}
              title={list.name}
            >
              {/* No pointer events on the children: entering them would fire `dragleave` on the link. */}
              <List className="pointer-events-none size-3.5 shrink-0" />
              <span className="pointer-events-none truncate">{list.name}</span>
            </Link>
          ))
        ))}
      {unfolded && feedback && (
        <p role="status" className={cn('ml-4 px-2 py-1 text-xs', feedback.error ? 'text-destructive' : 'text-muted-foreground')}>
          {feedback.message}
        </p>
      )}
    </>
  );
}
