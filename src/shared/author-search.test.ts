import { describe, expect, it } from 'vitest';

import {
  AUTHOR_SEARCH_PROVIDERS,
  authorSearchUrl,
  buildSearchUrl,
  isAuthorSearchProviderId,
  normalizeAuthorName,
} from './author-search';

const provider = (id: string) => {
  const found = AUTHOR_SEARCH_PROVIDERS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`unknown provider ${id}`);
  return found;
};

describe('normalizeAuthorName', () => {
  it('turns "Last, First" back into "First Last"', () => {
    expect(normalizeAuthorName('Goscinny, René')).toBe('René Goscinny');
    expect(normalizeAuthorName('Van Hamme,Jean')).toBe('Jean Van Hamme');
  });

  it('keeps a name as is, spaces collapsed, several authors included', () => {
    expect(normalizeAuthorName('  Jean   Giraud ')).toBe('Jean Giraud');
    expect(normalizeAuthorName('Hergé')).toBe('Hergé');
    expect(normalizeAuthorName('Goscinny & Uderzo')).toBe('Goscinny & Uderzo');
  });

  it('drops control characters and answers an empty string for nothing to search', () => {
    expect(normalizeAuthorName('Her\u0000gé\n')).toBe('Her gé');
    expect(normalizeAuthorName('   ')).toBe('');
    expect(normalizeAuthorName('')).toBe('');
  });
});

describe('buildSearchUrl', () => {
  it('encodes accents', () => {
    expect(buildSearchUrl(provider('wikipedia'), 'Hergé')).toBe('https://fr.wikipedia.org/w/index.php?search=Herg%C3%A9');
  });

  it('encodes non-Latin characters', () => {
    expect(buildSearchUrl(provider('myanimelist'), '尾田栄一郎')).toBe(
      'https://myanimelist.net/people.php?q=%E5%B0%BE%E7%94%B0%E6%A0%84%E4%B8%80%E9%83%8E',
    );
  });

  it('encodes spaces and reserved characters, the ones encodeURIComponent leaves included', () => {
    expect(buildSearchUrl(provider('comicvine'), "Jean-Claude O'Neil (Jr) & co!")).toBe(
      'https://comicvine.gamespot.com/search/?i=person&q=Jean-Claude%20O%27Neil%20%28Jr%29%20%26%20co%21',
    );
  });

  it('flips "Last, First" before searching', () => {
    expect(buildSearchUrl(provider('wikipedia'), 'Goscinny, René')).toBe('https://fr.wikipedia.org/w/index.php?search=Ren%C3%A9%20Goscinny');
  });

  it('keeps the quotes and the extra words of the Google pattern', () => {
    expect(buildSearchUrl(provider('google'), 'Moebius')).toBe('https://www.google.com/search?q=%22Moebius%22+auteur+bande+dessin%C3%A9e');
  });

  it('builds the Bédéthèque search of the whole site', () => {
    expect(buildSearchUrl(provider('bedetheque'), 'Moebius')).toBe('https://www.bedetheque.com/search/tout?RechTexte=Moebius&RechWhere=1');
  });

  it('gives no URL for an empty name', () => {
    expect(buildSearchUrl(provider('wikipedia'), '')).toBeNull();
    expect(buildSearchUrl(provider('wikipedia'), '  \n ')).toBeNull();
  });

  it('never lets the name change the query structure', () => {
    const url = buildSearchUrl(provider('wikipedia'), 'x&search=evil#frag $& $1') ?? '';
    expect(new URL(url).searchParams.getAll('search')).toEqual(['x&search=evil#frag $& $1']);
    expect(new URL(url).hash).toBe('');
  });
});

describe('AUTHOR_SEARCH_PROVIDERS', () => {
  it('has distinct ids and https patterns with one placeholder', () => {
    const ids = AUTHOR_SEARCH_PROVIDERS.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const candidate of AUTHOR_SEARCH_PROVIDERS) {
      expect(candidate.urlPattern.startsWith('https://')).toBe(true);
      expect(candidate.urlPattern.split('{q}')).toHaveLength(2);
    }
  });
});

describe('authorSearchUrl', () => {
  it('builds the address of a known provider, on its own host', () => {
    for (const candidate of AUTHOR_SEARCH_PROVIDERS) {
      const url = authorSearchUrl(candidate.id, 'Moebius');
      expect(url).not.toBeNull();
      const parsed = new URL(url ?? '');
      expect(parsed.protocol).toBe('https:');
      expect(parsed.hostname).toBe(new URL(candidate.urlPattern.replace('{q}', 'x')).hostname);
    }
  });

  it('refuses an unknown provider and an empty name', () => {
    expect(authorSearchUrl('evil', 'Moebius')).toBeNull();
    expect(authorSearchUrl('__proto__', 'Moebius')).toBeNull();
    expect(authorSearchUrl('wikipedia', ' ')).toBeNull();
  });
});

describe('isAuthorSearchProviderId', () => {
  it('only accepts the keys of the list', () => {
    expect(isAuthorSearchProviderId('google')).toBe(true);
    expect(isAuthorSearchProviderId('Google')).toBe(false);
    expect(isAuthorSearchProviderId('toString')).toBe(false);
    expect(isAuthorSearchProviderId(3)).toBe(false);
    expect(isAuthorSearchProviderId(undefined)).toBe(false);
  });
});
