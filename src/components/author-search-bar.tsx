import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { AUTHOR_SEARCH_PROVIDERS, normalizeAuthorName } from '@/shared/author-search';
import { formatPersonName } from '@/shared/title-parsing';
import type { PersonName } from '@/shared/library';

/**
 * What each provider's `icon` key draws: a short monogram, set in a rounded square. The sites'
 * own logos are trademarks and the CSP allows no remote image, so the buttons carry simple local
 * glyphs; a key with no monogram (a provider added without one) shows a generic globe.
 */
const MONOGRAMS: Record<string, string> = {
  wikipedia: 'W',
  bedetheque: 'BD',
  comicvine: 'CV',
  myanimelist: 'MAL',
  google: 'G',
};

/** The drawing of a provider's button, from its `icon` key (see {@link MONOGRAMS}). */
export function AuthorSearchIcon({ icon }: { icon: string }) {
  const monogram = Object.hasOwn(MONOGRAMS, icon) ? MONOGRAMS[icon] : undefined;
  if (monogram === undefined) return <Globe aria-hidden="true" />;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-testid={`author-search-icon-${icon}`}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={monogram.length > 2 ? 8 : 10.5}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="currentColor"
      >
        {monogram}
      </text>
    </svg>
  );
}

/**
 * A row of icon buttons that open, in the system browser, a search for a person on the reference
 * sites (`AUTHOR_SEARCH_PROVIDERS`). The app only builds the address (in the main process): nothing
 * is fetched. Nothing is shown when the person has no name to search.
 */
export function AuthorSearchBar({ person }: { person: PersonName }) {
  const { t } = useTranslation('authors');
  const name = normalizeAuthorName(formatPersonName(person));
  if (name === '') return null;

  return (
    <div role="group" aria-label={t('searchGroup')} className="mt-2 flex flex-wrap items-center gap-1.5">
      {AUTHOR_SEARCH_PROVIDERS.map((provider) => {
        const label = t('searchOn', { name, site: provider.label });
        return (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            size="icon-sm"
            title={label}
            aria-label={label}
            onClick={() => void window.skeudenn.app.openAuthorSearch(provider.id, name).catch(() => undefined)}
          >
            <AuthorSearchIcon icon={provider.icon} />
          </Button>
        );
      })}
    </div>
  );
}
