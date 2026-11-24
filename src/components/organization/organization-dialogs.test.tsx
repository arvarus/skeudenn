// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConvertDeflate64Result, Deflate64CountResult, OrganizeResult, ResyncResult } from '@/shared/library';
import { deferred, scanProgressChannel } from '@/test/runs';
import { renderWithTankobon, type FakeTankobon } from '@/test/tankobon';
import { Deflate64Dialog } from './deflate64-dialog';
import { ResyncDialog } from './resync-dialog';
import { EmptyDeletedDialog, OrganizeAllDialog } from './simple-run-dialogs';

afterEach(cleanup);

/** Renders `dialog` with `library` faked and a progress channel the test pushes through. */
function open(dialog: React.ReactElement, library: FakeTankobon['library'] = {}, settings: FakeTankobon['settings'] = {}) {
  const channel = scanProgressChannel();
  renderWithTankobon(dialog, {
    library: { onScanProgress: channel.onScanProgress, ...library },
    settings: { getAll: vi.fn(async () => ({})) as never, ...settings },
  });
  return channel;
}

describe('OrganizeAllDialog (one step)', () => {
  it('counts on opening, runs on "Déplacer" with its progress, and reports a stopped run', async () => {
    const pending = deferred<OrganizeResult>();
    const organizeAll = vi.fn(() => pending.promise);
    const cancelRun = vi.fn(async () => true);
    const { push } = open(<OrganizeAllDialog onClose={vi.fn()} />, {
      countUnorganized: vi.fn(async () => ({ status: 'ok' as const, count: 3, folder: '/organized' })),
      organizeAll,
      cancelRun,
    });

    expect(await screen.findByText(/Les 3 BD pas encore rangées seront déplacées dans \/organized/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }));
    expect(organizeAll).toHaveBeenCalledTimes(1);
    push({ phase: 'importing', processed: 1, total: 3, currentFile: '/lib/Tintin.cbz' });
    expect(screen.getByText(/1 \/ 3 · Tintin\.cbz/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
    expect(cancelRun).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ status: 'ok', moved: 1, failed: 1, cancelled: true }));
    expect(screen.getByText(/Arrêté avant la fin/)).toBeTruthy();
    expect(screen.getByText('1 BD déplacée')).toBeTruthy();
    expect(screen.getByText(/n'a pas pu être déplacée/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Déplacer' })).toBeNull();
  });

  it('offers nothing to start when every comic is in its place', async () => {
    open(<OrganizeAllDialog onClose={vi.fn()} />, {
      countUnorganized: vi.fn(async () => ({ status: 'ok' as const, count: 0, folder: '/organized' })),
    });
    expect(await screen.findByText('Toutes les BD sont déjà rangées.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Déplacer' })).toBeNull();
  });

  it('shows a refusal of the count and of the run', async () => {
    open(<OrganizeAllDialog onClose={vi.fn()} />, {
      countUnorganized: vi.fn(async () => ({ status: 'ok' as const, count: 2, folder: '/organized' })),
      organizeAll: vi.fn(async () => ({ status: 'error' as const, message: 'Une resynchronisation est en cours.' })),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Déplacer' }));
    expect(await screen.findByText('Une resynchronisation est en cours.')).toBeTruthy();
    // It can be started again once the other run is over.
    expect(screen.getByRole('button', { name: 'Déplacer' })).toBeTruthy();
  });
});

