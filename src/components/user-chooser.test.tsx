// @vitest-environment jsdom
import { renderWithSkeudenn } from '@/test/skeudenn';

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '@/shared/settings';
import type { UsersState } from '@/shared/users';
import { UserChooser } from './user-chooser';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/lib/user-choice', () => ({ userChoiceDone: () => false, markUserChoiceDone: () => undefined }));
vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({ settings: { ...DEFAULT_SETTINGS, askUserOnStartup: true }, update: vi.fn() }),
}));

const state: UsersState = {
  users: [
    { id: 'anne', nickname: 'Anne', avatar: null, avatarType: null },
    { id: 'bob', nickname: 'Bob', avatar: null, avatarType: null },
    { id: 'chloe', nickname: 'Chloé', avatar: null, avatarType: null },
  ],
  activeId: 'bob',
};
vi.mock('@/hooks/use-users', () => ({ useUsers: () => state }));

afterEach(cleanup);

/** The chooser over a stand-in for the rest of the layout (the sidebar's link). */
function open() {
  const switchUser = vi.fn(() => Promise.resolve({ status: 'ok' as const }));
  renderWithSkeudenn(
    <>
      <nav>
        <a href="#library">Bibliothèque</a>
      </nav>
      <UserChooser />
    </>,
    { users: { switch: switchUser } as never },
  );
  return { switchUser };
}

describe('UserChooser', () => {
  it('is a modal dialog named by its heading, with focus on the active user', async () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Qui lit ?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Bob' })));
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('hides the rest of the window from assistive technologies', () => {
    open();
    const link = screen.getByText('Bibliothèque');
    expect(link.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Bibliothèque' })).toBeNull();
  });

  it('keeps Tab and Shift-Tab inside the chooser', () => {
    open();
    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Anne' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(checkbox);
  });

  it('is not dismissed by Escape', () => {
    open();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Bob' }), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('switches to the user picked with the keyboard', async () => {
    const { switchUser } = open();
    const anne = screen.getByRole('button', { name: 'Anne' });
    anne.focus();
    // A native button turns Enter and Space into a click.
    fireEvent.click(anne);
    await waitFor(() => expect(switchUser).toHaveBeenCalledWith('anne'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
