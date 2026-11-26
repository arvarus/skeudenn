import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Loader2,
  Minus,
  Plus,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BookPageCounter } from '@/components/reader/book-page-counter';
import { BookSlider } from '@/components/reader/book-slider';
import { FullscreenButton } from '@/components/reader/fullscreen-button';
import { NextInListButton } from '@/components/reader/next-in-list-button';
import { ReaderHeader } from '@/components/reader/reader-header';
import { ReadingModeButton } from '@/components/reader/reading-mode-button';
import { ReadingProgress } from '@/components/reader/reading-progress';
import { ZoomSelect } from '@/components/reader/zoom-select';
import { Button } from '@/components/ui/button';
import type { NextInList } from '@/hooks/use-next-in-list';
import { usePageImages } from '@/hooks/use-page-images';
import { useReaderControls } from '@/hooks/use-reader-controls';
import { useReadingPace } from '@/hooks/use-reading-pace';
import {
  blockCount,
  blockIndexOf,
  blockPages,
  cellsSize,
  highestPage,
  isLandscapeSize,
  pageAfter,
  pageBefore,
  pagesLabel,
  spreadCells,
  spreadEnds,
  spreadOf,
  spreadPlacements,
} from '@/lib/book-spreads';
import { bookTooltip } from '@/lib/book-tooltip';
import { bookKeyAction, directionalControls, disabledAtEnds } from '@/lib/reader-navigation';
import { fitScale, stepZoom, zoomScale, type Size, type Zoom } from '@/lib/reader-zoom';
import { cn } from '@/lib/utils';
import type { ComicInfo } from '@/shared/comic';
import type { PublicSettings } from '@/shared/settings';

/** The size assumed for a page nobody has seen yet (an unreadable one beside nothing): a 2:3 portrait. */
const DEFAULT_PAGE_SIZE: Size = { width: 800, height: 1200 };

interface BookReaderProps {
  comic: ComicInfo;
  /** The page to open at: the spread holding it is shown first. */
  startPage: number;
  settings: PublicSettings;
  pickAndOpen: () => void;
  close: () => void;
  /** Called with the highest page of the spread each time a spread is shown: the progress to save. */
  onActivePage: (index: number) => void;
  /** Opens the book again at a page: the way out of a page that failed to load. */
  onRetry: (page: number) => void;
  /** Switches to page-by-page reading, at a page (the highest of the spread shown). */
  onSwitchToSingle: (page: number) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  nextInList: NextInList | null;
}

/** A round button of the sides of the page area. */
function SideButton({
  label,
  icon: Icon,
  disabled,
  onClick,
  large,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-25 disabled:hover:bg-white/15',
        large ? 'size-12' : 'size-8',
      )}
    >
      <Icon className={large ? 'size-7' : 'size-4'} />
    </button>
  );
}

/** One side of the page area: the round turn button, with the first/last button under it. */
function SideColumn({ children }: { children: ReactNode }) {
  return <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-3">{children}</div>;
}

/**
 * The book reading mode: two pages side by side like an open book, a spread at a time. The pairing
 * rules are in `src/lib/book-spreads.ts`; the reader decodes both pages of a spread before laying it
 * out (it needs their sizes, and to know whether one is landscape) and prefetches the neighbouring
 * spreads. It loads its own pages, which is why the route passes `loadPages: false` to `useComic`.
 */
