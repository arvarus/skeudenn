// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ComicInfo } from '@/shared/comic';
import { applyLanguage, i18n } from '@/shared/i18n';
import { DEFAULT_SETTINGS, toPublicSettings } from '@/shared/settings';
import { BookReader } from './book-reader';

// Whether a book is the last of a list is the route's business: a stand-in tells it was asked.
vi.mock('@/components/reader/next-in-list-button', () => ({
  NextInListButton: ({ nextInList }: { nextInList: unknown }) => (nextInList ? <button>Livre suivant</button> : null),
}));

beforeAll(() => applyLanguage('fr'));

/** The size of each page by index; a page not listed is a 800 × 1200 portrait. */
let sizes: Record<number, { width: number; height: number }> = {};
/** The pages `readPage` is asked for. */
let readPage: ReturnType<typeof vi.fn>;
let unreadable: Set<number>;

/** jsdom doesn't decode images: the size of the page a `blob:` URL stands for comes from `sizes`. */
class FakeImage {
  src = '';
  naturalWidth = 0;
  naturalHeight = 0;
  decode() {
    const page = Number(this.src.replace('blob:page-', ''));
    const size = sizes[page] ?? { width: 800, height: 1200 };
    this.naturalWidth = size.width;
    this.naturalHeight = size.height;
    return Promise.resolve();
  }
}

