// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { LibraryEntry } from '@/shared/library';
import { applyLanguage, i18n } from '@/shared/i18n';
import { BookBulkEditDialog } from './book-bulk-edit-dialog';

beforeAll(() => applyLanguage('fr'));
afterEach(cleanup);

function entry(id: string): LibraryEntry {
  return {
    id,
    path: `/books/${id}.cbz`,
    title: id,
    pageCount: 10,
    currentPage: 0,
    addedAt: '2024-01-01T00:00:00.000Z',
    lastOpenedAt: '2024-01-01T00:00:00.000Z',
    fileCount: 10,
    fileSize: 1,
    rating: 0,
    tags: [],
    titleLocked: false,
    series: null,
    volume: null,
    releaseDate: null,
    language: null,
    avgPageWidth: null,
    avgPageHeight: null,
    credits: [],
  };
}

function open(updateMetadataMany: () => Promise<number>, onClose = vi.fn()) {
  Object.assign(window, { skeudenn: { library: { updateMetadataMany } } });
  render(
    <I18nextProvider i18n={i18n}>
      <BookBulkEditDialog entries={[entry('a'), entry('b')]} onClose={onClose} />
    </I18nextProvider>,
  );
  // Ticks the first field, so there is something to apply.
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: /Appliquer à 2 livres/ }));
  return onClose;
}

describe('BookBulkEditDialog', () => {
  it('closes once the books are updated', async () => {
    const onClose = open(vi.fn(async () => 2));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // The main process refuses a call it can't serve (too many ids, a database error): the dialog used to
  // stay open with no word, and the rejection went unhandled.
  it('stays open and says so when the update is refused', async () => {
    const onClose = open(vi.fn(async () => Promise.reject(new Error('refused'))));
    expect((await screen.findByRole('alert')).textContent).toMatch(/n’ont pas pu être modifiés/);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Appliquer à 2 livres/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
