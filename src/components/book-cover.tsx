import { BookImage } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { createTaskQueue } from '@/lib/cover-queue';
import { coverRevision, subscribeCoverRevisions } from '@/lib/cover-revisions';
import { cn } from '@/lib/utils';

/** The covers asked for from the main process, a few at a time, newest first: see `cover-queue.ts`. */
const coverQueue = createTaskQueue(4);

/**
 * Cover thumbnail of a library entry. It is only requested while the row is near the viewport (a request not started yet is cancelled when it leaves),
 * since a missing thumbnail makes the main process open the archive; until then, and for a book
 * without one, a placeholder icon keeps the row's layout.
 */
export function BookCover({ entryId, title, className }: { entryId: string; title: string; className?: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  // Changes when the user replaces this book's cover, which asks for the thumbnail again.
  const revision = useSyncExternalStore(subscribeCoverRevisions, () => coverRevision(entryId));

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Both ways: a row scrolled far away stops waiting for its cover.
    const observer = new IntersectionObserver(
      (records) => {
        const last = records[records.length - 1];
        if (last) setNear(last.isIntersecting);
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    const cancelRequest = coverQueue.enqueue(async () => {
      const bytes = await window.skeudenn.library.thumbnail(entryId);
      if (cancelled || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      cancelRequest();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [near, entryId, revision]);

  return (
    <div
      ref={ref}
      className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted', className)}
    >
      {url ? (
        <img src={url} alt={t('coverOf', { title })} className="size-full object-cover" draggable={false} />
      ) : (
        <BookImage className="size-5 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
