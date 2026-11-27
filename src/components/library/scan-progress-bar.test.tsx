// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '@/shared/i18n';
import type { ScanProgress } from '@/shared/library';
import { deferred } from '@/test/runs';
import { renderWithSkeudenn } from '@/test/skeudenn';
import { ScanProgressBar } from './scan-progress-bar';

afterEach(cleanup);

const importing: ScanProgress = { phase: 'importing', processed: 2, total: 10, currentFile: '/bd/b.cbz' };
const done: ScanProgress = { phase: 'done', processed: 10, total: 10, currentFile: '' };

/** `rerender` replaces the whole tree: the translations' provider has to come back with it. */
const translated = (ui: ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

describe('ScanProgressBar', () => {
  it('stops the run from its button, which says it is stopping until the run ends', () => {
    const cancelRun = vi.fn(async () => true);
    const onClose = vi.fn();
    const { rerender } = renderWithSkeudenn(<ScanProgressBar progress={importing} onClose={onClose} />, {
      library: { cancelRun },
    });
    expect(screen.queryByRole('button', { name: 'Fermer' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }));

    expect(cancelRun).toHaveBeenCalledTimes(1);
    const stopping = screen.getByRole('button', { name: 'Arrêt en cours…' });
    expect((stopping as HTMLButtonElement).disabled).toBe(true);

    // The scan answers the stop: the bar ends, with its close button and no stop button.
    rerender(translated(<ScanProgressBar progress={done} onClose={onClose} />));
    expect(screen.queryByRole('button', { name: /Arrêt/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();

    // The next run starts with a working stop button.
    rerender(translated(<ScanProgressBar progress={importing} onClose={onClose} />));
    expect(screen.getByRole('button', { name: 'Arrêter' })).toBeTruthy();
  });

  it('gives the button back when there was nothing left to stop', async () => {
    const answer = deferred<boolean>();
    renderWithSkeudenn(<ScanProgressBar progress={importing} onClose={() => undefined} />, {
      library: { cancelRun: () => answer.promise },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter' }));
    expect(screen.getByRole('button', { name: 'Arrêt en cours…' })).toBeTruthy();
    answer.resolve(false);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Arrêter' })).toBeTruthy());
  });
});