/** The reading area is 1600 × 900 pixels. */
class FakeResizeObserver {
  constructor(private readonly callback: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
  observe() {
    this.callback([{ contentRect: { width: 1600, height: 900 } }]);
  }
  disconnect() {}
}

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sizes = {};
  unreadable = new Set();
  readPage = vi.fn(async (_id: string, page: number) => {
    if (unreadable.has(page)) throw new Error('Unknown archive');
    // The page is in the size of the data, which is all a `Blob` shows synchronously.
    return { data: new Uint8Array(page + 1), mimeType: 'image/png' };
  });
  Object.assign(window, { skeudenn: { comic: { readPage } } });
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:page-${blob.size - 1}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  scrollTo = vi.fn();
  Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function comic(pageCount: number): ComicInfo {
  return { id: 'archive-1', path: '/bd/a.cbz', title: 'Album', pageCount, fileCount: pageCount, libraryId: 'lib-1', resumePage: 0 };
}

type Props = ComponentProps<typeof BookReader>;

function renderReader(overrides: Partial<Props> = {}, settings: Partial<ReturnType<typeof toPublicSettings>> = {}) {
  const props: Props = {
    comic: comic(14),
    startPage: 0,
    settings: { ...toPublicSettings(DEFAULT_SETTINGS), readingMode: 'book', ...settings },
    pickAndOpen: vi.fn(),
    close: vi.fn(),
    onActivePage: vi.fn(),
    onRetry: vi.fn(),
    onSwitchToSingle: vi.fn(),
    fullscreen: false,
    toggleFullscreen: vi.fn(),
    nextInList: null,
    ...overrides,
  };
  render(
    <I18nextProvider i18n={i18n}>
      <BookReader {...props} />
    </I18nextProvider>,
  );
  return props;
}

/** The pages on screen, left to right, as the images name them. */
const shown = () => screen.queryAllByRole('img').map((image) => image.getAttribute('alt'));
const sideOf = (alt: string) => screen.getByAltText(alt).getAttribute('data-side');

async function showing(...alts: string[]) {
  await waitFor(() => expect(shown()).toEqual(alts));
}

/**
 * Resolves in the microtask that follows the commit showing these pages, before React flushes the
 * passive effects of that commit: the earliest moment a user (or a test) can act on the spread.
 */
function shownAtCommit(...alts: string[]) {
  return new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (JSON.stringify(shown()) !== JSON.stringify(alts)) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

const button = (name: string) => screen.getByRole('button', { name });

describe('BookReader layout', () => {
  it('shows the cover alone on the right half in left-to-right reading', async () => {
    renderReader();
    await showing('Page 1');
    expect(sideOf('Page 1')).toBe('right');
  });

  it('shows the cover alone on the left half in right-to-left reading', async () => {
    renderReader({}, { readingDirection: 'rtl' });
    await showing('Page 1');
    expect(sideOf('Page 1')).toBe('left');
  });

  it('shows two pages in reading order, the lower one on the left', async () => {
    renderReader({ startPage: 1 });
    await showing('Page 2', 'Page 3');
    expect(sideOf('Page 2')).toBe('left');
    expect(sideOf('Page 3')).toBe('right');
    expect(screen.getByTestId('spine')).toBeTruthy();
  });

  it('shows the lower page on the right in right-to-left reading', async () => {
    renderReader({ startPage: 2 }, { readingDirection: 'rtl' });
    await showing('Page 3', 'Page 2');
    expect(sideOf('Page 3')).toBe('left');
    expect(sideOf('Page 2')).toBe('right');
  });

  it('pairs the pages from the first one when the cover is not alone', async () => {
    renderReader({}, { bookCoverAlone: false });
    await showing('Page 1', 'Page 2');
  });

  it('opens on the spread holding the start page', async () => {
    renderReader({ startPage: 4 });
    await showing('Page 4', 'Page 5');
  });

  it('shows a landscape page alone, then the page it was paired with alone', async () => {
    sizes = { 3: { width: 1600, height: 1200 } };
    renderReader({ startPage: 3 });
    await showing('Page 4');
    expect(sideOf('Page 4')).toBe('center');
    expect(screen.queryByTestId('spine')).toBeNull();

    fireEvent.click(button('Pages suivantes'));
    await showing('Page 5');
    expect(sideOf('Page 5')).toBe('right');
  });

  it('keeps the pages at the same scale, so their relative sizes show', async () => {
    sizes = { 1: { width: 800, height: 1200 }, 2: { width: 400, height: 600 } };
    renderReader({ startPage: 1 });
    await showing('Page 2', 'Page 3');
    const [left, right] = screen.getAllByRole('img') as HTMLImageElement[];
    expect(parseInt(left.style.width, 10)).toBe(2 * parseInt(right.style.width, 10));
    expect(parseInt(left.style.height, 10)).toBe(2 * parseInt(right.style.height, 10));
  });

  it('puts the last odd page on the left half, opposite to the cover', async () => {
    renderReader({ startPage: 13 });
    await showing('Page 14');
    expect(sideOf('Page 14')).toBe('left');
  });

  it('shows a placeholder until both pages of the spread are decoded', async () => {
    let finish: (page: { data: Uint8Array; mimeType: string }) => void = () => {};
    readPage.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    renderReader({ startPage: 1 });

    // The two pages of the spread and the three of its neighbours.
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(5));
    expect(shown()).toEqual([]);
    expect(screen.getByText('Chargement…')).toBeTruthy();

    await act(async () => finish({ data: new Uint8Array(2), mimeType: 'image/png' }));
    await showing('Page 2', 'Page 3');
  });

  it('reads the neighbouring spreads ahead of time', async () => {
    renderReader({ startPage: 3 });
    await showing('Page 4', 'Page 5');
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(6));
    expect(readPage.mock.calls.map(([, page]) => page).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('releases the pages that are no longer near', async () => {
    renderReader({ startPage: 1 });
    await showing('Page 2', 'Page 3');
    fireEvent.click(button('Dernière page'));
    await showing('Page 14');
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:page-1'));
  });
});

describe('BookReader navigation', () => {
  it('turns the spread with the next and previous buttons', async () => {
    renderReader();
    await showing('Page 1');
    fireEvent.click(button('Pages suivantes'));
    await showing('Page 2', 'Page 3');
    fireEvent.click(button('Pages suivantes'));
    await showing('Page 4', 'Page 5');
    fireEvent.click(button('Pages précédentes'));
    await showing('Page 2', 'Page 3');
    fireEvent.click(button('Pages précédentes'));
    await showing('Page 1');
  });

  it('goes to the first and the last page', async () => {
    renderReader({ startPage: 5 });
    await showing('Page 6', 'Page 7');
    fireEvent.click(button('Dernière page'));
    await showing('Page 14');
    fireEvent.click(button('Première page'));
    await showing('Page 1');
  });

  it('disables the previous and first buttons on the first spread, the next and last ones on the last', async () => {
    renderReader();
    await showing('Page 1');
    expect((button('Pages précédentes') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Première page') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Pages suivantes') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(button('Dernière page'));
    await showing('Page 14');
    expect((button('Pages suivantes') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Dernière page') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Pages précédentes') as HTMLButtonElement).disabled).toBe(false);
  });

  it('puts the buttons that go back on the right in right-to-left reading', async () => {
    renderReader({ startPage: 1 }, { readingDirection: 'rtl' });
    await showing('Page 3', 'Page 2');
    const next = button('Pages suivantes');
    const previous = button('Pages précédentes');
    // The left column goes forward in the book, the right one back.
    expect(next.compareDocumentPosition(previous) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(next);
    await showing('Page 5', 'Page 4');
    fireEvent.click(previous);
    await showing('Page 3', 'Page 2');
  });

  it('turns the spread with the arrow keys, which follow the direction, and Home and End', async () => {
    renderReader();
    await showing('Page 1');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await showing('Page 2', 'Page 3');
    fireEvent.keyDown(window, { key: ' ' });
    await showing('Page 4', 'Page 5');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await showing('Page 2', 'Page 3');
    fireEvent.keyDown(window, { key: 'End' });
    await showing('Page 14');
    fireEvent.keyDown(window, { key: 'Home' });
    await showing('Page 1');
  });

  it('reverses the arrow keys in right-to-left reading', async () => {
    renderReader({ startPage: 3 }, { readingDirection: 'rtl' });
    await showing('Page 5', 'Page 4');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await showing('Page 7', 'Page 6');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await showing('Page 5', 'Page 4');
  });

  it('does not turn at the ends of the book', async () => {
    renderReader();
    await showing('Page 1');
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await showing('Page 1');
    fireEvent.keyDown(window, { key: 'End' });
    await showing('Page 14');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await showing('Page 14');
  });

  it('turns the spread with the wheel, in the direction the setting gives', async () => {
    renderReader({ startPage: 3 });
    await showing('Page 4', 'Page 5');
    const area = screen.getByRole('region', { name: 'Pages' });
    fireEvent.wheel(area, { deltaY: 100 });
    await showing('Page 6', 'Page 7');
  });

  it('turns back with a wheel scrolled down when the scroll direction is inverted', async () => {
    renderReader({ startPage: 3 }, { scrollDirection: 'inverted' });
    await showing('Page 4', 'Page 5');
    fireEvent.wheel(screen.getByRole('region', { name: 'Pages' }), { deltaY: 100 });
    await showing('Page 2', 'Page 3');
  });

  // The wheel and key listeners used to be re-attached by a passive effect, so an event between the
  // commit that showed the spread and that effect met the previous render's `advance`, which knew no
  // spread yet and did nothing: the turn was lost (it made the two wheel tests above flaky under load).
  it('turns with a wheel fired as soon as the spread is on screen', async () => {
    renderReader({ startPage: 3 });
    await shownAtCommit('Page 4', 'Page 5');
    fireEvent.wheel(screen.getByRole('region', { name: 'Pages' }), { deltaY: 100 });
    await showing('Page 6', 'Page 7');
  });

  it('turns with a key pressed as soon as the spread is on screen', async () => {
    renderReader({ startPage: 3 });
    await shownAtCommit('Page 4', 'Page 5');
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await showing('Page 6', 'Page 7');
  });

  it('lets a zoomed spread scroll before the wheel turns it', async () => {
    renderReader({ startPage: 3 });
    await showing('Page 4', 'Page 5');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    const area = screen.getByRole('region', { name: 'Pages' });
    Object.defineProperty(area, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(area, 'scrollHeight', { configurable: true, value: 500 });
    fireEvent.wheel(area, { deltaY: 100 });
    await showing('Page 4', 'Page 5');

    // A new gesture, once the first one is over, at the bottom of the spread.
    await new Promise((resolve) => setTimeout(resolve, 300));
    Object.defineProperty(area, 'scrollTop', { configurable: true, value: 400 });
    fireEvent.wheel(area, { deltaY: 100 });
    await showing('Page 6', 'Page 7');
  });

  it('lands on the top of the next spread and on the bottom of the previous one', async () => {
    renderReader({ startPage: 3 });
    await showing('Page 4', 'Page 5');
    scrollTo.mockClear();
    const area = screen.getByRole('region', { name: 'Pages' });
    Object.defineProperty(area, 'scrollHeight', { configurable: true, value: 900 });

    fireEvent.click(button('Pages suivantes'));
    await showing('Page 6', 'Page 7');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0 });

    fireEvent.click(button('Pages précédentes'));
    await showing('Page 4', 'Page 5');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, left: 0 });
  });
});

describe('BookReader slider and counter', () => {
  const slider = () => screen.getByRole('slider', { name: 'Position dans le livre' }) as HTMLInputElement;

  it('has a position for each block of pages and sits on the current one', async () => {
    renderReader({ startPage: 5 });
    await showing('Page 6', 'Page 7');
    expect(slider().max).toBe('7');
    expect(slider().value).toBe('3');
  });

  it('jumps to the spread of the position chosen', async () => {
    renderReader();
    await showing('Page 1');
    fireEvent.change(slider(), { target: { value: '4' } });
    await showing('Page 8', 'Page 9');
    fireEvent.change(slider(), { target: { value: '7' } });
    await showing('Page 14');
  });

  it('is reversed in right-to-left reading', async () => {
    renderReader({}, { readingDirection: 'rtl' });
    await showing('Page 1');
    expect(slider().value).toBe('7');
    fireEvent.change(slider(), { target: { value: '5' } });
    // Position 5 from the left is block 2 from the start.
    await showing('Page 5', 'Page 4');
  });

  it('only jumps when a drag is released, showing the pages meanwhile', async () => {
    renderReader();
    await showing('Page 1');
    fireEvent.pointerDown(slider());
    fireEvent.change(slider(), { target: { value: '2' } });
    expect(screen.getByRole('tooltip').textContent).toBe('4–5');
    expect(shown()).toEqual(['Page 1']);
    fireEvent.pointerUp(slider());
    await showing('Page 4', 'Page 5');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('writes the pages in the counter', async () => {
    renderReader({ startPage: 3 });
    await showing('Page 4', 'Page 5');
    expect((screen.getByRole('textbox', { name: 'Aller à la page' }) as HTMLInputElement).value).toBe('4–5');
    expect(screen.getByText('/ 14')).toBeTruthy();
    fireEvent.click(button('Dernière page'));
    await showing('Page 14');
    expect((screen.getByRole('textbox', { name: 'Aller à la page' }) as HTMLInputElement).value).toBe('14');
  });

  it('goes to the spread holding the page typed in the counter', async () => {
    renderReader();
    await showing('Page 1');
    const counter = screen.getByRole('textbox', { name: 'Aller à la page' });
    fireEvent.change(counter, { target: { value: '9' } });
    fireEvent.keyDown(counter, { key: 'Enter' });
    await showing('Page 8', 'Page 9');
    expect((screen.getByRole('textbox', { name: 'Aller à la page' }) as HTMLInputElement).value).toBe('8–9');
  });

  it('clamps a page out of the book and ignores a text that is not a page', async () => {
    renderReader({ startPage: 3 });
    await showing('Page 4', 'Page 5');
    const counter = screen.getByRole('textbox', { name: 'Aller à la page' });
    fireEvent.change(counter, { target: { value: 'abc' } });
    fireEvent.keyDown(counter, { key: 'Enter' });
    await showing('Page 4', 'Page 5');

    fireEvent.change(counter, { target: { value: '99' } });
    fireEvent.keyDown(counter, { key: 'Enter' });
    await showing('Page 14');
  });

  it('keeps the keys typed in the counter to itself', async () => {
    renderReader();
    await showing('Page 1');
    const counter = screen.getByRole('textbox', { name: 'Aller à la page' });
    fireEvent.keyDown(counter, { key: 'Home' });
    fireEvent.keyDown(counter, { key: 'ArrowRight' });
    await showing('Page 1');
  });
});

describe('BookReader zoom', () => {
  it('zooms with the buttons and the keys, and the menu follows', async () => {
    renderReader();
    await showing('Page 1');
    const menu = () => (screen.getByRole('combobox') as HTMLSelectElement).value;
    expect(menu()).toBe('fit');

    // The cover alone is 1600 × 1200 with its empty half: it fits the 1600 × 900 area at 75 %.
    fireEvent.click(button('Zoom avant'));
    expect(menu()).toBe('0.9');
    fireEvent.click(button('Zoom avant'));
    expect(menu()).toBe('1');
    fireEvent.keyDown(window, { key: '+' });
    expect(menu()).toBe('1.1');
    fireEvent.keyDown(window, { key: '-' });
    expect(menu()).toBe('1');
    fireEvent.click(button('Zoom arrière'));
    expect(menu()).toBe('0.9');
    fireEvent.click(button('Zoom arrière'));
    expect(menu()).toBe('fit');
    fireEvent.click(button('Zoom arrière'));
    expect(menu()).toBe('0.5');
  });

  it('draws the spread at the factor of the menu: 100 % is the actual size of the pages', async () => {
    renderReader({ startPage: 1 });
    await showing('Page 2', 'Page 3');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } });
    const [left] = screen.getAllByRole('img') as HTMLImageElement[];
    expect(left.style.width).toBe('800px');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '0.5' } });
    expect((screen.getAllByRole('img')[0] as HTMLImageElement).style.width).toBe('400px');
  });
});

