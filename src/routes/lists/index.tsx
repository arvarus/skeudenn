import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfirm } from '@/components/confirm-dialog';
import { ReadingListProgress } from '@/components/reading-list-progress';
import { Button } from '@/components/ui/button';
import { useLibrary } from '@/hooks/use-library';
import { useReadingLists } from '@/hooks/use-reading-lists';
import { listEntries, listProgress, nextToRead } from '@/lib/reading-list';
import { MAX_READING_LIST_SIZE, type ReadingList } from '@/shared/reading-list';

export const Route = createFileRoute('/lists/')({
  component: ReadingListsPage,
});

function ReadingListsPage() {
  const { t } = useTranslation('lists');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const navigate = useNavigate();
  const lists = useReadingLists();
  const library = useLibrary();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const result = await window.skeudenn.readingLists.create(newName);
    if (result.status === 'error') {
      setError(result.message);
      return;
    }
    setError(null);
    setNewName('');
  };

  const remove = async (list: ReadingList) => {
    const confirmed = await confirm({
      title: t('confirmDeleteTitle'),
      message: t('confirmDelete', { name: list.name }),
      action: t('confirmDeleteAction'),
    });
    if (!confirmed) return;
    await window.skeudenn.readingLists.remove(list.id);
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('intro', { max: MAX_READING_LIST_SIZE })}</p>

      <form
        className="flex max-w-md items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder={t('newListName')}
          aria-label={t('newListName')}
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <Button type="submit" disabled={newName.trim() === ''}>
          <Plus />
          {t('create')}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {lists === null || library === null ? null : lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((list) => {
            const entries = listEntries(list, library);
            const next = nextToRead(entries);
            return (
              <li key={list.id} className="flex flex-col gap-3 rounded-md border p-4">
                <div className="flex items-start gap-2">
                  <Link
                    to="/lists/$listId"
                    params={{ listId: list.id }}
                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                  >
                    {list.name}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void remove(list)}
                    title={t('deleteList')}
                    aria-label={t('deleteListNamed', { name: list.name })}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <ReadingListProgress progress={listProgress(entries)} />
                {next ? (
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm" title={next.title}>
                      <span className="text-muted-foreground">{t('upNext')}</span>
                      {next.title}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => navigate({ to: '/reader', search: { book: next.id, list: list.id } })}
                    >
                      <BookOpen />
                      {t('read')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {entries.length === 0 ? t('listEmpty') : t('listFinished')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmDialog}
    </div>
  );
}
