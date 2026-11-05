// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { applyLanguage, i18n } from '@/shared/i18n';
import { renderWithTankobon } from '@/test/tankobon';
import { CleanupDialog } from './cleanup-dialog';

beforeAll(() => applyLanguage('fr'));
afterEach(cleanup);

describe('CleanupDialog', () => {
  // StrictMode runs the mount effect twice in development; the main process refuses a second analysis while
  // the first one runs, so asking twice showed "a cleanup is already running" on a dialog that had just opened.
  it('asks for the analysis once, even when the effect runs twice, and shows its result', async () => {
    let calls = 0;
    const analyzeCleanup = vi.fn(async () => {
      calls += 1;
      if (calls > 1) return { status: 'error' as const, message: 'Un nettoyage est déjà en cours.' };
      return { status: 'ok' as const, token: 't', groups: [], scanned: 3, booksWithJunk: 0, skipped: 0, failed: 0 };
    });
    Object.assign(window, { tankobon: { library: { analyzeCleanup } } });

    render(
      <StrictMode>
        <I18nextProvider i18n={i18n}>
          <CleanupDialog ids={[]} onClose={vi.fn()} />
        </I18nextProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(screen.queryByText(/déjà en cours/)).toBeNull());
    await waitFor(() => expect(screen.queryByText(/Analyse des archives/)).toBeNull());
    expect(analyzeCleanup).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/déjà en cours/)).toBeNull();
  });
});

describe('CleanupDialog failures', () => {
  const analysis = {
    status: 'ok' as const,
    token: 't',
    groups: [{ extension: '.txt', files: 2, books: 1, size: 20, examples: ['a.txt'], details: [{ name: 'book.cbz', files: ['a.txt', 'b.txt'] }] }],
    scanned: 3,
    booksWithJunk: 1,
    skipped: 0,
    failed: 0,
  };

  it('says so when the analysis call fails', async () => {
    renderWithTankobon(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => Promise.reject(new Error('refused'))) },
    });
    expect(await screen.findByText('Le nettoyage a échoué.')).toBeTruthy();
  });

  it('shows the message of an analysis the main process refused', async () => {
    renderWithTankobon(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => ({ status: 'error' as const, message: 'Un nettoyage est déjà en cours.' })) },
    });
    expect(await screen.findByText('Un nettoyage est déjà en cours.')).toBeTruthy();
  });

  it('stays on the choice, usable again, when the cleaning call fails', async () => {
    renderWithTankobon(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: {
        analyzeCleanup: vi.fn(async () => analysis),
        applyCleanup: vi.fn(async () => Promise.reject(new Error('refused'))),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer 2 fichiers/ }));
    expect(await screen.findByText('Le nettoyage a échoué.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Supprimer 2 fichiers/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports the books that could not be rewritten', async () => {
    renderWithTankobon(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: {
        analyzeCleanup: vi.fn(async () => analysis),
        applyCleanup: vi.fn(async () => ({ status: 'ok' as const, cleaned: 0, filesRemoved: 0, bytesFreed: 0, failed: 1 })),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer 2 fichiers/ }));
    expect(await screen.findByText(/n’a pas pu être réécrit/)).toBeTruthy();
  });

  it('unfolds the books and files of a kind', async () => {
    renderWithTankobon(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => analysis) },
    });
    expect(screen.queryByText('book.cbz')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Afficher le détail/ }));
    expect(screen.getByText('book.cbz')).toBeTruthy();
    expect(screen.getByText('a.txt, b.txt')).toBeTruthy();
  });
});