describe('BookReader progress', () => {
  it('saves the highest page of the spread shown', async () => {
    const { onActivePage } = renderReader();
    await waitFor(() => expect(onActivePage).toHaveBeenLastCalledWith(0));
    fireEvent.click(button('Pages suivantes'));
    await waitFor(() => expect(onActivePage).toHaveBeenLastCalledWith(2));
    fireEvent.click(button('Pages suivantes'));
    await waitFor(() => expect(onActivePage).toHaveBeenLastCalledWith(4));
    expect(vi.mocked(onActivePage).mock.calls.map(([page]) => page)).toEqual([0, 2, 4]);
  });

  it('marks the last page reached on the last spread', async () => {
    const { onActivePage } = renderReader({ comic: comic(13), startPage: 11 });
    await showing('Page 12', 'Page 13');
    await waitFor(() => expect(onActivePage).toHaveBeenLastCalledWith(12));

    const second = renderReader({ comic: comic(14), startPage: 13 }, { bookCoverAlone: false });
    await waitFor(() => expect(second.onActivePage).toHaveBeenLastCalledWith(13));
  });

  it('saves a landscape page and its partner one at a time', async () => {
    sizes = { 4: { width: 1600, height: 1200 } };
    const { onActivePage } = renderReader({ startPage: 3 });
    await waitFor(() => expect(onActivePage).toHaveBeenLastCalledWith(3));
    fireEvent.click(button('Pages suivantes'));
    await waitFor(() => expect(onActivePage).toHaveBeenLastCalledWith(4));
  });

  it('shows the percentage read from the highest page of the spread', async () => {
    renderReader({ startPage: 6 });
    await showing('Page 6', 'Page 7');
    expect(screen.getByTitle('Avancement dans le livre').textContent).toBe('50 %');
  });

  it('offers the next book of the list on the last spread only', async () => {
    const nextInList = { listId: 'l', listName: 'Saga', next: null };
    renderReader({ startPage: 3, nextInList });
    await showing('Page 4', 'Page 5');
    expect(screen.queryByRole('button', { name: 'Livre suivant' })).toBeNull();
    fireEvent.click(button('Dernière page'));
    await showing('Page 14');
    expect(screen.getByRole('button', { name: 'Livre suivant' })).toBeTruthy();
  });
});

