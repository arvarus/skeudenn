// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RemoveEntriesResult } from '@/shared/library';
import { libraryEntry } from '@/test/fixtures';
import { deferred, scanProgressChannel } from '@/test/runs';
import { renderWithTankobon, type FakeTankobon } from '@/test/tankobon';
import { DuplicatesDialog } from './duplicates-dialog';

afterEach(cleanup);

const entries = [libraryEntry('keep', { title: 'Astérix' }), libraryEntry('copy', { title: 'Astérix' }), libraryEntry('alone', { title: 'Tintin' })];

/** Opens the dialog on `entries` and runs the search. */
function search(library: FakeTankobon['library'] = {}) {
  const channel = scanProgressChannel();
  const set = vi.fn(async () => undefined);
  renderWithTankobon(<DuplicatesDialog entries={entries} onClose={vi.fn()} />, {
    library: { onScanProgress: channel.onScanProgress, ...library },
    settings: { set: set as never },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
  return { ...channel, set };
}

const removed = (overrides: Partial<Extract<RemoveEntriesResult, { status: 'ok' }>> = {}): RemoveEntriesResult => ({
  status: 'ok',
  removed: 1,
  filesDeleted: 0,
  filesFailed: 0,
  cancelled: false,
  ...overrides,
});

describe('DuplicatesDialog', () => {
  it('searches only when asked, then removes the files that are not kept and reports it', async () => {
    const removeMany = vi.fn(async () => removed());
    search({ removeMany });
    fireEvent.click(await screen.findByRole('button', { name: /Retirer 1 fichier/ }));
    expect(await screen.findByText('1 fichier retiré de la bibliothèque')).toBeTruthy();
    expect(removeMany).toHaveBeenCalledWith(['copy'], false);
    expect(screen.queryByRole('button', { name: /Retirer/ })).toBeNull();
  });

  it('says so when there is no duplicate', async () => {
    renderWithTankobon(<DuplicatesDialog entries={[libraryEntry('alone')]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByText('Aucun doublon trouvé.')).toBeTruthy();
  });

  it('shows the removal progress, stops it and reports the stop', async () => {
    const pending = deferred<RemoveEntriesResult>();
    const cancelRun = vi.fn(async () => true);
    const { push } = search({ removeMany: vi.fn(() => pending.promise), cancelRun });
    fireEvent.click(await screen.findByRole('button', { name: /Retirer 1 fichier/ }));
    push({ phase: 'importing', processed: 0, total: 1, currentFile: '/books/copy.cbz' });
    expect(screen.getByText(/0 \/ 1 · copy\.cbz/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
    expect(cancelRun).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(removed({ removed: 0, cancelled: true })));
    expect(screen.getByText(/Arrêté avant la fin/)).toBeTruthy();
  });

  it('stays on the choice and says so when the removal fails', async () => {
    search({ removeMany: vi.fn(async () => Promise.reject(new Error('refused'))) });
    fireEvent.click(await screen.findByRole('button', { name: /Retirer 1 fichier/ }));
    expect(await screen.findByText(/n’ont pas pu être retirés/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Retirer 1 fichier/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the refusal of another run', async () => {
    search({ removeMany: vi.fn(async () => ({ status: 'error' as const, message: 'Une resynchronisation est en cours.' })) });
    fireEvent.click(await screen.findByRole('button', { name: /Retirer 1 fichier/ }));
    expect(await screen.findByText('Une resynchronisation est en cours.')).toBeTruthy();
  });

  it('reports the files that could not go to the trash', async () => {
    search({ removeMany: vi.fn(async () => removed({ filesFailed: 1 })) });
    fireEvent.click(await screen.findByRole('button', { name: /Retirer 1 fichier/ }));
    expect(await screen.findByText(/n’a pas pu être mis à la corbeille/)).toBeTruthy();
  });

  it('remembers a group left on "keep all" without removing anything', async () => {
    const removeMany = vi.fn();
    const { set } = search({ removeMany });
    fireEvent.click(await screen.findByLabelText('Tout garder'));
    fireEvent.click(screen.getByRole('button', { name: 'Valider les groupes gardés' }));
    expect(await screen.findByText(/1 groupe gardé/)).toBeTruthy();
    expect(removeMany).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith('ignoredDuplicates', expect.any(Array));
  });
});
