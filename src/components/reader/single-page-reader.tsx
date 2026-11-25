import { ChevronLeft, ChevronRight, FolderOpen, Loader2, X, ZoomIn } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { bookTooltip } from '@/lib/book-tooltip';
import { FullscreenButton } from '@/components/reader/fullscreen-button';
import { NextInListButton } from '@/components/reader/next-in-list-button';
import { ReaderHeader } from '@/components/reader/reader-header';
import { ReadingProgress } from '@/components/reader/reading-progress';
import { Button } from '@/components/ui/button';
import { useImageUpscaler } from '@/hooks/use-image-upscaler';
import type { NextInList } from '@/hooks/use-next-in-list';
import { useReadingPace } from '@/hooks/use-reading-pace';
import { directionalControls, disabledControls, pageTurnForKey, scrollEdgeAfterMove } from '@/lib/reader-navigation';
import { cn } from '@/lib/utils';
import { createWheelPager } from '@/lib/wheel-pager';
import type { ComicInfo } from '@/shared/comic';
import type { PublicSettings } from '@/shared/settings';

interface Size {
  width: number;
  height: number;
}

/** The size at which `natural` renders under `object-fit: contain` inside `container`. */
function fitSize(container: Size, natural: Size): Size {
  const containerRatio = container.width / container.height;
  const naturalRatio = natural.width / natural.height;
  return containerRatio > naturalRatio
    ? { width: container.height * naturalRatio, height: container.height }
    : { width: container.width, height: container.width / naturalRatio };
}

/** `'fit'` scales the page to the available area; a number is a fraction of its actual pixel size. */
type Zoom = 'fit' | number;

