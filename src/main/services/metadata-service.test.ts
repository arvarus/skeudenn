import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import type { MetadataCandidate } from '../../shared/metadata';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import { resetBedethequeState } from './bedetheque';
import { comicVineCredits } from './comic-vine';
import { googleBooksCandidate } from './google-books';
import type { HttpOptions } from './http-json';
import { fetchMetadataPage, rankCandidates, searchMetadata } from './metadata-service';

// The user-facing messages are checked in French; English is the interface's default.
beforeAll(() => applyLanguage('fr'));
beforeEach(() => resetBedethequeState(0));

/** A fake `fetch` answering each URL with the first route whose pattern it matches. */
function fakeFetch(routes: [RegExp, unknown, number?][]) {
  return vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(async (input) => {
    const url = String(input);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) throw new TypeError(`fetch failed: ${url}`);
    return new Response(JSON.stringify(route[1]), { status: route[2] ?? 200 });
  });
}

function http(fetch: ReturnType<typeof fakeFetch>): HttpOptions {
  return { fetch: fetch as unknown as typeof globalThis.fetch, userAgent: 'Skeudenn/test', timeoutMs: 1000 };
}

const comicVineOk = <T>(results: T) => ({ status_code: 1, error: 'OK', results });

const issue = {
  id: 6,
  name: 'Days of Future Past',
  issue_number: '141',
  cover_date: '1981-01-01',
  store_date: null,
  site_detail_url: 'https://comicvine.gamespot.com/x-men-141/4000-6/',
  image: { small_url: 'https://img/small.jpg' },
  volume: { id: 2, name: 'The Uncanny X-Men' },
};

const comicVineRoutes: [RegExp, unknown][] = [
  [/\/search\/.*resources=volume/, comicVineOk([{ id: 2 }])],
  [/\/issues\/.*filter=volume%3A2%2Cissue_number%3A141/, comicVineOk([issue])],
  [
    /\/issue\/4000-6\//,
    comicVineOk({
      person_credits: [
        { name: 'Chris Claremont', role: 'writer' },
        { name: 'John Byrne', role: 'penciler, cover' },
        { name: 'Jim Shooter', role: 'editor' },
      ],
    }),
  ],
];

const googleVolume = {
  id: 'g1',
  volumeInfo: {
    title: 'Astérix - Tome 3 - Astérix et les Goths',
    authors: ['René Goscinny', 'Albert Uderzo'],
    publishedDate: '1963',
    language: 'fr',
    infoLink: 'http://books.google.com/books?id=g1',
    imageLinks: { smallThumbnail: 'http://books.google.com/thumb' },
  },
};

describe('comicVineCredits', () => {
  it('maps the known roles, one credit per role, and drops the others', () => {
    expect(comicVineCredits([{ name: 'John Byrne', role: 'penciler, inker, editor' }])).toEqual([
      { firstName: 'John', lastName: 'Byrne', role: 'artist' },
      { firstName: 'John', lastName: 'Byrne', role: 'inker' },
    ]);
    // "artist" and "penciler" are the same role for us.
    expect(comicVineCredits([{ name: 'Moebius', role: 'artist, penciler' }])).toEqual([
      { firstName: '', lastName: 'Moebius', role: 'artist' },
    ]);
  });
});

describe('googleBooksCandidate', () => {
  it('reads series and volume from the title, authors with the generic role, and forces https', () => {
    expect(googleBooksCandidate(googleVolume)).toEqual({
      source: 'googlebooks',
      sourceId: 'g1',
      sourceUrl: 'https://books.google.com/books?id=g1',
      coverUrl: 'https://books.google.com/thumb',
      title: 'Astérix et les Goths',
      series: 'Astérix',
      volume: '3',
      releaseDate: '1963',
      language: 'fr',
      credits: [
        { firstName: 'René', lastName: 'Goscinny', role: 'author' },
        { firstName: 'Albert', lastName: 'Uderzo', role: 'author' },
      ],
    });
  });

  it('falls back to the series info for the volume number', () => {
    const candidate = googleBooksCandidate({
      id: 'g2',
      volumeInfo: { title: 'Arctic Nation', seriesInfo: { bookDisplayNumber: '2' } },
    });
    expect(candidate).toMatchObject({ title: 'Arctic Nation', series: null, volume: '2', credits: [] });
  });
});