describe('BookReader header', () => {
  it('goes back to page-by-page reading at the highest page of the spread', async () => {
    const { onSwitchToSingle } = renderReader({ startPage: 3 });
    await showing('Page 4', 'Page 5');
    fireEvent.click(button('Page par page'));
    expect(onSwitchToSingle).toHaveBeenCalledWith(4);
  });
});

describe('BookReader unreadable pages', () => {
  it('shows "Page illisible" with a retry button that opens the book again at that page', async () => {
    unreadable = new Set([2]);
    const { onRetry } = renderReader({ startPage: 1 });

    await screen.findByText('Page illisible');
    expect(shown()).toEqual(['Page 2']);
    // The first failure is taken for a restarted decoder and reopens the book by itself.
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(2);

    fireEvent.click(button('Réessayer'));
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenLastCalledWith(1);
  });

  it('reopens the book only once for pages that keep failing', async () => {
    unreadable = new Set([1, 2]);
    const { onRetry } = renderReader({ startPage: 1 });

    await waitFor(() => expect(screen.getAllByText('Page illisible')).toHaveLength(2));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps showing a page whose neighbour is unreadable, and lays the spread out with it', async () => {
    unreadable = new Set([2]);
    renderReader({ startPage: 1 });
    await screen.findByText('Page illisible');
    expect(screen.getByAltText('Page 2').getAttribute('data-side')).toBe('left');
  });

  it('ignores a prefetched page that fails until it is wanted', async () => {
    unreadable = new Set([3]);
    const { onRetry } = renderReader({ startPage: 1 });
    await showing('Page 2', 'Page 3');
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(5));
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.queryByText('Page illisible')).toBeNull();

    fireEvent.click(button('Pages suivantes'));
    await screen.findByText('Page illisible');
    expect(onRetry).toHaveBeenCalledWith(3);
  });
});