const ZOOM_OPTIONS: Zoom[] = ['fit', 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

interface SinglePageReaderProps {
  comic: ComicInfo;
  page: number;
  pageUrl: string | null;
  /** Names the page `pageUrl` shows, see `useComic`. */
  pageKey: string | null;
  error: string | null;
  loading: boolean;
  pickAndOpen: () => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  settings: PublicSettings;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  nextInList: NextInList | null;
}

export function SinglePageReader({
  comic,
  page,
  pageUrl,
  pageKey,
  error,
  loading,
  pickAndOpen,
  close,
  next,
  prev,
  settings,
  fullscreen,
  toggleFullscreen,
  nextInList,
}: SinglePageReaderProps) {
  const { t } = useTranslation(['reader', 'common']);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [upscaleEnabled, setUpscaleEnabled] = useState(false);
  const [naturalSizeState, setNaturalSizeState] = useState<{ src: string; size: Size } | null>(null);
  const naturalSize = naturalSizeState?.src === pageUrl ? naturalSizeState.size : null;
  const [containerSize, setContainerSize] = useState<Size | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // In right-to-left (manga) reading order, the physical left/right controls swap.
  const { advance, retreat } = directionalControls(settings.readingDirection, next, prev);
  const zoomFraction = zoom === 'fit' ? null : zoom;

  // Track the page's real pixel size, independent of whichever asset (original or
  // AI-upscaled) ends up on screen, so zoom math always refers to the original.
  // Keyed by src rather than reset-then-set, so a stale size never renders past a page change.
  useEffect(() => {
    if (!pageUrl) return;
    let cancelled = false;
    const probe = new Image();
    probe.src = pageUrl;
    probe
      .decode()
      .then(() => {
        if (!cancelled) {
          setNaturalSizeState({ src: pageUrl, size: { width: probe.naturalWidth, height: probe.naturalHeight } });
        }
      })
      .catch(() => {
        /* ignored: falls back to no upscaling if the size can't be read */
      });
    return () => {
      cancelled = true;
    };
  }, [pageUrl]);

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

  // After a page turn, a zoomed page starts at its top (forward) or bottom (backward) edge
  // instead of keeping the previous page's scroll position; another book opens at the top of its
  // page (the component isn't remounted per book, so the zoom stays). The new image only has its
  // size once decoded, so the edge is remembered here and applied when `naturalSize` arrives.
  const lastPosition = useRef({ bookId: comic.id, page });
  const pendingEdge = useRef<'top' | 'bottom' | null>(null);
  useEffect(() => {
    const position = { bookId: comic.id, page };
    const edge = scrollEdgeAfterMove(lastPosition.current, position);
    if (edge) {
      pendingEdge.current = edge;
      lastPosition.current = position;
    }
  }, [comic.id, page]);
  useLayoutEffect(() => {
    const el = containerRef.current;
    const edge = pendingEdge.current;
    if (!el || !naturalSize || !edge) return;
    pendingEdge.current = null;
    el.scrollTo({ top: edge === 'top' ? 0 : el.scrollHeight, left: 0 });
  }, [naturalSize]);

  // Wheel-to-turn-page: while zoomed in, a scroll that can still pan the image is left
  // alone; only once the pan hits the edge (or in "fit" mode, where there's no pan at
  // all) does the wheel turn the page. `createWheelPager` keeps one trackpad swipe (many
  // wheel events, plus the OS's inertia tail) to exactly one page turn. It lives in state,
  // not inside the effect: `advance`/`retreat` change identity on every render, so the
  // effect re-runs after each page turn and a fresh pager would forget the gesture in
  // progress — letting its inertia turn the page again.
  const [pager] = useState(createWheelPager);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const inverted = settings.scrollDirection === 'inverted';

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      // Fed even for events that only pan, so a swipe that pans up to the edge doesn't
      // then turn the page with its own inertia: that takes a new gesture.
      const step = pager(event.deltaY, event.timeStamp);

      if (zoomFraction !== null) {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) {
          return;
        }
      }

      event.preventDefault();
      if (step === 0) return;

      const goForward = inverted ? step < 0 : step > 0;
      if (goForward) advance();
      else retreat();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomFraction, settings.scrollDirection, advance, retreat, pager]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const turn = pageTurnForKey(event);
      if (turn === null) return;
      event.preventDefault();
      if (turn === 'advance') advance();
      else retreat();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, retreat]);

  const displaySize =
    naturalSize &&
    (zoomFraction === null
      ? containerSize && fitSize(containerSize, naturalSize)
      : { width: naturalSize.width * zoomFraction, height: naturalSize.height * zoomFraction });

  // The exact condition the zoom/upscale option targets: the page is being stretched
  // past its native resolution, so AI upscaling can genuinely add detail.
  const needsUpscale = !!(displaySize && naturalSize && displaySize.width > naturalSize.width + 0.5);

  const {
    upscaledUrl,
    isUpscaling,
    error: upscaleError,
  } = useImageUpscaler(pageUrl, upscaleEnabled && needsUpscale, pageKey);

  const { percent, remainingMinutes } = useReadingPace(comic.id, comic.pageCount, page);

  const isLast = page === comic.pageCount - 1;
  const { isPrevDisabled, isNextDisabled } = disabledControls(settings.readingDirection, page, comic.pageCount);
  const isFit = zoomFraction === null;
  const displayUrl = upscaledUrl ?? pageUrl;

  return (
    <div className="relative flex h-full flex-col" style={{ backgroundColor: settings.readerBackground }}>
      <ReaderHeader fullscreen={fullscreen}>
        <span className="truncate font-medium" title={bookTooltip(comic)}>
          {comic.title}
        </span>
        <span className="ml-auto tabular-nums text-white/60">
          {page + 1} / {comic.pageCount}
        </span>
        <ReadingProgress percent={percent} remainingMinutes={remainingMinutes} />
        {isLast && <NextInListButton nextInList={nextInList} />}
        <label className="flex items-center gap-1.5 text-white/60">
          <ZoomIn className="size-4" />
          <span className="sr-only">{t('zoom')}</span>
          <select
            value={String(zoom)}
            onChange={(event) => setZoom(event.target.value === 'fit' ? 'fit' : Number(event.target.value))}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white [color-scheme:dark]"
          >
            {ZOOM_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-neutral-900 text-white">
                {option === 'fit'
                  ? t('zoomFit')
                  : option === 1
                    ? t('zoomActual')
                    : t('zoomPercent', { percent: Math.round(option * 100) })}
              </option>
            ))}
          </select>
        </label>
        <label
          className={cn(
            'flex items-center gap-1.5',
            upscaleError ? 'text-destructive' : needsUpscale ? 'text-white/60' : 'text-white/30',
          )}
          title={
            upscaleError ?? t('upscaleHint')
          }
        >
          <input
            type="checkbox"
            checked={upscaleEnabled}
            disabled={!needsUpscale}
            onChange={(event) => setUpscaleEnabled(event.target.checked)}
          />
          {isUpscaling ? (
            <span className="flex items-center gap-1">
              <Loader2 className="size-3.5 animate-spin" />
              {t('upscaling')}
            </span>
          ) : upscaleError ? (
            t('upscaleUnavailable')
          ) : (
            t('upscale')
          )}
        </label>
        <Button variant="ghost" size="icon-sm" onClick={pickAndOpen} title={t('openAnother')}>
          <FolderOpen />
        </Button>
        <FullscreenButton fullscreen={fullscreen} toggle={toggleFullscreen} />
        <Button variant="ghost" size="icon-sm" onClick={close} title={t('close')}>
          <X />
        </Button>
      </ReaderHeader>

      <div
        ref={containerRef}
        className={cn(
          'relative flex min-h-0 flex-1',
          isFit ? 'items-center justify-center' : 'overflow-auto',
        )}
      >
        {pageUrl && (
          <img
            src={displayUrl ?? undefined}
            alt={t('pageAlt', { page: page + 1 })}
            draggable={false}
            className={isFit ? 'h-full w-full object-contain' : 'm-auto max-w-none'}
            style={
              zoomFraction === null
                ? undefined
                : naturalSize
                  ? { width: naturalSize.width * zoomFraction, height: naturalSize.height * zoomFraction }
                  : { transform: `scale(${zoomFraction})`, transformOrigin: 'top left' }
            }
          />
        )}
        {loading && !pageUrl && <p className="text-neutral-500">{t('common:loading')}</p>}
        {error && <p className="absolute bottom-4 text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={retreat}
          disabled={isPrevDisabled}
          aria-label={t('previousPage')}
          className="absolute inset-y-0 left-0 w-1/4 cursor-w-resize text-neutral-500 opacity-0 transition hover:opacity-100 disabled:hidden"
        >
          <ChevronLeft className="mx-4 size-8" />
        </button>
        <button
          type="button"
          onClick={advance}
          disabled={isNextDisabled}
          aria-label={t('nextPage')}
          className="absolute inset-y-0 right-0 flex w-1/4 cursor-e-resize justify-end text-neutral-500 opacity-0 transition hover:opacity-100 disabled:hidden"
        >
          <ChevronRight className="mx-4 size-8 self-center" />
        </button>
      </div>
    </div>
  );
}