describe('rankCandidates', () => {
  const candidate = (sourceId: string, volume: string | null) => ({ sourceId, volume }) as MetadataCandidate;

  it('puts the candidates with the requested volume first, keeping the order otherwise', () => {
    const ranked = rankCandidates([candidate('a', '2'), candidate('b', '03'), candidate('c', null), candidate('d', '3')], {
      text: 'x',
      volume: '3',
    });
    expect(ranked.map((c) => c.sourceId)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('searchMetadata', () => {
  const settings = { ...DEFAULT_SETTINGS, comicVineApiKey: 'KEY' };

  it('only queries the sources the query names', async () => {
    const fetch = fakeFetch([...comicVineRoutes, [/googleapis/, { items: [] }]]);
    await searchMetadata({ text: 'X-Men', volume: '141', sources: ['googlebooks'] }, settings, http(fetch));
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.includes('googleapis'))).toBe(true);
  });

  it('leaves Bédéthèque out unless it is named or on by default', async () => {
    const fetch = fakeFetch([[/googleapis/, { items: [] }]]);
    await searchMetadata({ text: 'Blacksad', volume: '1' }, settings, http(fetch));
    expect(fetch.mock.calls.map(([url]) => String(url)).some((url) => url.includes('bdgest.com'))).toBe(false);
  });

  it('queries Bédéthèque when the query names it, even if it is not on by default', async () => {
    const fetch = fakeFetch([[/bdgest\.com\/ajax\/tout/, []]]);
    const result = await searchMetadata({ text: 'Blacksad', volume: '1', sources: ['bedetheque'] }, settings, http(fetch));
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['https://www.bdgest.com/ajax/tout?term=Blacksad']);
    expect(result).toEqual({ status: 'ok', candidates: [], errors: [] });
  });

  it('queries Bédéthèque when no source is named and it is on by default', async () => {
    const fetch = fakeFetch([
      [/bdgest\.com\/ajax\/tout/, []],
      [/googleapis/, { items: [] }],
    ]);
    await searchMetadata({ text: 'Blacksad', volume: null }, { ...settings, bedethequeSearchByDefault: true }, http(fetch));
    expect(fetch.mock.calls.map(([url]) => String(url)).some((url) => url.includes('bdgest.com'))).toBe(true);
  });

  it('is an error when the named sources are all unavailable', async () => {
    const result = await searchMetadata({ text: 'X', volume: null, sources: [] }, settings, http(fakeFetch([])));
    expect(result.status).toBe('error');
  });

  it('finds the issue in the matching series on Comic Vine, with its credits', async () => {
    const fetch = fakeFetch([...comicVineRoutes, [/googleapis/, {}]]);
    const result = await searchMetadata({ text: 'X-Men', volume: '141' }, settings, http(fetch));

    expect(result).toEqual({
      status: 'ok',
      errors: [],
      candidates: [
        {
          source: 'comicvine',
          sourceId: '6',
          sourceUrl: issue.site_detail_url,
          coverUrl: 'https://img/small.jpg',
          title: 'Days of Future Past',
          series: 'The Uncanny X-Men',
          volume: '141',
          releaseDate: '1981-01-01',
          language: null,
          credits: [
            { firstName: 'Chris', lastName: 'Claremont', role: 'writer' },
            { firstName: 'John', lastName: 'Byrne', role: 'artist' },
            { firstName: 'John', lastName: 'Byrne', role: 'cover' },
          ],
        },
      ],
    });
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls.every((url) => !url.includes('comicvine') || url.includes('api_key=KEY'))).toBe(true);
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { 'User-Agent': 'Skeudenn/test' } });
  });

  it('drops a release date that does not exist instead of storing it', async () => {
    const fetch = fakeFetch([
      [/\/search\/.*resources=volume/, comicVineOk([{ id: 2 }])],
      [/\/issues\//, comicVineOk([])],
      [/\/search\/.*resources=issue.*query=X-Men\+141/, comicVineOk([{ ...issue, store_date: '2024-99-99' }])],
      [/\/issue\/4000-6\//, comicVineOk({})],
    ]);
    const result = await searchMetadata({ text: 'X-Men', volume: '141' }, { ...settings, googleBooksEnabled: false }, http(fetch));
    expect(result.status === 'ok' && result.candidates[0].releaseDate).toBeNull();
  });

  it('falls back to a plain issue search when the series has no such issue', async () => {
    const fetch = fakeFetch([
      [/\/search\/.*resources=volume/, comicVineOk([{ id: 2 }])],
      [/\/issues\//, comicVineOk([])],
      [/\/search\/.*resources=issue.*query=X-Men\+141/, comicVineOk([issue])],
      [/\/issue\/4000-6\//, comicVineOk({})],
    ]);
    const result = await searchMetadata({ text: 'X-Men', volume: '141' }, { ...settings, googleBooksEnabled: false }, http(fetch));
    expect(result).toMatchObject({ status: 'ok', candidates: [{ sourceId: '6', credits: [] }] });
  });

  it('skips Comic Vine without an API key and passes the Google key when set', async () => {
    const fetch = fakeFetch([[/googleapis/, { items: [googleVolume] }]]);
    const result = await searchMetadata(
      { text: 'Astérix', volume: '3' },
      { ...DEFAULT_SETTINGS, googleBooksApiKey: 'GKEY' },
      http(fetch),
    );

    expect(result).toMatchObject({ status: 'ok', candidates: [{ source: 'googlebooks', series: 'Astérix' }] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get('q')).toBe('Astérix 3');
    expect(url.searchParams.get('key')).toBe('GKEY');
  });

  it('reports a failing source next to the results of the other one', async () => {
    const fetch = fakeFetch([
      [/comicvine/, { status_code: 100, error: 'Invalid API Key', results: [] }, 401],
      [/googleapis/, { items: [googleVolume] }],
    ]);
    const result = await searchMetadata({ text: 'Astérix', volume: null }, settings, http(fetch));
    expect(result).toMatchObject({
      status: 'ok',
      candidates: [{ source: 'googlebooks' }],
      errors: ['Comic Vine : clé API invalide.'],
    });
  });

  it('is an error when every source fails', async () => {
    const fetch = fakeFetch([[/googleapis/, { error: { message: 'Invalid value' } }, 400]]);
    const result = await searchMetadata({ text: 'Astérix', volume: null }, DEFAULT_SETTINGS, http(fetch));
    expect(result).toEqual({ status: 'error', message: 'Google Books : Invalid value' });
  });

  it('explains an exhausted quota in French', async () => {
    const fetch = fakeFetch([[/googleapis/, { error: { message: 'Quota exceeded for quota metric' } }, 429]]);
    const result = await searchMetadata({ text: 'Astérix', volume: null }, DEFAULT_SETTINGS, http(fetch));
    expect(result).toMatchObject({ status: 'error', message: expect.stringMatching(/^Google Books : quota de requêtes dépassé/) });
  });

  it('reports an unreachable service in French', async () => {
    const result = await searchMetadata({ text: 'Astérix', volume: null }, DEFAULT_SETTINGS, http(fakeFetch([])));
    expect(result).toEqual({ status: 'error', message: 'Google Books : impossible de joindre le service.' });
  });

  it('is an error when no source is enabled, or the query is empty', async () => {
    const fetch = fakeFetch([]);
    const none = { ...DEFAULT_SETTINGS, googleBooksEnabled: false };
    expect(await searchMetadata({ text: 'Astérix', volume: null }, none, http(fetch))).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/Aucune source/),
    });
    expect(await searchMetadata({ text: '  ', volume: null }, DEFAULT_SETTINGS, http(fetch))).toMatchObject({
      status: 'error',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fetchMetadataPage', () => {
  it('returns errors as a result, not as a rejection', async () => {
    expect(await fetchMetadataPage('https://example.com/', http(fakeFetch([])))).toMatchObject({
      status: 'error',
      message: expect.stringMatching(/^Ce lien n'est pas celui d'une page d'un site pris en charge/),
    });
    expect(
      await fetchMetadataPage('https://www.bedetheque.com/BD-X-1.html', http(fakeFetch([]))),
    ).toEqual({ status: 'error', message: 'Bédéthèque : impossible de joindre le service.' });
  });
});
