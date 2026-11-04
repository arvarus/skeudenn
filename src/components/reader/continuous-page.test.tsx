// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage, i18n } from '@/shared/i18n';
import { ContinuousPage } from './continuous-page';

beforeAll(() => applyLanguage('fr'));

/** jsdom has no observers: the load observer says "visible" at once, the others never fire. */
class FakeIntersectionObserver {
  constructor(private readonly callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() {
    this.callback([{ isIntersecting: true }]);
  }
  disconnect() {}
}
class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
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
  Object.assign(window, { tankobon: { comic: { readPage: vi.fn(readPage) } } });
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
  return onRetry;
}

describe('ContinuousPage', () => {
  it('shows a failed page with a button that asks for the book to be opened again', async () => {
    const onRetry = renderPage(async () => {
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
});
