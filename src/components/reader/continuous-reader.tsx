import { FolderOpen, X, ZoomIn } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { bookTooltip } from '@/lib/book-tooltip';
import { ContinuousPage } from '@/components/reader/continuous-page';
import { FullscreenButton } from '@/components/reader/fullscreen-button';
import { NextInListButton } from '@/components/reader/next-in-list-button';
import { ReaderHeader } from '@/components/reader/reader-header';
import { ReadingProgress } from '@/components/reader/reading-progress';
import { Button } from '@/components/ui/button';
import type { NextInList } from '@/hooks/use-next-in-list';
import { useReadingPace } from '@/hooks/use-reading-pace';
import { useResumeScroll } from '@/hooks/use-resume-scroll';
import { createTrailingDebounce, type TrailingDebounce } from '@/lib/trailing-debounce';
import type { ComicInfo } from '@/shared/comic';

/** Width of the page column as a fraction of the reading area; 1 fits the pages to its width. */
const WIDTH_OPTIONS: Width[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 'actual'];

/** A width option: a fraction of the reading area, or `actual` for the pages' own size (1 image pixel = 1 screen pixel). */
type Width = number | 'actual';

interface ContinuousReaderProps {
  comic: ComicInfo;
  spacing: number;
  pickAndOpen: () => void;
  close: () => void;
  onActivePage: (index: number) => void;
  /** Opens the book again at a page: the way out of a page that failed to load. */
  onRetry: (page: number) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  background: string;
  nextInList: NextInList | null;
}

export function ContinuousReader({
  comic,
  spacing,
  pickAndOpen,
  close,
  onActivePage,
  onRetry,
  fullscreen,
  toggleFullscreen,
  background,
  nextInList,
}: ContinuousReaderProps) {
  const { t } = useTranslation('reader');
  const [visiblePage, setVisiblePage] = useState(comic.resumePage);
  const onActivePageRef = useRef(onActivePage);
  useEffect(() => {
    onActivePageRef.current = onActivePage;
  });
  // Progress is saved 400 ms after the page stops changing, and at once when the reader goes away:
  // closing within 400 ms of reaching the last page must still record it (and the book as finished).
  const saveProgress = useRef<TrailingDebounce<number> | null>(null);
  useEffect(() => {
    const saver = createTrailingDebounce<number>((index) => onActivePageRef.current(index), 400);
    saveProgress.current = saver;
    return () => {
      saver.flush();
      saveProgress.current = null;
    };
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Width>(1);
  const scrollRatio = useRef<{ top: number; left: number } | null>(null);

  // Resizing the column changes every page's height: keep the same relative position, so
  // the reader stays on the page being read instead of landing somewhere else in the book.
  const changeZoom = (value: Width) => {
    const el = scrollRef.current;
    if (el) {
      scrollRatio.current = {
        top: el.scrollTop / Math.max(el.scrollHeight, 1),
        left: el.scrollLeft / Math.max(el.scrollWidth, 1),
      };
    }
    setZoom(value);
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const ratio = scrollRatio.current;
    if (!el || !ratio) return;
    scrollRatio.current = null;
    el.scrollTop = ratio.top * el.scrollHeight;
    el.scrollLeft = ratio.left * el.scrollWidth;
  }, [zoom]);

  const pinnedRef = useResumeScroll(scrollRef, columnRef, comic.resumePage);

  const handleActive = useCallback(
    (index: number) => {
      setVisiblePage(index);
      saveProgress.current?.schedule(index);
    },
    [],
  );

  const { percent, remainingMinutes } = useReadingPace(comic.id, comic.pageCount, visiblePage);

  return (
    <div className="relative flex h-full flex-col" style={{ backgroundColor: background }}>
      <ReaderHeader fullscreen={fullscreen}>
        <span className="truncate font-medium" title={bookTooltip(comic)}>
          {comic.title}
        </span>
        <span className="ml-auto tabular-nums text-white/60">
          {visiblePage + 1} / {comic.pageCount}
        </span>
        <ReadingProgress percent={percent} remainingMinutes={remainingMinutes} />
        {visiblePage === comic.pageCount - 1 && <NextInListButton nextInList={nextInList} />}
        <label className="flex items-center gap-1.5 text-white/60">
          <ZoomIn className="size-4" />
          <span className="sr-only">{t('zoom')}</span>
          <select
            value={String(zoom)}
            onChange={(event) => changeZoom(event.target.value === 'actual' ? 'actual' : Number(event.target.value))}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white [color-scheme:dark]"
          >
            {WIDTH_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-neutral-900 text-white">
                {option === 'actual'
                  ? t('zoomActual')
                  : option === 1
                    ? t('zoomFitWidth')
                    : t('zoomPercent', { percent: Math.round(option * 100) })}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" size="icon-sm" onClick={pickAndOpen} title={t('openAnother')}>
          <FolderOpen />
        </Button>
        <FullscreenButton fullscreen={fullscreen} toggle={toggleFullscreen} />
        <Button variant="ghost" size="icon-sm" onClick={close} title={t('close')}>
          <X />
        </Button>
      </ReaderHeader>

      <div ref={scrollRef} role="region" aria-label={t('pages')} className="min-h-0 flex-1 overflow-auto [overflow-anchor:none]">
        <div ref={columnRef} className="mx-auto flex flex-col items-center" style={{ rowGap: spacing, width: zoom === 'actual' ? 'max-content' : `${zoom * 100}%` }}>
          {Array.from({ length: comic.pageCount }, (_, index) => (
            <ContinuousPage key={index} comicId={comic.id} index={index} onActive={handleActive} onRetry={() => onRetry(visiblePage)} actualSize={zoom === 'actual'} scrollRef={scrollRef} pinnedRef={pinnedRef} />
          ))}
        </div>
      </div>
    </div>
  );
}
