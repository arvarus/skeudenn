// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScanProgress } from '@/shared/library';
import { renderWithTankobon, type FakeTankobon } from '@/test/tankobon';
import { CleanupDialog } from './cleanup-dialog';

afterEach(cleanup);

/** Opens the dialog and starts its analysis. */
function analyze(ui: ReactElement, fake: FakeTankobon) {
  renderWithTankobon(ui, fake);
  fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
}

describe('CleanupDialog', () => {
  it('describes the cleaning and only analyzes when "Analyser" is pressed, once', async () => {
    const analyzeCleanup = vi.fn(async () => ({
      status: 'ok' as const,
      token: 't',
      groups: [],
      scanned: 3,
      booksWithJunk: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    }));
    renderWithTankobon(
      <StrictMode>
        <CleanupDialog ids={[]} onClose={vi.fn()} />
      </StrictMode>,
      { library: { analyzeCleanup } },
    );

    expect(screen.getByText(/ne sont pas des images/)).toBeTruthy();
    expect(analyzeCleanup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    expect(await screen.findByText(/Rien à nettoyer/)).toBeTruthy();
    expect(analyzeCleanup).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Analyser' })).toBeNull();
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
    failures: [],
  };

  it('says so when the analysis call fails', async () => {
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => Promise.reject(new Error('refused'))) },
    });
    expect(await screen.findByText('Le nettoyage a échoué.')).toBeTruthy();
  });

  it('shows the message of an analysis the main process refused', async () => {
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => ({ status: 'error' as const, message: 'Un nettoyage est déjà en cours.' })) },
    });
    expect(await screen.findByText('Un nettoyage est déjà en cours.')).toBeTruthy();
  });

  it('stays on the choice, usable again, when the cleaning call fails', async () => {
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: {
        analyzeCleanup: vi.fn(async () => analysis),
        applyCleanup: vi.fn(async () => Promise.reject(new Error('refused'))),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer 2 fichiers/ }));
    expect(await screen.findByText('Le nettoyage a échoué.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Supprimer 2 fichiers/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('reports the books that could not be rewritten and unfolds them with the reason', async () => {
    const failures = [{ path: '/lib/bad.cbz', reason: 'Unknown compression method: 9' }];
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: {
        analyzeCleanup: vi.fn(async () => analysis),
        applyCleanup: vi.fn(async () => ({ status: 'ok' as const, cleaned: 0, filesRemoved: 0, bytesFreed: 0, failed: 1, failures, cancelled: false })),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer 2 fichiers/ }));
    expect(await screen.findByText(/n’a pas pu être réécrit/)).toBeTruthy();
    expect(screen.queryByText('/lib/bad.cbz')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Afficher le détail/ }));
    expect(screen.getByText('/lib/bad.cbz')).toBeTruthy();
    expect(screen.getByText('Unknown compression method: 9')).toBeTruthy();
  });

  it('lists the books the analysis could not read', async () => {
    const failures = [{ path: '/lib/broken.cbz', reason: 'Bad archive' }];
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => ({ ...analysis, groups: [], booksWithJunk: 0, failed: 1, failures })) },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Afficher le détail/ }));
    expect(screen.getByText('/lib/broken.cbz')).toBeTruthy();
    expect(screen.getByText('Bad archive')).toBeTruthy();
  });

  it('unfolds the books and files of a kind', async () => {
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => analysis) },
    });
    expect(screen.queryByText('book.cbz')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Afficher le détail/ }));
    expect(screen.getByText('book.cbz')).toBeTruthy();
    expect(screen.getByText('a.txt, b.txt')).toBeTruthy();
  });
});

