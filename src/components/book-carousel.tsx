import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { HomeSectionLayout } from '@/shared/settings';

/** Share of the visible width one click on an arrow scrolls by. */
const SCROLL_STEP = 0.8;

/**
 * In `wrap` layout the items flow over as many lines as the width needs, with no arrows. Otherwise:
 * a single row of items (the children, `li`s) in a view of fixed size: what doesn't fit is reached
 * with the arrows at either side, which only show while there is something to scroll to. The row
 * has no scroll bar and doesn't wrap, so the block keeps the same height whatever it holds.
 */
export function BookCarousel({
  children,
  layout = 'row',
}: {
  children: ReactNode;
  layout?: HomeSectionLayout;
}) {
  const { t } = useTranslation('home');
  const list = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const element = list.current;
    if (!element) return;
    setEdges({
      start: element.scrollLeft <= 1,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, children]);

  const scroll = (direction: -1 | 1) =>
    list.current?.scrollBy({
      left: direction * list.current.clientWidth * SCROLL_STEP,
      behavior: 'smooth',
    });

  if (layout === 'wrap') {
    return <ul className="mt-3 flex flex-wrap gap-4 p-1">{children}</ul>;
  }

  return (
    <div className="relative mt-3">
      <ul
        ref={list}
        onScroll={measure}
        className="flex gap-4 overflow-x-hidden p-1 scroll-smooth"
      >
        {children}
      </ul>
      {!edges.start && (
        <Button
          variant="secondary"
          size="icon-sm"
          className="absolute left-0 top-1/3 -translate-y-1/2 shadow"
          onClick={() => scroll(-1)}
          aria-label={t('scrollPrevious')}
          title={t('scrollPrevious')}
        >
          <ChevronLeft />
        </Button>
      )}
      {!edges.end && (
        <Button
          variant="secondary"
          size="icon-sm"
          className="absolute right-0 top-1/3 -translate-y-1/2 shadow"
          onClick={() => scroll(1)}
          aria-label={t('scrollNext')}
          title={t('scrollNext')}
        >
          <ChevronRight />
        </Button>
      )}
    </div>
  );
}
