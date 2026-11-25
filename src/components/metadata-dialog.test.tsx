// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { libraryEntry } from '@/test/fixtures';
import { renderWithTankobon, type FakeTankobon } from '@/test/tankobon';
import type { MetadataCandidate } from '@/shared/metadata';
import { MetadataDialog } from './metadata-dialog';

// The cover watches the viewport and asks the main process for a thumbnail: not what is tested here.
vi.mock('@/components/book-cover', () => ({ BookCover: () => null }));

afterEach(cleanup);

const PAGE_URL = 'https://www.bedetheque.com/BD-Blacksad-Tome-1-1.html';

const candidate: MetadataCandidate = {
  source: 'bedetheque',
  sourceId: '1',
  sourceUrl: PAGE_URL,
  coverUrl: null,
  title: 'Quelque part entre les ombres',
  series: 'Blacksad',
  volume: '1',
  releaseDate: '2000-11',
  language: 'fr',
  credits: [],
};

function open(metadata: FakeTankobon['metadata']) {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  renderWithTankobon(<MetadataDialog entry={libraryEntry('a', { title: 'Blacksad' })} onClose={onClose} onApplied={onApplied} />, {
    metadata: { cancel: vi.fn(async () => undefined), ...metadata },
    settings: { set: vi.fn(async () => undefined) as never },
  });
  return { onClose, onApplied };
}

/** Types the link of a page and reads it, which leads straight to the review. */
function readPage() {
  // Radix selects a tab on mouse down (or on focus), not on click.
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Depuis un lien/ }));
  fireEvent.change(screen.getByLabelText(/Lien de la fiche/), { target: { value: PAGE_URL } });
  fireEvent.click(screen.getByRole('button', { name: /Lire la fiche/ }));
}

describe('MetadataDialog', () => {
  // The call used to be awaited without a catch: a refused or failed call left the dialog on "searching" for good.
  it('shows an error instead of searching for ever when the search call fails', async () => {
    open({ search: vi.fn(async () => Promise.reject(new Error('refused'))) });
    fireEvent.click(screen.getByLabelText(/Bédéthèque/));
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByText(/La recherche a échoué/)).toBeTruthy();
  });

  it('shows an error when reading the page fails', async () => {
    open({ fromPage: vi.fn(async () => Promise.reject(new Error('refused'))) });
    readPage();
    expect(await screen.findByText(/La recherche a échoué/)).toBeTruthy();
  });

  it('saves the accepted details and closes', async () => {
    const apply = vi.fn(async () => libraryEntry('a', { series: 'Blacksad' }));
    const { onClose, onApplied } = open({ fromPage: vi.fn(async () => ({ status: 'ok' as const, candidate })), apply });
    readPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('puts the focus in the search field on opening, so Enter searches instead of closing', async () => {
    const search = vi.fn(async () => ({ status: 'ok' as const, candidates: [], errors: [] }));
    const { onClose } = open({ search });
    fireEvent.click(screen.getByLabelText(/Bédéthèque/));
    const field = screen.getByLabelText(/Titre ou série/i, { selector: 'input' });
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves the review on Enter', async () => {
    const apply = vi.fn(async () => libraryEntry('a', { series: 'Blacksad' }));
    const { onClose } = open({ fromPage: vi.fn(async () => ({ status: 'ok' as const, candidate })), apply });
    readPage();
    await screen.findByRole('button', { name: 'Appliquer' });
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('stays open on a click outside, and closes on Escape', async () => {
    const { onClose } = open({});
    // Radix listens for outside clicks from the next tick on.
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('switches modes as tabs, each controlling its panel, with the arrow keys', async () => {
    open({});
    const list = screen.getByRole('tablist');
    expect(list.getAttribute('aria-label')).toBe('Méthode de recherche');
    const [api, site] = screen.getAllByRole('tab');
    expect(api.textContent).toMatch(/Recherche par API/);
    expect(site.textContent).toMatch(/Depuis un lien/);

    const panelOf = (tab: HTMLElement) => document.getElementById(tab.getAttribute('aria-controls') ?? '');
    expect(api.getAttribute('aria-selected')).toBe('true');
    expect(site.getAttribute('aria-selected')).toBe('false');
    const panel = screen.getByRole('tabpanel');
    expect(panelOf(api)).toBe(panel);
    expect(panel.getAttribute('aria-labelledby')).toBe(api.id);
    expect(panel.querySelector('input[aria-label="Titre ou série"]')).toBeTruthy();

    // Automatic activation: moving the focus with an arrow key selects the tab (Radix focuses on the next tick).
    api.focus();
    fireEvent.keyDown(api, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement).toBe(site));
    expect(site.getAttribute('aria-selected')).toBe('true');
    expect(api.getAttribute('aria-selected')).toBe('false');
    const sitePanel = screen.getByRole('tabpanel');
    expect(panelOf(site)).toBe(sitePanel);
    expect(sitePanel.querySelector('input[aria-label^="Lien de la fiche"]')).toBeTruthy();
    expect(screen.queryByLabelText(/Titre ou série/i, { selector: 'input' })).toBeNull();

    fireEvent.keyDown(site, { key: 'ArrowLeft' });
    await waitFor(() => expect(document.activeElement).toBe(api));
    expect(api.getAttribute('aria-selected')).toBe('true');
    expect(panelOf(api)).toBe(screen.getByRole('tabpanel'));
  });

  // Same here: the button stayed disabled for good and the rejection went unhandled.
  it('keeps the review open, enabled, and says so when saving fails', async () => {
    const { onClose, onApplied } = open({
      fromPage: vi.fn(async () => ({ status: 'ok' as const, candidate })),
      apply: vi.fn(async () => Promise.reject(new Error('refused'))),
    });
    readPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Appliquer' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/n’ont pas pu être enregistrées/);
    expect(onClose).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Appliquer' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
