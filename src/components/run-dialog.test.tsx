// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button';
import { useRun } from '@/hooks/use-run';
import type { ScanFailure } from '@/shared/library';
import { deferred, scanProgressChannel } from '@/test/runs';
import { renderWithSkeudenn } from '@/test/skeudenn';
import { RunDialog, RunReport } from './run-dialog';

afterEach(cleanup);

interface Outcome {
  cancelled: boolean;
}

const failures: ScanFailure[] = [{ path: '/lib/bad.cbz', reason: 'Archive illisible' }];

/** A dialog built like the actions': an intro with a start button, the run, then a report. */
function Harness({ task, resync = false, onClose }: { task: () => Promise<Outcome>; resync?: boolean; onClose: () => void }) {
  const run = useRun({ resync });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  return (
    <RunDialog
      title="Action"
      description="Ce que fait l’action."
      run={run}
      progressLabel="Traitement…"
      onClose={onClose}
      actions={outcome ? undefined : <Button onClick={() => void run.start(task).then(setOutcome)}>Lancer</Button>}
    >
      {outcome ? (
        <RunReport cancelled={outcome.cancelled} summary={['3 livres traités']} problems={['1 livre en échec']} failures={failures} />
      ) : (
        <p>Introduction</p>
      )}
    </RunDialog>
  );
}

function open(task: () => Promise<Outcome>, library: Record<string, unknown> = {}, resync = false) {
  const channel = scanProgressChannel();
  const onClose = vi.fn();
  renderWithSkeudenn(<Harness task={task} resync={resync} onClose={onClose} />, {
    library: { onScanProgress: channel.onScanProgress, ...library },
  });
  return { ...channel, onClose };
}

describe('RunDialog', () => {
  it('shows the intro, then the progress of the run, then the report', async () => {
    const pending = deferred<Outcome>();
    const { push } = open(() => pending.promise);
    expect(screen.getByText('Introduction')).toBeTruthy();
    // The cross of the dialog and the button of the footer.
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    expect(screen.queryByText('Introduction')).toBeNull();
    expect(screen.getByText('Traitement…')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(1);

    push({ phase: 'importing', processed: 1, total: 4, currentFile: '/lib/Blacksad 01.cbz' });
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByText(/1 \/ 4 · Blacksad 01\.cbz/)).toBeTruthy();

    await act(async () => pending.resolve({ cancelled: false }));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('3 livres traités')).toBeTruthy();
    expect(screen.queryByText(/Arrêté avant la fin/)).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2);
  });

  it('ignores the progress of other runs: before its own, after it, and a resynchronization’s', async () => {
    const pending = deferred<Outcome>();
    const { push } = open(() => pending.promise);
    push({ phase: 'importing', processed: 1, total: 4, currentFile: '/lib/Before.cbz' });
    expect(screen.queryByRole('progressbar')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    push({ phase: 'importing', processed: 2, total: 9, currentFile: '/lib/Resync.cbz', step: { index: 1, count: 3, name: 'scan', folder: '/lib' } });
    expect(screen.queryByText(/Resync\.cbz/)).toBeNull();

    await act(async () => pending.resolve({ cancelled: false }));
    push({ phase: 'importing', processed: 1, total: 4, currentFile: '/lib/After.cbz' });
    expect(screen.queryByText(/After\.cbz/)).toBeNull();
  });

  it('takes only a resynchronization’s progress for a resynchronization, with its step', () => {
    const { push } = open(() => new Promise(() => undefined), {}, true);
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    push({ phase: 'importing', processed: 2, total: 9, currentFile: '/lib/Other.cbz' });
    expect(screen.queryByText(/Other\.cbz/)).toBeNull();
    push({ phase: 'scanning', processed: 0, total: 0, currentFile: '/lib/Comics/a.cbz', step: { index: 2, count: 5, name: 'scan', folder: '/lib/Comics' } });
    expect(screen.getByText(/Étape 2\/5/)).toBeTruthy();
  });

  it('stops the run through cancelRun, then reports it was stopped with its failures', async () => {
    const pending = deferred<Outcome>();
    const cancelRun = vi.fn(async () => true);
    open(() => pending.promise, { cancelRun });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));

    fireEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
    expect(cancelRun).toHaveBeenCalledTimes(1);
    const stopping = (await screen.findByRole('button', { name: /Arrêt en cours/ })) as HTMLButtonElement;
    expect(stopping.disabled).toBe(true);

    await act(async () => pending.resolve({ cancelled: true }));
    expect(screen.getByText(/Arrêté avant la fin/)).toBeTruthy();
    expect(screen.getByText('1 livre en échec')).toBeTruthy();
    expect(screen.queryByText('/lib/bad.cbz')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Afficher le détail/ }));
    expect(screen.getByText('/lib/bad.cbz')).toBeTruthy();
    expect(screen.getByText('Archive illisible')).toBeTruthy();
  });

  it('offers to stop again when the stop came too late', async () => {
    open(() => new Promise(() => undefined), { cancelRun: vi.fn(async () => false) });
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    fireEvent.click(screen.getByRole('button', { name: /Arrêter/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: /Arrêter/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('can’t be closed while the run goes on', async () => {
    const pending = deferred<Outcome>();
    const { onClose } = open(() => pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    // Only the cross is left, and it does nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ cancelled: false }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