export function BookReader({
  comic,
  startPage,
  settings,
  pickAndOpen,
  close,
  onActivePage,
  onRetry,
  onSwitchToSingle,
  fullscreen,
  toggleFullscreen,
  nextInList,
}: BookReaderProps) {
  const { t } = useTranslation(['reader', 'common']);
  const { pageCount } = comic;
  const { readingDirection: direction, bookCoverAlone: coverAlone } = settings;
  // A page of the spread being shown; the spread itself is derived from it once its pages are decoded.
  const [target, setTarget] = useState(() => Math.min(Math.max(startPage, 0), Math.max(pageCount - 1, 0)));
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const block = blockIndexOf(target, coverAlone);
  const wanted = blockPages(block, pageCount, coverAlone);
  const prefetch = [...blockPages(block + 1, pageCount, coverAlone), ...blockPages(block - 1, pageCount, coverAlone)];
  const { images, failed } = usePageImages(comic.id, wanted, prefetch, onRetry);

  const settled = wanted.every((page) => images.has(page) || failed.has(page));
  const isLandscape = (page: number) => {
    const image = images.get(page);
    return image !== undefined && isLandscapeSize(image);
  };
  const spread = settled ? spreadOf(target, pageCount, coverAlone, isLandscape) : null;
  const ends = spreadEnds(spread ?? wanted, pageCount);
  const highest = spread ? highestPage(spread) : null;

  // The progress saved is the highest page of the spread, so the last spread marks the last page
  // reached (and the book as read) as in the other modes.
  const onActivePageRef = useRef(onActivePage);
  useEffect(() => {
    onActivePageRef.current = onActivePage;
  });
  useEffect(() => {
    if (highest !== null) onActivePageRef.current(highest);
  }, [highest]);

  // Pages count two by two here: the pace follows the highest page of the spread.
  const { percent, remainingMinutes } = useReadingPace(comic.id, pageCount, highest ?? highestPage(wanted));

  const goNext = () => {
    const page = spread && pageAfter(spread, pageCount);
    if (page !== null && page !== undefined) setTarget(page);
  };
  const goPrevious = () => {
    const page = spread && pageBefore(spread);
    if (page !== null && page !== undefined) setTarget(page);
  };
  const goFirst = () => setTarget(0);
  const goLast = () => setTarget(pageCount - 1);
  const goToPage = (page: number) => setTarget(Math.min(Math.max(page, 0), pageCount - 1));
  // In right-to-left (manga) reading order, the physical left/right controls swap.
  const { advance, retreat } = directionalControls(direction, goNext, goPrevious);
  const { isPrevDisabled, isNextDisabled } = disabledAtEnds(direction, ends.isFirst, ends.isLast);
  const rtl = direction === 'rtl';

  // Layout: the pages at one common scale, so their relative sizes are kept.
  const loaded = wanted.map((page) => images.get(page)).find((image) => image !== undefined);
  const sizeOf = (page: number): Size => images.get(page) ?? loaded ?? DEFAULT_PAGE_SIZE;
  const placements = spread ? spreadPlacements(spread, coverAlone, direction, isLandscape) : [];
  const cells = spread ? spreadCells(placements, sizeOf) : [];
  const natural = cellsSize(cells);
  const scale = spread ? zoomScale(zoom, containerSize, natural) : 1;
  const fit = spread && containerSize ? fitScale(containerSize, natural) : null;
  const sideOf = (page: number) => placements.find((placement) => placement.page === page)?.side;

  useReaderControls({
    containerRef,
    advance,
    retreat,
    scrollDirection: settings.scrollDirection,
    zoomed: zoom !== 'fit',
    position: { bookId: comic.id, page: target },
    ready: spread ? spread.join(',') : null,
  });

  // Keys that only this mode has: first/last page and zoom steps.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = bookKeyAction(event);
      if (action === null) return;
      event.preventDefault();
      if (action === 'first') setTarget(0);
      else if (action === 'last') setTarget(pageCount - 1);
      else setZoom((current) => stepZoom(current, action === 'zoomIn' ? 1 : -1, fit));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fit, pageCount]);

  const blocks = blockCount(pageCount, coverAlone);
  const labelOfBlock = useCallback(
    (index: number) => pagesLabel(blockPages(index, pageCount, coverAlone)),
    [pageCount, coverAlone],
  );
  const retryPage = spread ? spread[0] : target;

  return (
    <div className="relative flex h-full flex-col" style={{ backgroundColor: settings.readerBackground }}>
      <ReaderHeader fullscreen={fullscreen}>
        <span className="truncate font-medium" title={bookTooltip(comic)}>
          {comic.title}
        </span>
        <BookPageCounter label={pagesLabel(spread ?? [target])} pageCount={pageCount} onGoTo={goToPage} />
        <ReadingProgress percent={percent} remainingMinutes={remainingMinutes} />
        {ends.isLast && spread && <NextInListButton nextInList={nextInList} />}
        <ZoomSelect value={zoom} onChange={setZoom} />
        <ReadingModeButton mode="book" onClick={() => onSwitchToSingle(highest ?? highestPage(wanted))} />
        <Button variant="ghost" size="icon-sm" onClick={pickAndOpen} title={t('openAnother')}>
          <FolderOpen />
        </Button>
        <FullscreenButton fullscreen={fullscreen} toggle={toggleFullscreen} />
        <Button variant="ghost" size="icon-sm" onClick={close} title={t('close')}>
          <X />
        </Button>
      </ReaderHeader>

      <div className="flex min-h-0 flex-1">
        <SideColumn>
          <SideButton
            large
            label={rtl ? t('nextSpread') : t('previousSpread')}
            icon={ChevronLeft}
            disabled={isPrevDisabled}
            onClick={retreat}
          />
          <SideButton
            label={rtl ? t('lastPage') : t('firstPage')}
            icon={rtl ? ChevronLast : ChevronFirst}
            disabled={isPrevDisabled}
            onClick={rtl ? goLast : goFirst}
          />
        </SideColumn>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div ref={containerRef} role="region" aria-label={t('pages')} className="flex min-h-0 flex-1 overflow-auto">
            {spread ? (
              <div
                className="relative m-auto flex shrink-0 items-center"
                style={{ width: Math.floor(natural.width * scale), height: Math.floor(natural.height * scale) }}
              >
                {cells.map((cell, index) => {
                  const style = { width: Math.floor(cell.width * scale), height: Math.floor(cell.height * scale) };
                  if (cell.page === null) return <div key={`empty-${index}`} style={style} />;
                  const page = cell.page;
                  const image = images.get(page);
                  if (!image) {
                    return (
                      <div
                        key={page}
                        style={style}
                        className="flex flex-col items-center justify-center gap-2 text-sm text-neutral-500"
                      >
                        <span>{t('pageUnreadable')}</span>
                        <Button variant="outline" size="sm" onClick={() => onRetry(retryPage)}>
                          {t('retry')}
                        </Button>
                      </div>
                    );
                  }
                  return (
                    <img
                      key={page}
                      src={image.url}
                      alt={t('pageAlt', { page: page + 1 })}
                      data-side={sideOf(page)}
                      draggable={false}
                      className="block max-w-none shrink-0"
                      style={style}
                    />
                  );
                })}
                {cells.length === 2 && (
                  <div
                    aria-hidden="true"
                    data-testid="spine"
                    className="pointer-events-none absolute inset-y-0 w-8 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/40 to-transparent"
                    style={{ left: Math.floor(cells[0].width * scale) }}
                  />
                )}
              </div>
            ) : (
              <p className="m-auto flex items-center gap-2 text-neutral-500">
                <Loader2 className="size-5 animate-spin" />
                {t('common:loading')}
              </p>
            )}
          </div>

          <div className="absolute bottom-3 right-3 flex gap-1.5">
            <SideButton
              label={t('zoomOut')}
              icon={Minus}
              disabled={stepZoom(zoom, -1, fit) === zoom}
              onClick={() => setZoom((current) => stepZoom(current, -1, fit))}
            />
            <SideButton
              label={t('zoomIn')}
              icon={Plus}
              disabled={stepZoom(zoom, 1, fit) === zoom}
              onClick={() => setZoom((current) => stepZoom(current, 1, fit))}
            />
          </div>
        </div>

        <SideColumn>
          <SideButton
            large
            label={rtl ? t('previousSpread') : t('nextSpread')}
            icon={ChevronRight}
            disabled={isNextDisabled}
            onClick={advance}
          />
          <SideButton
            label={rtl ? t('firstPage') : t('lastPage')}
            icon={rtl ? ChevronFirst : ChevronLast}
            disabled={isNextDisabled}
            onClick={rtl ? goFirst : goLast}
          />
        </SideColumn>
      </div>

      <div
        className={cn(
          'flex items-center gap-3 border-t border-white/10 bg-black px-4 py-3 text-white',
          fullscreen &&
            'absolute inset-x-0 bottom-0 z-10 bg-black/80 opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100',
        )}
      >
        <BookSlider
          blockCount={blocks}
          block={block}
          direction={direction}
          labelOf={labelOfBlock}
          onJump={(index) => setTarget(blockPages(index, pageCount, coverAlone)[0] ?? 0)}
        />
      </div>
    </div>
  );
}
