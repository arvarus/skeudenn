// @vitest-environment jsdom
import { renderWithSkeudenn } from '@/test/skeudenn';

import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { MouseEvent, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BookDetails } from '@/components/book-row';
import { libraryEntry } from '@/test/fixtures';

const navigate = vi.hoisted(() => vi.fn());

// A link that navigates like the real one: its own click handler first, then the navigation.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    onClick,
  }: {
    children: ReactNode;
    to: string;
    params: object;
    onClick?: (event: MouseEvent) => void;
  }) => (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        navigate({ to, params });
      }}
    >
      {children}
    </a>
  ),
}));
vi.mock('@/components/book-cover', () => ({ BookCover: () => null }));

afterEach(() => {
  cleanup();
  navigate.mockClear();
});

const entry = libraryEntry('asterix', {
  title: 'Astérix le Gaulois',
  credits: [
    { personId: 'gos', firstName: 'René', lastName: 'Goscinny', role: 'writer' },
    { personId: 'ude', firstName: 'Albert', lastName: 'Uderzo', role: 'artist' },
  ],
});

describe('author names under a book', () => {
  it('link to the page of the author, without opening the book', () => {
    const onOpen = vi.fn();
    renderWithSkeudenn(<BookDetails entry={entry} view="full" onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('link', { name: 'Albert Uderzo' }));

    expect(navigate).toHaveBeenCalledWith({ to: '/authors/$personId', params: { personId: 'ude' } });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('leave the rest of the row opening the book', () => {
    const onOpen = vi.fn();
    renderWithSkeudenn(<BookDetails entry={entry} view="full" onOpen={onOpen} />);

    fireEvent.click(screen.getByText('Astérix le Gaulois'));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('are not shown in the compact mode, which has no credits line', () => {
    renderWithSkeudenn(<BookDetails entry={entry} view="compact" onOpen={vi.fn()} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