describe('EmptyDeletedDialog', () => {
  it('warns that the deletion is for good before it starts', async () => {
    open(<EmptyDeletedDialog onClose={vi.fn()} />, {
      countConvertible: vi.fn(async () => ({ status: 'ok' as const, count: 0, folder: '/o', deletedFiles: 2, deletedBytes: 2048 })),
    });
    expect(await screen.findByText(/2 éléments .* supprimés définitivement : cette action est irréversible/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeTruthy();
  });
});

describe('Deflate64Dialog (two steps)', () => {
  it('checks, says how many were found, then converts and reports', async () => {
    const check = deferred<Deflate64CountResult>();
    const conversion = deferred<ConvertDeflate64Result>();
    const { push } = open(<Deflate64Dialog onClose={vi.fn()} />, {
      countDeflate64: vi.fn(() => check.promise),
      convertDeflate64: vi.fn(() => conversion.promise),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    expect(screen.getByText('Vérification des CBZ…')).toBeTruthy();
    push({ phase: 'importing', processed: 5, total: 10, currentFile: '/lib/a.cbz' });
    expect(screen.getByText(/5 \/ 10/)).toBeTruthy();
    await act(async () => check.resolve({ status: 'ok', count: 2 }));
    expect(screen.getByText(/2 CBZ utilisent la compression Deflate64/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Convertir' }));
    expect(screen.getByText('Conversion…')).toBeTruthy();
    await act(async () => conversion.resolve({ status: 'ok', converted: 2, failed: 0, cancelled: false }));
    expect(screen.getByText('2 CBZ convertis')).toBeTruthy();
    expect(screen.queryByText(/Arrêté avant la fin/)).toBeNull();
  });

  it('offers nothing to convert after a stopped check', async () => {
    const check = deferred<Deflate64CountResult>();
    open(<Deflate64Dialog onClose={vi.fn()} />, {
      countDeflate64: vi.fn(() => check.promise),
      cancelRun: vi.fn(async () => {
        check.resolve({ status: 'cancelled' });
        return true;
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    fireEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
    expect(await screen.findByText(/Arrêté avant la fin/)).toBeTruthy();
    expect(screen.getByText(/Rien n’a été modifié/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Convertir' })).toBeNull();
  });
});

describe('ResyncDialog', () => {
  const step = { index: 2, count: 4, name: 'scan' as const, folder: '/lib/Comics' };

  it('runs a resynchronization with its steps, stops it through cancelResync and lists the failures', async () => {
    const pending = deferred<ResyncResult>();
    const cancelResync = vi.fn(async () => true);
    const { push } = open(<ResyncDialog onClose={vi.fn()} />, {
      resyncStatus: vi.fn(async () => null),
      resync: vi.fn(() => pending.promise),
      cancelResync,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Démarrer' }));
    push({ phase: 'scanning', processed: 0, total: 0, currentFile: '/lib/Comics/a.cbz', step });
    expect(screen.getByText(/Étape 2\/4/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
    expect(cancelResync).toHaveBeenCalledTimes(1);

    await act(async () =>
      pending.resolve({
        status: 'ok',
        added: 2,
        removed: 1,
        failed: 1,
        failures: [{ path: '/lib/Comics/bad.cbz', reason: 'Archive illisible' }],
        unreachable: 0,
        nfoWritten: 0,
        coversExtracted: 0,
        finishedAt: '2026-01-01T00:00:00.000Z',
        cancelled: true,
        organization: { moved: 0, failed: 0, pending: null },
      }),
    );
    expect(screen.getByText(/Arrêté avant la fin/)).toBeTruthy();
    expect(screen.getByText(/2 ajoutée\(s\) · 1 retirée\(s\)/)).toBeTruthy();
    expect(screen.getByText('1 illisible(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Afficher le détail/ }));
    expect(screen.getByText('/lib/Comics/bad.cbz')).toBeTruthy();
  });

  it('follows a resynchronization already running when it opens, until it is over', async () => {
    let running = true;
    const resync = vi.fn();
    const { push } = open(<ResyncDialog onClose={vi.fn()} />, {
      resyncStatus: vi.fn(async () => (running ? { phase: 'scanning' as const, processed: 0, total: 0, currentFile: '', step } : null)),
      resync,
    });

    expect(await screen.findByText(/Étape 2\/4/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Arrêter/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Démarrer' })).toBeNull();

    running = false;
    push({ phase: 'done', processed: 0, total: 0, currentFile: '', step: { ...step, index: 4 } });
    await waitFor(() => expect(screen.getByText('La resynchronisation est terminée.')).toBeTruthy());
    expect(resync).not.toHaveBeenCalled();
  });
});
