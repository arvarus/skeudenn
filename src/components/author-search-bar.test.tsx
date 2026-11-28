// @vitest-environment jsdom
import { renderWithSkeudenn } from '@/test/skeudenn';

import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthorSearchBar, AuthorSearchIcon } from '@/components/author-search-bar';
import { AUTHOR_SEARCH_PROVIDERS } from '@/shared/author-search';

afterEach(cleanup);

function setup(person: { firstName: string; lastName: string }) {
  const openAuthorSearch = vi.fn<(provider: string, name: string) => Promise<void>>(() => Promise.resolve());
  renderWithSkeudenn(<AuthorSearchBar person={person} />, { app: { openAuthorSearch } });
  return openAuthorSearch;
}

// `renderWithSkeudenn` renders in French.
describe('AuthorSearchBar', () => {
  it('shows one labelled button per site, with the name in the label and the tooltip', () => {
    setup({ firstName: 'René', lastName: 'Goscinny' });

    expect(screen.getAllByRole('button')).toHaveLength(AUTHOR_SEARCH_PROVIDERS.length);
    const button = screen.getByRole('button', { name: 'Rechercher « René Goscinny » sur Wikipédia' });
    expect(button.getAttribute('title')).toBe('Rechercher « René Goscinny » sur Wikipédia');
  });

  it('sends the site and the name of the person on click', () => {
    const openAuthorSearch = setup({ firstName: '', lastName: 'Hergé' });

    fireEvent.click(screen.getByRole('button', { name: 'Rechercher « Hergé » sur Comic Vine' }));

    expect(openAuthorSearch).toHaveBeenCalledExactlyOnceWith('comicvine', 'Hergé');
  });

  it('is absent when the person has no name', () => {
    setup({ firstName: ' ', lastName: '' });

    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('AuthorSearchIcon', () => {
  it('draws a local monogram for every site of the list', () => {
    for (const provider of AUTHOR_SEARCH_PROVIDERS) {
      const { container, unmount } = renderWithSkeudenn(<AuthorSearchIcon icon={provider.icon} />);
      expect(container.querySelector(`[data-testid="author-search-icon-${provider.icon}"]`)).not.toBeNull();
      unmount();
    }
  });

  it('falls back to a generic icon for an unknown key', () => {
    const { container } = renderWithSkeudenn(<AuthorSearchIcon icon="toString" />);

    expect(container.querySelector('[data-testid^="author-search-icon"]')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