describe('CleanupDialog stop', () => {
  const analysis = {
    status: 'ok' as const,
    token: 't',
    groups: [{ extension: '.txt', files: 2, books: 1, size: 20, examples: ['a.txt'], details: [{ name: 'book.cbz', files: ['a.txt', 'b.txt'] }] }],
    scanned: 3,
    booksWithJunk: 1,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  /** A promise the test settles. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => (resolve = done));
    return { promise, resolve };
  }

  it('stops the analysis and reports that nothing was changed, offering no partial plan', async () => {
    const pending = deferred<{ status: 'cancelled' }>();
    const cancelCleanup = vi.fn(async () => {
      pending.resolve({ status: 'cancelled' });
      return true;
    });
    const onClose = vi.fn();
    analyze(<CleanupDialog ids={[]} onClose={onClose} />, {
      library: { analyzeCleanup: vi.fn(() => pending.promise), cancelCleanup },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Arrêter/ }));
    expect(await screen.findByText(/Arrêté avant la fin/)).toBeTruthy();
    expect(screen.getByText(/Rien n’a été modifié/)).toBeTruthy();
    expect(cancelCleanup).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Analyser' })).toBeNull();
  });

  it('stops the rewrite and shows what was done until then', async () => {
    const pending = deferred<{
      status: 'ok';
      cleaned: number;
      filesRemoved: number;
      bytesFreed: number;
      failed: number;
      failures: never[];
      cancelled: boolean;
    }>();
    const cancelCleanup = vi.fn(async () => {
      pending.resolve({ status: 'ok', cleaned: 1, filesRemoved: 2, bytesFreed: 20, failed: 0, failures: [], cancelled: true });
      return true;
    });
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => analysis), applyCleanup: vi.fn(() => pending.promise), cancelCleanup },
    });
    expect(screen.queryByRole('button', { name: /Arrêter/ })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer 2 fichiers/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Arrêter/ }));
    expect(await screen.findByText(/Arrêté avant la fin/)).toBeTruthy();
    expect(screen.getByText(/1 livres nettoyés/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Arrêter/ })).toBeNull();
  });
});

describe('CleanupDialog progress', () => {
  const analysis = {
    status: 'ok' as const,
    token: 't',
    groups: [{ extension: '.txt', files: 2, books: 1, size: 20, examples: ['a.txt'], details: [{ name: 'book.cbz', files: ['a.txt', 'b.txt'] }] }],
    scanned: 3,
    booksWithJunk: 1,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  /** A promise the test settles, and the progress listener the dialog subscribed. */
  function harness<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => (resolve = done));
    let listener: ((progress: ScanProgress) => void) | null = null;
    const onScanProgress = vi.fn((callback: (progress: ScanProgress) => void) => {
      listener = callback;
      return () => {
        if (listener === callback) listener = null;
      };
    });
    const push = (progress: ScanProgress) => act(() => listener?.(progress));
    return { promise, resolve, onScanProgress, push };
  }

  it('shows the count and the name of the archive being analyzed, then drops it when the analysis ends', async () => {
    const run = harness<typeof analysis>();
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(() => run.promise), onScanProgress: run.onScanProgress },
    });
    await waitFor(() => expect(run.onScanProgress).toHaveBeenCalled());

    run.push({ phase: 'importing', processed: 0, total: 3, currentFile: '/lib/Blacksad/Blacksad 01.cbz' });
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByText(/0 \/ 3 · Blacksad 01\.cbz/)).toBeTruthy();
    run.push({ phase: 'importing', processed: 1, total: 3, currentFile: 'C:\\lib\\Tintin 02.cbz' });
    expect(screen.getByText(/1 \/ 3 · Tintin 02\.cbz/)).toBeTruthy();
    expect(screen.queryByText(/Blacksad 01/)).toBeNull();

    await act(async () => run.resolve(analysis));
    expect(await screen.findByRole('button', { name: /Supprimer 2 fichiers/ })).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    // A push arriving between two steps (another run) is not shown.
    run.push({ phase: 'importing', processed: 2, total: 9, currentFile: '/lib/Other.cbz' });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it("ignores a resynchronization's progress", async () => {
    const run = harness<typeof analysis>();
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(() => run.promise), onScanProgress: run.onScanProgress },
    });
    await waitFor(() => expect(run.onScanProgress).toHaveBeenCalled());

    run.push({
      phase: 'importing',
      processed: 4,
      total: 10,
      currentFile: '/lib/Resync.cbz',
      step: { index: 1, count: 4, name: 'scan', folder: '/lib' },
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/Resync\.cbz/)).toBeNull();
  });

  it('shows the progress of the rewrite too', async () => {
    const run = harness<{ status: 'ok'; cleaned: number; filesRemoved: number; bytesFreed: number; failed: number; failures: never[]; cancelled: boolean }>();
    analyze(<CleanupDialog ids={[]} onClose={vi.fn()} />, {
      library: { analyzeCleanup: vi.fn(async () => analysis), applyCleanup: vi.fn(() => run.promise), onScanProgress: run.onScanProgress },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Supprimer 2 fichiers/ }));
    run.push({ phase: 'importing', processed: 0, total: 1, currentFile: '/lib/book.cbz' });
    expect(screen.getByText(/0 \/ 1 · book\.cbz/)).toBeTruthy();

    await act(async () => run.resolve({ status: 'ok', cleaned: 1, filesRemoved: 2, bytesFreed: 20, failed: 0, failures: [], cancelled: false }));
    expect(await screen.findByText(/1 livres nettoyés/)).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
