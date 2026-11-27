import { ChevronLeft, ChevronRight, ImageUp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  COVER_OUTPUT_HEIGHT,
  COVER_OUTPUT_WIDTH,
  MAX_COVER_ZOOM,
  coverSourceRect,
  cropToCover,
} from '@/lib/cover-crop';
import { bumpCoverRevision } from '@/lib/cover-revisions';
import { cn } from '@/lib/utils';
import type { LibraryEntry } from '@/shared/library';

/** Width of the preview frame, in CSS pixels (the height follows the 2:3 proportions). */
const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = Math.round((PREVIEW_WIDTH * COVER_OUTPUT_HEIGHT) / COVER_OUTPUT_WIDTH);

type Source = 'upload' | 'page';

/**
 * Replaces a book's cover: with an uploaded image or a page of the book, cropped in a 2:3 frame (drag to
 * move, slider to zoom). The cropped picture goes to `library:set-cover`, which shrinks it to the thumbnail
 * size. Picking a page opens the book in the decoder process (`comic.open`, like the reader does), which
 * counts as opening it; the archive is closed with the dialog.
 */
export function CoverEditorDialog({ entry, onClose }: { entry: LibraryEntry; onClose: () => void }) {
  const { t } = useTranslation(['bookEdit', 'common']);
  const [source, setSource] = useState<Source>('upload');
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0.5, y: 0.5 });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // The book's archive, opened the first time a page is wanted.
  const [archive, setArchive] = useState<{ id: string; pageCount: number } | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const archiveId = useRef<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Answers of requests started before the latest one are ignored.
  const request = useRef(0);

  const show = useCallback((next: ImageBitmap) => {
    setBitmap((previous) => {
      previous?.close();
      return next;
    });
    setZoom(1);
    setPan({ x: 0.5, y: 0.5 });
  }, []);

  const showBytes = useCallback(
    async (bytes: Uint8Array, mine: number) => {
      try {
        const next = await createImageBitmap(new Blob([bytes as BlobPart]));
        if (mine !== request.current) {
          next.close();
          return;
        }
        show(next);
        setMessage(null);
      } catch {
        if (mine === request.current) setMessage(t('coverUnreadable'));
      }
    },
    [show, t],
  );

  const loadPage = useCallback(
    async (id: string, index: number) => {
      const mine = ++request.current;
      setLoading(true);
      try {
        const page = await window.skeudenn.comic.readPage(id, index);
        await showBytes(page.data, mine);
      } catch {
        if (mine === request.current) setMessage(t('coverUnreadable'));
      } finally {
        if (mine === request.current) setLoading(false);
      }
    },
    [showBytes, t],
  );

  const openBook = async () => {
    setSource('page');
    if (archive) {
      void loadPage(archive.id, pageIndex);
      return;
    }
    setLoading(true);
    const result = await window.skeudenn.comic.open(entry.id);
    if (result.status === 'error') {
      setLoading(false);
      setMessage(result.message);
      return;
    }
    archiveId.current = result.comic.id;
    setArchive({ id: result.comic.id, pageCount: result.comic.pageCount });
    const index = 0;
    setPageIndex(index);
    await loadPage(result.comic.id, index);
  };

  const goToPage = (index: number) => {
    if (!archive) return;
    const clamped = Math.min(archive.pageCount - 1, Math.max(0, index));
    setPageIndex(clamped);
    void loadPage(archive.id, clamped);
  };

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    const mine = ++request.current;
    setSource('upload');
    setLoading(true);
    try {
      await showBytes(new Uint8Array(await file.arrayBuffer()), mine);
    } finally {
      if (mine === request.current) setLoading(false);
    }
  };

  // Closes the book's archive and the bitmap with the dialog.
  useEffect(
    () => () => {
      if (archiveId.current) void window.skeudenn.comic.close(archiveId.current);
    },
    [],
  );
  useEffect(() => () => bitmap?.close(), [bitmap]);

  // The preview is the cropped part itself, drawn at twice the frame's size for sharpness.
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    context.clearRect(0, 0, element.width, element.height);
    if (!bitmap) return;
    const rect = coverSourceRect(bitmap.width, bitmap.height, zoom, pan.x, pan.y);
    context.drawImage(bitmap, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, element.width, element.height);
  }, [bitmap, zoom, pan]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!bitmap) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!bitmap || !drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    const rect = coverSourceRect(bitmap.width, bitmap.height, zoom, pan.x, pan.y);
    // Dragging the picture right shows more of its left side: the visible part moves the other way.
    const roomX = bitmap.width - rect.sw;
    const roomY = bitmap.height - rect.sh;
    const unit = rect.sw / PREVIEW_WIDTH;
    setPan({
      x: roomX > 0 ? Math.min(1, Math.max(0, (rect.sx - dx * unit) / roomX)) : 0.5,
      y: roomY > 0 ? Math.min(1, Math.max(0, (rect.sy - dy * unit) / roomY)) : 0.5,
    });
  };

  const save = async () => {
    if (!bitmap) return;
    setSaving(true);
    setMessage(null);
    try {
      const image = await cropToCover(bitmap, coverSourceRect(bitmap.width, bitmap.height, zoom, pan.x, pan.y));
      const result = await window.skeudenn.library.setCover(entry.id, image);
      if (result.status === 'error') {
        setMessage(result.message);
        return;
      }
      bumpCoverRevision(entry.id);
      onClose();
    } catch {
      setMessage(t('coverUnreadable'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={t('coverTitle')} description={entry.title} className="max-w-xl">
      <div className="flex min-h-0 flex-1 gap-5 overflow-y-auto">
        <div className="flex shrink-0 flex-col gap-2">
          <div
            className="relative overflow-hidden rounded-md border bg-muted"
            style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
          >
            <canvas
              ref={canvas}
              width={PREVIEW_WIDTH * 2}
              height={PREVIEW_HEIGHT * 2}
              className={cn('size-full touch-none', bitmap && 'cursor-grab active:cursor-grabbing')}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            />
            {!bitmap && (
              <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
                {loading ? t('coverLoading') : t('coverNoImage')}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            {t('coverZoom')}
            <input
              type="range"
              min={1}
              max={MAX_COVER_ZOOM}
              step={0.05}
              value={zoom}
              disabled={!bitmap}
              onChange={(event) => setZoom(event.target.valueAsNumber)}
              className="flex-1"
            />
          </label>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 text-sm">
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">{t('coverUpload')}</h3>
            <div>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    void chooseFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <span
                  className={cn(
                    'inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-accent has-[:focus-visible]:ring-[3px]',
                    source === 'upload' && bitmap && 'border-ring',
                  )}
                >
                  <ImageUp className="size-4" />
                  {t('coverChooseFile')}
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="font-medium">{t('coverFromPage')}</h3>
            {archive ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  title={t('coverPreviousPage')}
                  aria-label={t('coverPreviousPage')}
                  disabled={pageIndex <= 0}
                  onClick={() => goToPage(pageIndex - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums">{t('coverPage', { page: pageIndex + 1, count: archive.pageCount })}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  title={t('coverNextPage')}
                  aria-label={t('coverNextPage')}
                  disabled={pageIndex >= archive.pageCount - 1}
                  onClick={() => goToPage(pageIndex + 1)}
                >
                  <ChevronRight />
                </Button>
                <input
                  type="number"
                  aria-label={t('coverPage', { page: pageIndex + 1, count: archive.pageCount })}
                  className="h-8 w-20 rounded-md border bg-background px-2"
                  min={1}
                  max={archive.pageCount}
                  value={pageIndex + 1}
                  onChange={(event) => {
                    if (!Number.isNaN(event.target.valueAsNumber)) goToPage(event.target.valueAsNumber - 1);
                  }}
                />
              </div>
            ) : (
              <div>
                <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void openBook()}>
                  {t('coverFromPage')}
                </Button>
              </div>
            )}
          </div>

          <p className="text-muted-foreground">{t('coverHint')}</p>
          {message && <p className="text-destructive">{message}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t('common:cancel')}
        </Button>
        <Button type="button" size="sm" disabled={!bitmap || saving} onClick={() => void save()}>
          {t('coverSave')}
        </Button>
      </div>
    </Dialog>
  );
}
