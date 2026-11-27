import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FolderOpen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfirm } from '@/components/confirm-dialog';
import { BookReader } from '@/components/reader/book-reader';
import { ContinuousReader } from '@/components/reader/continuous-reader';
import { SinglePageReader } from '@/components/reader/single-page-reader';
import { Button } from '@/components/ui/button';
import { useOpeningAchievements } from '@/hooks/use-achievements';
import { useComic } from '@/hooks/use-comic';
import { useLibrary } from '@/hooks/use-library';
import { useNextInList } from '@/hooks/use-next-in-list';
import { useReaderFullscreen } from '@/hooks/use-reader-fullscreen';
import { useReadingTime } from '@/hooks/use-reading-time';
import { useSettings } from '@/hooks/use-settings';

interface ReaderSearch {
  /** Library entry id, or file-dialog token, of a comic to open automatically, e.g. from the library page. */
  book?: string;
  /** Id of the reading list the comic was opened from: its next book is offered on the last page. */
  list?: string;
}

export const Route = createFileRoute('/reader')({
  validateSearch: (search: Record<string, unknown>): ReaderSearch => ({
    book: typeof search.book === 'string' ? search.book : undefined,
    list: typeof search.list === 'string' ? search.list : undefined,
  }),
  component: ReaderPage,
});

function ReaderPage() {
  const { book, list } = Route.useSearch();
  const { t } = useTranslation('reader');
  const { t: tLibrary } = useTranslation('library');
  const { settings, update } = useSettings();
  const library = useLibrary();
  const navigate = useNavigate();
  const { confirmWithChoice, dialog: confirmDialog } = useConfirm();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { comic, page, pageUrl, pageKey, error, loading, pickAndOpen, openFile, reopen, close: closeComic, goTo, next, prev } = useComic({
    // The continuous and book readers load their own pages.
    loadPages: settings.readingMode === 'single',
  });
  const { fullscreen, toggle: toggleFullscreen } = useReaderFullscreen(comic !== null);
  const nextInList = useNextInList(list, comic?.libraryId ?? undefined);
  useOpeningAchievements(comic?.id ?? null);
  useReadingTime(comic?.libraryId ?? null);

  // A book opened from the library (or a list) goes back there once closed, instead of leaving an empty reader.
  const close = useCallback(() => {
    void closeComic();
    if (!book) return;
    if (list) void navigate({ to: '/lists/$listId', params: { listId: list } });
    else void navigate({ to: '/library' });
  }, [closeComic, book, list, navigate]);

  useEffect(() => {
    if (book) void openFile(book);
  }, [book, openFile]);

  // Continuous and book modes don't drive `page`/`goTo` (that would also re-trigger useComic's
  // own single-page fetch for no reason); it persists progress directly instead.
  const persistProgress = useCallback(
    (index: number) => {
      if (!comic?.libraryId) return;
      void window.skeudenn.library.updateProgress(comic.libraryId, index);
    },
    [comic],
  );

  // The header button of the page-by-page and book readers: the book reader reports the page it is
  // at, so the page-by-page one opens on it; the other way round it is `page` that the book reader opens at.
  const switchToSingle = useCallback(
    (at: number) => {
      goTo(at);
      update('readingMode', 'single');
    },
    [goTo, update],
  );
  const switchToBook = useCallback(() => update('readingMode', 'book'), [update]);

  // A library book that fails to open (missing, corrupted, unsupported) can be dropped from the library.
  const failedEntry = !comic && error && book ? library?.find((entry) => entry.id === book) : undefined;

  const removeFailedEntry = async () => {
    if (!failedEntry) return;
    const { confirmed, checked } = await confirmWithChoice({
      title: tLibrary('confirmRemoveTitle'),
      message: tLibrary('confirmRemove', { title: failedEntry.title }),
      action: tLibrary('confirmRemoveAction'),
      checkbox: tLibrary('deleteFile'),
    });
    if (!confirmed) return;
    const result = await window.skeudenn.library.remove(failedEntry.id, checked);
    // The entry is gone either way; a file that stays in the trash-less case is reported, the page stays to show it.
    if (result.status === 'error') setRemoveError(result.message);
    else void navigate({ to: '/library' });
  };

  if (!comic) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('intro')}</p>
        <Button onClick={pickAndOpen} disabled={loading}>
          <FolderOpen />
          {t('openFile')}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {removeError && <p className="text-sm text-destructive">{removeError}</p>}
        {failedEntry && (
          <Button variant="outline" onClick={removeFailedEntry}>
            <Trash2 />
            {t('removeFromLibrary')}
          </Button>
        )}
        {confirmDialog}
      </div>
    );
  }

  if (settings.readingMode === 'continuous') {
    return (
      <ContinuousReader
        key={comic.id}
        comic={comic}
        spacing={settings.pageSpacing}
        pickAndOpen={pickAndOpen}
        close={close}
        onActivePage={persistProgress}
        onRetry={reopen}
        fullscreen={fullscreen}
        toggleFullscreen={toggleFullscreen}
        background={settings.readerBackground}
        nextInList={nextInList}
      />
    );
  }

  if (settings.readingMode === 'book') {
    return (
      <BookReader
        key={comic.id}
        comic={comic}
        startPage={page}
        settings={settings}
        pickAndOpen={pickAndOpen}
        close={close}
        onActivePage={persistProgress}
        onRetry={reopen}
        onSwitchToSingle={switchToSingle}
        fullscreen={fullscreen}
        toggleFullscreen={toggleFullscreen}
        nextInList={nextInList}
      />
    );
  }

  return (
    <SinglePageReader
      comic={comic}
      page={page}
      pageUrl={pageUrl}
      pageKey={pageKey}
      error={error}
      loading={loading}
      pickAndOpen={pickAndOpen}
      close={close}
      next={next}
      prev={prev}
      settings={settings}
      fullscreen={fullscreen}
      toggleFullscreen={toggleFullscreen}
      nextInList={nextInList}
      onSwitchToBook={switchToBook}
    />
  );
}
