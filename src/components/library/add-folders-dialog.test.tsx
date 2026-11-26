// @vitest-environment jsdom
import { renderWithTankobon } from '@/test/tankobon';

import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PickedFolder } from '@/shared/library';
import { AddFoldersDialog } from './add-folders-dialog';

afterEach(cleanup);

const FOLDERS: PickedFolder[] = [
  { name: 'Téléchargements', path: '/home/loic/Téléchargements' },
  { name: 'Clé USB', path: '/media/usb/Clé USB' },
  { name: 'Archives', path: '/data/Archives' },
];

function open(initialWatch: boolean, folders = FOLDERS) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  renderWithTankobon(<AddFoldersDialog folders={folders} initialWatch={initialWatch} onConfirm={onConfirm} onCancel={onCancel} />);
  return { onConfirm, onCancel };
}

describe('AddFoldersDialog', () => {
  it('is a dialog listing every folder picked, with its full path as a tooltip', () => {
    open(true);
    const dialog = screen.getByRole('dialog', { name: 'Ajouter ces dossiers ?' });
    expect(dialog.textContent).toContain('Ces 3 dossiers seront analysés');
    for (const folder of FOLDERS) {
      expect(within(dialog).getByText(folder.name).closest('li')?.getAttribute('title')).toBe(folder.path);
    }
  });

  it('says "this folder" for a single pick', () => {
    open(true, [FOLDERS[0]]);
    expect(screen.getByRole('dialog').textContent).toContain('Ce dossier sera analysé');
  });

  it('starts the watch box from the remembered choice', () => {
    open(false);
    expect(screen.getByRole('checkbox', { name: 'Surveiller ces dossiers (resynchronisation)' })).toHaveProperty('checked', false);
    cleanup();
    open(true);
    expect(screen.getByRole('checkbox', { name: 'Surveiller ces dossiers (resynchronisation)' })).toHaveProperty('checked', true);
  });

  it('explains what not watching means', () => {
    open(true);
    const box = screen.getByRole('checkbox', { name: 'Surveiller ces dossiers (resynchronisation)' });
    const hint = document.getElementById(box.getAttribute('aria-describedby')!);
    expect(hint?.textContent).toContain('Décoché');
  });

  it('confirms with the box as it is', () => {
    const { onConfirm } = open(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('confirms with the box unchecked', () => {
    const { onConfirm, onCancel } = open(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Surveiller ces dossiers (resynchronisation)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels the whole addition from "Annuler", and from Escape', () => {
    const { onConfirm, onCancel } = open(true);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
