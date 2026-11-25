// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage, i18n } from '@/shared/i18n';
import { ContinuousPage } from './continuous-page';

beforeAll(() => applyLanguage('fr'));

type IntersectionCallback = (entries: { isIntersecting: boolean }[]) => void;

/** The observers created, by `rootMargin`, so a test can move the page in or out of a zone. */
const observers = new Map<string, IntersectionCallback>();

/** jsdom has no observers: every observer says "visible" at once, then fires only when a test calls it. */
class FakeIntersectionObserver {
  constructor(
    private readonly callback: IntersectionCallback,
    options: { rootMargin: string },
  ) {
    observers.set(options.rootMargin, callback);
  }
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
}

/** Moves the page in or out of the zone watched by the observer of that margin. */
function intersect(rootMargin: string, isIntersecting: boolean) {
  const callback = observers.get(rootMargin);
  if (!callback) throw new Error(`no observer with rootMargin ${rootMargin}`);
  act(() => callback([{ isIntersecting }]));
}

const LOAD = '800px 0px';
const KEEP = '3000px 0px';
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  observers.clear();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  URL.createObjectURL = vi.fn(() => 'blob:page');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage(readPage: () => Promise<unknown>, onRetry = vi.fn()) {
  const readPageMock = vi.fn(readPage);
  Object.assign(window, { tankobon: { comic: { readPage: readPageMock } } });
  render(
    <I18nextProvider i18n={i18n}>
      <ContinuousPage
        comicId="archive-1"
        index={4}
        onActive={vi.fn()}
        onRetry={onRetry}
        actualSize={false}
        scrollRef={createRef<HTMLDivElement>()}
        pinnedRef={createRef<boolean>() as RefObject<boolean>}
      />
    </I18nextProvider>,
  );
  return { onRetry, readPage: readPageMock };
}

/** A `readPage` whose answers the test gives, one per call, in order. */
function deferredPages() {
  const answers: ((page: { data: Uint8Array; mimeType: string }) => void)[] = [];
  const readPage = () => new Promise<unknown>((resolve) => answers.push(resolve));
  const answer = async (call: number) => {
    await act(async () => answers[call]({ data: new Uint8Array([1]), mimeType: 'image/png' }));
  };
  return { readPage, answer };
}

describe('ContinuousPage', () => {
  it('shows a failed page with a button that asks for the book to be opened again', async () => {
    const { onRetry } = renderPage(async () => {
      throw new Error('Unknown archive');
    });

    expect(await screen.findByText('Page illisible')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows no retry button for a page that loads', async () => {
    renderPage(async () => ({ data: new Uint8Array([1]), mimeType: 'image/png' }));

    await waitFor(() => expect(screen.queryByAltText('Page 5')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('releases a page whose fetch answers after it left the keep zone', async () => {
    const pages = deferredPages();
    renderPage(pages.readPage);

    intersect(KEEP, false); // scrolled far away while the page was still being fetched
    await pages.answer(0);

    expect(screen.queryByAltText('Page 5')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('fetches a page released while loading again when it comes back', async () => {
    const pages = deferredPages();
    const { readPage } = renderPage(pages.readPage);

    intersect(KEEP, false);
    await pages.answer(0);
    intersect(KEEP, true);
    intersect(LOAD, true);
    expect(readPage).toHaveBeenCalledTimes(2);
    await pages.answer(1);

    expect(screen.queryByAltText('Page 5')).not.toBeNull();
  });

  it('releases a loaded page and revokes its URL once it left the keep zone', async () => {
    renderPage(async () => ({ data: new Uint8Array([1]), mimeType: 'image/png' }));
    await waitFor(() => expect(screen.queryByAltText('Page 5')).not.toBeNull());

    intersect(KEEP, false);

    expect(screen.queryByAltText('Page 5')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:page');
  });
});
