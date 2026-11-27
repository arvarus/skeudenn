import { beforeAll, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import type { HttpOptions } from './http-json';
import { fetchStructuredPage, parseStructuredPage } from './structured-page';

// The user-facing messages are checked in French; English is the interface's default.
beforeAll(() => applyLanguage('fr'));

const BDFUGUE = 'https://www.bdfugue.com/knights-of-sidonia-tome-15';
const NAUTILJON = 'https://www.nautiljon.com/mangas/knights+of+sidonia/volume-1,12218.html';

/** A page carrying a schema.org Book block, as a bookshop embeds it for search engines. */
const bookPage = `<html><head>
<meta property="og:title" content="Fallback title">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Book","name":"Knights of Sidonia - Tome 15",
"image":"/media/sidonia-15.jpg","author":[{"@type":"Person","name":"Tsutomu Nihei"},{"@type":"Person","name":"Collectif"}],
"datePublished":"2019-06-12T00:00:00+02:00","inLanguage":"fr-FR"}</script></head><body></body></html>`;

describe('parseStructuredPage', () => {
  it('reads the book from its JSON-LD block', () => {
    expect(parseStructuredPage(bookPage, BDFUGUE, 'bdfugue')).toEqual({
      source: 'bdfugue',
      sourceId: '/knights-of-sidonia-tome-15',
      sourceUrl: BDFUGUE,
      coverUrl: 'https://www.bdfugue.com/media/sidonia-15.jpg',
      title: expect.any(String),
      series: 'Knights of Sidonia',
      volume: '15',
      releaseDate: '2019-06-12',
      language: 'fr',
      credits: [{ firstName: 'Tsutomu', lastName: 'Nihei', role: 'author' }],
    });
  });

  it('falls back to the Open Graph tags and drops the site name from the title', () => {
    const html = `<head><meta property="og:title" content="Knights of Sidonia Vol. 1 | Nautiljon">
      <meta content="https://www.nautiljon.com/images/1.jpg" property="og:image"></head>`;
    expect(parseStructuredPage(html, NAUTILJON, 'nautiljon')).toMatchObject({
      series: 'Knights of Sidonia',
      volume: '1',
      coverUrl: 'https://www.nautiljon.com/images/1.jpg',
      credits: [],
      releaseDate: null,
    });
  });

  it('drops a date that does not exist', () => {
    const html = `<script type="application/ld+json">{"@type":"Book","name":"Blacksad","datePublished":"2024-99-99"}</script>`;
    expect(parseStructuredPage(html, BDFUGUE, 'bdfugue').releaseDate).toBeNull();
    const french = `<script type="application/ld+json">{"@type":"Book","name":"Blacksad","datePublished":"31/02/2024"}</script>`;
    expect(parseStructuredPage(french, BDFUGUE, 'bdfugue').releaseDate).toBeNull();
  });

  it('ignores a damaged JSON-LD block', () => {
    const html = `<script type="application/ld+json">{oops</script><meta property="og:title" content="Blacksad">`;
    expect(parseStructuredPage(html, BDFUGUE, 'bdfugue')).toMatchObject({ title: 'Blacksad', series: null, volume: null });
  });

  it('refuses a page with no title', () => {
    expect(() => parseStructuredPage('<html></html>', BDFUGUE, 'bdfugue')).toThrow(/BDfugue : cette page ne décrit pas un livre/);
  });
});

describe('fetchStructuredPage', () => {
  const http = (body: string, status = 200): HttpOptions => ({
    fetch: vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch,
    userAgent: 'Skeudenn/test',
    timeoutMs: 1000,
  });

  it('downloads and parses the page', async () => {
    expect(await fetchStructuredPage(BDFUGUE, http(bookPage))).toMatchObject({ source: 'bdfugue', volume: '15' });
  });

  it('refuses a link to another site', async () => {
    await expect(fetchStructuredPage('https://example.com/x', http(bookPage))).rejects.toThrow(/n'est pas celui/);
  });

  it('reports a missing page', async () => {
    await expect(fetchStructuredPage(NAUTILJON, http('', 404))).rejects.toThrow(/Nautiljon/);
  });
});

describe('parseStructuredPage: hostile or broken pages', () => {
  // A page is untrusted and up to 5 MB, parsed synchronously in the main process: every pattern must be
  // linear. Each page below holds about 1 MB of what made a former pattern quadratic (minutes, not seconds).

  /** About 1 MB of `piece`, repeated. */
  function flood(piece: string): string {
    return piece.repeat(Math.ceil(1_000_000 / piece.length));
  }

  it.each([
    ['full of "<"', flood('<')],
    ['full of unclosed scripts', flood('<script ')],
    ['full of unclosed JSON-LD scripts', flood('<script type="application/ld+json" ')],
    ['full of JSON-LD scripts with no end', flood('<script type="application/ld+json">')],
    ['full of unclosed meta tags', flood('<meta ')],
    ['full of unclosed meta tags naming the key', flood('<meta property="og:title" ')],
    ['full of unclosed meta tags with a content', flood('<meta content="x" ')],
    ['full of meta tags with quotes left open', flood(`<meta content="x' property='og:title`)],
    ['whose title is full of separators', `<meta property="og:title" content="a${flood(', ')}b T1 c${flood(' -')}d">`],
  ])('reads a page %s in linear time', (_, html) => {
    const started = performance.now();
    try {
      parseStructuredPage(html, BDFUGUE, 'bdfugue');
    } catch {
      // No title: what matters here is the time.
    }
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('still reads the meta tags whose quoted values hold "<" or ">"', () => {
    const html = `<meta content="Tome 2 <b>" name="x"><meta property="og:title" content="A > B - Tome 2"><meta content="fr_FR" property="og:locale">`;
    const candidate = parseStructuredPage(html, BDFUGUE, 'bdfugue');
    expect(candidate.series).toBe('A > B');
    expect(candidate.volume).toBe('2');
    expect(candidate.language).toBe('fr');
  });
});
