/**
 * Reads a book's information from a Bédéthèque album page, whose link the user pasted, or finds the
 * album of a series by name and volume. Bédéthèque (the BDGest' database) has no public API: the
 * pages' HTML is parsed, and the series is found through the JSON the BDGest search box uses.
 * @module
 */
import { t } from '../../shared/i18n';
import type { CreditInput, CreditRole } from '../../shared/library';
import { isBedethequeAlbumUrl, type MetadataCandidate, type MetadataQuery } from '../../shared/metadata';
import { splitPersonName } from '../../shared/title-parsing';
import { getHtml, getJson, type HttpOptions } from './http-json';
import { lookupLog } from './lookup-log';
import { createPromiseCache } from './promise-cache';
import { createRequestPacer, type RequestPacer } from './request-pacer';

const SOURCE = 'Bédéthèque';

/** Bédéthèque's credit labels; the others ("Traduction", "Préface", "Autres"…) are dropped. */
const ROLES: Record<string, CreditRole> = {
  'scénario': 'writer',
  dessin: 'artist',
  couleurs: 'colorist',
  encrage: 'inker',
  lettrage: 'letterer',
  couverture: 'cover',
};

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the HTML entities found in Bédéthèque's text (named basics and numeric ones). */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** The text of an HTML fragment: tags dropped, entities decoded, whitespace collapsed. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/** The `content` of the first `<meta itemprop="…">` in `html`. */
function metaItemprop(html: string, prop: string): string | null {
  const match = new RegExp(`<meta\\s+itemprop="${prop}"\\s+content="([^"]*)"`, 'i').exec(html);
  return match ? decodeEntities(match[1]).trim() || null : null;
}

/**
 * The release date: the legal deposit ("Dépôt légal") is `MM/YYYY`, with the exact day in
 * parentheses when Bédéthèque knows it. Its `datePublished` meta pads an unknown day with `01`, so
 * it is only used when that day is spelled out.
 */
function releaseDate(album: string): string | null {
  const deposit = /<li title="Dépôt légal">([\s\S]*?)<\/li>/i.exec(album)?.[1];
  if (!deposit) {
    return null;
  }
  const published = metaItemprop(deposit, 'datePublished');
  if (published && /^\d{4}-\d{2}-\d{2}$/.test(published) && /\(\s*\d{1,2}(er)? \S+ \d{4}\s*\)/.test(textOf(deposit))) {
    return published;
  }
  const shown = textOf(/<b>([\s\S]*?)<\/b>/i.exec(deposit)?.[1] ?? '');
  const monthYear = /^(\d{2})\/(\d{4})$/.exec(shown);
  if (monthYear) {
    return `${monthYear[2]}-${monthYear[1]}`;
  }
  return /^\d{4}$/.test(shown) ? shown : null;
}

/**
 * The album's credits, in the page's order. Placeholders such as `<N&B>` or `<Collectif>` aren't
 * people and are dropped; a person credited twice for the same role is kept once.
 */
function credits(album: string): CreditInput[] {
  const list = /<div class="[^"]*\bliste-auteurs\b[^"]*">([\s\S]*?)<\/div>/i.exec(album)?.[1] ?? '';
  const result: CreditInput[] = [];
  const seen = new Set<string>();
  // Attribute values are skipped as a whole: a placeholder's `title` holds a raw "<N&B>".
  for (const match of list.matchAll(/<a\b(?:"[^"]*"|[^">])*>([\s\S]*?)<\/a>\s*<small>([\s\S]*?)<\/small>/gi)) {
    const name = textOf(match[1]);
    const role = ROLES[textOf(match[2]).replace(/[()]/g, '').trim().toLowerCase()];
    if (!role || !name || name.startsWith('<')) {
      continue;
    }
    const credit = { ...splitPersonName(name), role };
    const key = `${credit.lastName}|${credit.firstName}|${role}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(credit);
    }
  }
  return result;
}

/**
 * Parses a Bédéthèque album page. Only its main album block (`<section class="bdt-ah">`) is read,
 * not the series' other albums or editions further down the page. Throws a translated message when
 * the page has no album block.
 */
export function parseBedethequeAlbum(html: string, url: string): MetadataCandidate {
  const album = /<section class="bdt-ah">([\s\S]*?)<\/section>/i.exec(html)?.[1];
  if (!album) {
    const fromSeries = parseSeriesPageAlbum(html, url);
    if (fromSeries) {
      return fromSeries;
    }
    throw new Error(t('errors:metadata.notAlbumPage', { source: SOURCE }));
  }

  const series = textOf(/<h1>([\s\S]*?)<\/h1>/i.exec(album)?.[1] ?? '') || null;
  // "6<span class="bdt-numa"></span>. Sibylline et les cravates noires": the number, an optional
  // letter ("12a"), then the title. A one-shot has no number.
  const subtitle = textOf(/<h2 class="bdt-ah-sub">([\s\S]*?)<\/h2>/i.exec(album)?.[1] ?? '');
  const numbered = /^([^\s.]+)\s*\.\s*(.*)$/.exec(subtitle);
  const volume = numbered ? numbered[1] : null;
  // A one-shot has no subtitle: its title is the series' name.
  const title = (numbered ? numbered[2] : subtitle) || metaItemprop(album, 'alternativeheadline') || series;

  return {
    source: 'bedetheque',
    sourceId: /-(\d+)\.html$/i.exec(new URL(url).pathname)?.[1] ?? url,
    sourceUrl: url,
    coverUrl: /<img\s+itemprop="image"\s+src="([^"]+)"/i.exec(album)?.[1] ?? null,
    title: title || null,
    series,
    volume,
    releaseDate: releaseDate(album),
    language: metaItemprop(album, 'inLanguage'),
    credits: credits(album),
  };
}

/**
 * The album of a one-shot read from its series page. The site shows a one-shot's album page as the
 * series page (its canonical address), where the album is the `bdt-edition--detail` article: name,
 * cover and a `<dt>`/`<dd>` sheet (credits by role label, legal deposit). Null when the page has no
 * such article. The language isn't spelled as a code there, so it is left out.
 */
function parseSeriesPageAlbum(html: string, url: string): MetadataCandidate | null {
  const article = /<article\b[^>]*\bbdt-edition--detail\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1];
  if (!article) {
    return null;
  }
  const sheet = new Map<string, string[]>();
  for (const field of article.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const label = textOf(field[1]).toLowerCase();
    sheet.set(label, [...(sheet.get(label) ?? []), field[2]]);
  }
  const result: CreditInput[] = [];
  const seen = new Set<string>();
  for (const [label, role] of Object.entries(ROLES)) {
    for (const value of sheet.get(label) ?? []) {
      for (const person of value.matchAll(/<a\b(?:"[^"]*"|[^">])*>([\s\S]*?)<\/a>/gi)) {
        const name = textOf(person[1]);
        const key = `${name}|${role}`.toLowerCase();
        if (name && !name.startsWith('<') && !seen.has(key)) {
          seen.add(key);
          result.push({ ...splitPersonName(name), role });
        }
      }
    }
  }
  const deposit = textOf(sheet.get('dépôt légal')?.[0] ?? '');
  const monthYear = /^(\d{2})\/(\d{4})/.exec(deposit);
  const title = textOf(/<span itemprop="name">([\s\S]*?)<\/span>\s*<\/a>/i.exec(article)?.[1] ?? '');
  return {
    source: 'bedetheque',
    sourceId: /-(\d+)\.html$/i.exec(new URL(url).pathname)?.[1] ?? url,
    sourceUrl: url,
    coverUrl: /<img\s+itemprop="image"\s+src="([^"]+)"/i.exec(article)?.[1] ?? null,
    title: title || null,
    series: textOf(/<section class="bdt-ah bdt-ah--serie">[\s\S]*?<h1>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(html)?.[1] ?? '') || null,
    volume: null,
    releaseDate: monthYear ? `${monthYear[2]}-${monthYear[1]}` : /^\d{4}$/.test(deposit) ? deposit : null,
    language: null,
    credits: result,
  };
}

/**
 * Downloads and parses a Bédéthèque album page (remembered for a while, and spaced from the other
 * requests to the site). Throws a translated message on failure.
 */
export async function fetchBedethequeAlbum(url: string, http: HttpOptions): Promise<MetadataCandidate> {
  if (!isBedethequeAlbumUrl(url)) {
    throw new Error(t('errors:metadata.notAlbumUrl', { source: SOURCE }));
  }
  const normalized = new URL(url.trim());
  normalized.protocol = 'https:';
  normalized.hash = '';
  const page = normalized.toString();
  return albumPages.get(page, async () => parseBedethequeAlbum(await getHtml(page, paced(http), SOURCE), page));
}

/** The site's search box: the series (ids `S123`) and authors (`A123`) whose name contains the term. */
const SERIES_SEARCH_URL = 'https://www.bdgest.com/ajax/tout';
/** Shorter terms are refused by the search box itself. */
const MIN_SEARCH_LENGTH = 3;
/** The page that redirects to a series' page from its id, as the site's own search box does. */
const SERIES_PAGE_URL = 'https://www.bedetheque.com/serie/index/s/';
/** At most this many albums of a series are offered when none could be told to be the right one. */
const MAX_SERIES_CANDIDATES = 30;
/** How long what the site answered is remembered, so asking again (another volume, the same search) costs no request. */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** The pages and answers kept per kind. */
const CACHE_SIZE = 30;
/** Least time between two requests to the site, whoever asks: a burst of searches is spread out over time. */
const MIN_REQUEST_INTERVAL_MS = 1000;

/** A series found by the search box. */
export interface BedethequeSeries {
  /** The numeric part of the site's `S<id>`. */
  id: string;
  /** The name shown, with the language in parentheses for a translation: `Blacksad (en allemand)`. */
  label: string;
}

/** What a line of a series' album list is: a numbered album, a special issue or an omnibus. */
export type SeriesAlbumKind = 'album' | 'hs' | 'int';

/** One line of a series' album list. */
export interface SeriesAlbum {
  url: string;
  /** The number as the site writes it: `1`, `HS`, `HS2`, `INT01`; empty for a one-shot. */
  number: string;
  title: string;
  /** `YYYY-MM`, or `YYYY`; null when the list shows none. */
  releaseDate: string | null;
  kind: SeriesAlbumKind;
}

/** Lower case, no accents, letters and digits only: how series names are compared. */
function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The series in the search box's answer (an array of `{ id, label, category }`, labels HTML-escaped); anything else is ignored. */
export function parseSeriesSearch(body: unknown): BedethequeSeries[] {
  if (!Array.isArray(body)) {
    return [];
  }
  const series: BedethequeSeries[] = [];
  for (const item of body) {
    const { id, label } = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
    const match = typeof id === 'string' ? /^S(\d+)$/.exec(id) : null;
    // The search box HTML-escapes its labels (`X-Men (L&#039;intégrale)`).
    const name = typeof label === 'string' ? decodeEntities(label).trim() : '';
    if (match && name) {
      series.push({ id: match[1], label: name });
    }
  }
  return series;
}

/** The leading articles the site moves to the end of a name in parentheses: `Cahiers d'Esther (Les)`. */
const TRAILING_ARTICLE = /^(.*?)\s*\(\s*(le|la|les|l'|l’|un|une|des|the|el|los|las|il|lo|gli|der|die|das)\s*\)\s*$/i;

/** A series name with such a trailing article put back in front: `Les Cahiers d'Esther`. */
function withLeadingArticle(label: string): string {
  const match = TRAILING_ARTICLE.exec(label);
  if (!match) {
    return label;
  }
  const article = match[2];
  return /['’]$/.test(article) ? `${article}${match[1]}` : `${article} ${match[1]}`;
}

/** A normalized name without its spaces, to compare names whose initials are spaced differently. */
function compact(name: string): string {
  return name.replace(/ /g, '');
}

/** The series whose name contains the text, best match first, with the rank (0 is the best) of each match. */
function rankSeries(candidates: BedethequeSeries[], text: string): { series: BedethequeSeries; rank: number }[] {
  // The text may be written like the site does, with the article last (`Âge d'ombre (L')`, as a library title often is).
  const wanted = normalizeName(withLeadingArticle(text.trim()));
  if (!wanted) {
    return [];
  }
  const compactWanted = compact(wanted);
  const isTranslation = (series: BedethequeSeries) => /\(\s*en\s[^)]*\)\s*$/i.test(series.label);
  const rank = (series: BedethequeSeries): number => {
    const label = withLeadingArticle(series.label);
    const name = normalizeName(label);
    const bare = normalizeName(label.replace(/\([^)]*\)\s*$/, ''));
    // Initials may or may not be spaced out: `A.D Grand-Rivière` and `AD Grand-Rivière` are one name.
    if (name === wanted || compact(name) === compactWanted) return 0;
    if (!isTranslation(series) && (bare === wanted || compact(bare) === compactWanted)) return 1;
    if (!isTranslation(series) && name.startsWith(wanted)) return 2;
    if (!isTranslation(series) && name.includes(wanted)) return 3;
    if (bare === wanted) return 4;
    return name.includes(wanted) ? 5 : Infinity;
  };
  return candidates
    .map((series, index) => ({ series, index, rank: rank(series) }))
    .filter((entry) => entry.rank !== Infinity)
    .sort((a, b) => a.rank - b.rank || a.series.label.length - b.series.label.length || a.index - b.index)
    .map(({ series, rank: value }) => ({ series, rank: value }));
}

/**
 * The series that is the one asked for: the name equal to the text (accents and case ignored), else
 * the shortest name starting with it, else the shortest containing it. A translation of a series
 * (`Blacksad (en allemand)`) only wins when nothing else matches; null when no name contains the text.
 */
export function pickSeries(candidates: BedethequeSeries[], text: string): BedethequeSeries | null {
  return rankSeries(candidates, text)[0]?.series ?? null;
}

/** At most this many homonymous series are searched. */
const MAX_HOMONYMS = 3;

/**
 * The series to look in: {@link pickSeries}'s choice, plus the other series that are just as good a match.
 * Homonyms differ only by the qualifier the site adds in parentheses (`Tutti Frutti (Stakhano)`,
 * `Tutti Frutti (Trantkat)`), so when the best match is the exact name (with or without such a qualifier)
 * every series of that rank is returned, up to `MAX_HOMONYMS` (3); a looser match (a name that merely
 * starts with or contains the text) gives its single best series, not a crowd.
 */
export function pickSeriesAll(candidates: BedethequeSeries[], text: string): BedethequeSeries[] {
  const ranked = rankSeries(candidates, text);
  if (ranked.length === 0) {
    return [];
  }
  const best = ranked[0].rank;
  if (best > 1) {
    return [ranked[0].series];
  }
  return ranked.filter((entry) => entry.rank === best).slice(0, MAX_HOMONYMS).map((entry) => entry.series);
}

/** `MM/YYYY` (or `YYYY`) as the list shows the legal deposit, to `YYYY-MM` (or `YYYY`). */
function listDate(text: string): string | null {
  const monthYear = /^(\d{2})\/(\d{4})$/.exec(text);
  if (monthYear) {
    return `${monthYear[2]}-${monthYear[1]}`;
  }
  return /^\d{4}$/.test(text) ? text : null;
}

/**
 * The albums of a series page, from the box that lists all of them (14 for Blacksad, specials and
 * omnibuses included, with no paging). The preview of the first covers and the paged detail further
 * down the page are not read. The `<li>` class says what a line is: none for an album, `is-hs` for a
 * special issue, `is-int` for an omnibus; the group headings are skipped.
 */
export function parseSeriesAlbums(html: string): SeriesAlbum[] {
  const list = /<ul class="bdt-box-albums-liste">([\s\S]*?)<\/ul>/i.exec(html)?.[1];
  if (!list) {
    return parseCoverAlbums(html);
  }
  const albums: SeriesAlbum[] = [];
  for (const item of list.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)) {
    const classes = /class="([^"]*)"/i.exec(item[1])?.[1].split(/\s+/) ?? [];
    const url = /<a\s+href="([^"]+)"/i.exec(item[2])?.[1];
    if (classes.includes('bdt-box-albums-grp') || !url || !isBedethequeAlbumUrl(url)) {
      continue;
    }
    albums.push({
      url,
      number: decodeEntities(/<span class="bdt-box-albums-num" title="([^"]*)"/i.exec(item[2])?.[1] ?? '').trim(),
      title: textOf(/<span class="bdt-box-albums-titre">([\s\S]*?)<\/span>/i.exec(item[2])?.[1] ?? ''),
      releaseDate: listDate(textOf(/<span class="bdt-box-albums-dl">([\s\S]*?)<\/span>/i.exec(item[2])?.[1] ?? '')),
      kind: classes.includes('is-hs') ? 'hs' : classes.includes('is-int') ? 'int' : 'album',
    });
  }
  return albums;
}

/**
 * The albums of a series page that has no album list: a one-shot's page is a presentation, where
 * the album only shows as its cover in the `bdt-sh-tomes` block (a link to the album page, titled
 * with its name). Such an album has no number and no date (the album page gives it).
 */
function parseCoverAlbums(html: string): SeriesAlbum[] {
  const block = /<div class="bdt-sh-tomes\b[^"]*">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '';
  const albums: SeriesAlbum[] = [];
  // Some one-shots' pages have no such block, only the "Détail des albums" article, whose heading links the album.
  for (const article of html.matchAll(/<article\b[^>]*\bbdt-edition--detail\b[^>]*>([\s\S]*?)<h3>([\s\S]*?)<\/h3>/gi)) {
    const link = /<a\b[^>]*\bitemprop="url"[^>]*>/i.exec(article[2])?.[0];
    const url = link ? /href="([^"]+)"/i.exec(link)?.[1] : undefined;
    if (url && isBedethequeAlbumUrl(url) && !albums.some((album) => album.url === url)) {
      albums.push({
        url,
        number: '',
        title: textOf(/<span itemprop="name">([\s\S]*?)<\/span>\s*<\/a>/i.exec(article[2])?.[1] ?? ''),
        releaseDate: null,
        kind: 'album',
      });
    }
  }
  for (const link of block.matchAll(/<a\b([^>]*)>/gi)) {
    const url = /href="([^"]+)"/i.exec(link[1])?.[1];
    if (url && isBedethequeAlbumUrl(url) && !albums.some((album) => album.url === url)) {
      albums.push({
        url,
        number: '',
        title: textOf(/title="([^"]*)"/i.exec(link[1])?.[1] ?? ''),
        releaseDate: null,
        kind: 'album',
      });
    }
  }
  return albums;
}

/** A volume number as compared: upper case, leading zeros of a plain number dropped (`01` is `1`). */
function normalizeNumber(text: string): string {
  return text.trim().toUpperCase().replace(/^0+(?=\d)/, '');
}

/**
 * The album of `volume` in a series: the line whose number is that volume (`3`, `HS1`, `INT01`),
 * numbered albums first. Without a volume, the series' only numbered album (a one-shot), or its
 * only album when it has no other kind. Null when none can be told to be the right one.
 */
export function pickAlbum(albums: SeriesAlbum[], volume: string | null): SeriesAlbum | null {
  const wanted = normalizeNumber(volume ?? '');
  if (wanted) {
    const matches = albums.filter((album) => normalizeNumber(album.number) === wanted);
    const match = matches.find((album) => album.kind === 'album') ?? matches[0];
    if (match) {
      return match;
    }
    // A one-shot has no number: its file may still call it volume 1.
    const numbered = albums.filter((album) => album.kind === 'album');
    return wanted === '1' && numbered.length === 1 && !numbered[0].number ? numbered[0] : null;
  }
  const numbered = albums.filter((album) => album.kind === 'album');
  if (numbered.length === 1) {
    return numbered[0];
  }
  return numbered.length === 0 && albums.length === 1 ? albums[0] : null;
}

/**
 * An album of the list as a candidate: what the list shows, the credits left for the album page. The
 * list shows no cover, but the site names each album's cover file after the album's id, so it is
 * deduced from the link (no extra request).
 */
function listCandidate(album: SeriesAlbum, series: string): MetadataCandidate {
  const id = /-(\d+)\.html$/i.exec(new URL(album.url).pathname)?.[1];
  return {
    source: 'bedetheque',
    sourceId: id ?? album.url,
    sourceUrl: album.url,
    coverUrl: id ? `https://www.bedetheque.com/media/Couvertures/Couv_${id}.jpg` : null,
    title: album.title || null,
    series,
    volume: album.number || null,
    releaseDate: album.releaseDate,
    language: null,
    credits: [],
  };
}

/** The markers of a series page that the parsers look for, to say what a page without albums looks like. */
const PAGE_MARKERS = ['bdt-box-albums-liste', 'bdt-sh-tomes', 'bdt-edition--detail', 'bdt-ah', 'bdt-ah--serie', 'class="bdt-', 'captcha', 'cloudflare'];

/** A one-line description of a page for the log: its size, title, and which known markers it holds. */
function describePage(html: string): string {
  const title = textOf(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').slice(0, 120);
  const found = PAGE_MARKERS.filter((marker) => html.toLowerCase().includes(marker));
  const albumLinks = (html.match(/href="[^"]*BD-[^"]*-\d+\.html"/gi) ?? []).length;
  return `${html.length} characters, title "${title}", markers [${found.join(', ')}], ${albumLinks} album-like links`;
}

/** Spaces every request this module sends to the site. */
let pacer: RequestPacer = createRequestPacer(MIN_REQUEST_INTERVAL_MS);

/** The same `http`, each request waiting for its slot first (and giving up its wait when the lookup is stopped). */
function paced(http: HttpOptions): HttpOptions {
  return {
    ...http,
    fetch: async (input, init) => {
      await pacer.wait(init?.signal ?? http.signal);
      const started = Date.now();
      try {
        const response = await http.fetch(input, init);
        const landed = response.url && response.url !== String(input) ? ` -> ${response.url}` : '';
        lookupLog('bedetheque', `GET ${String(input)}${landed}: ${response.status} (${Date.now() - started} ms)`);
        return response;
      } catch (error) {
        lookupLog('bedetheque', `GET ${String(input)} failed after ${Date.now() - started} ms: ${String(error)}`);
        throw error;
      }
    },
  };
}

/** What the site answered, by what was asked: the search box's series, the series pages' albums, the album pages. */
const seriesSearches = createPromiseCache<BedethequeSeries[]>(CACHE_TTL_MS, CACHE_SIZE);
const seriesAlbums = createPromiseCache<SeriesAlbum[]>(CACHE_TTL_MS, CACHE_SIZE);
const albumPages = createPromiseCache<MetadataCandidate>(CACHE_TTL_MS, CACHE_SIZE);

/** Forgets what was remembered, and lets the next request through at once (the tests start from nothing). */
export function resetBedethequeState(minIntervalMs = MIN_REQUEST_INTERVAL_MS): void {
  seriesSearches.clear();
  seriesAlbums.clear();
  albumPages.clear();
  pacer = createRequestPacer(minIntervalMs);
}

/** The text without accents and with straight apostrophes (`À Bord De L’Étoile` → `A Bord De L'Etoile`), as the site stores names. */
function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'");
}

/**
 * The terms to ask the search box, best first: the typed text, its folded form, that without dots
 * (`A.D Grand-Rivière` is `AD Grand-Rivière` on the site), its longest whitespace-separated token
 * (`Grand-Riviere`, hyphens kept: the box matches them literally) and finally its longest plain word.
 */
function searchTerms(text: string): string[] {
  const folded = foldText(text);
  const undotted = folded.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  // The box answers an unreadable page to a term holding a parenthesis (`Ajax (5e Série)`, the site's own qualifier):
  // such a term is never sent, its name without the qualifier and without the parentheses are tried instead.
  const bare = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const spaced = text.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const longestOf = (words: string[]) => words.reduce((best, word) => (word.length > best.length ? word : best), '');
  const token = longestOf(undotted.replace(/[()]/g, ' ').split(/\s+/));
  const word = longestOf(normalizeName(text).split(' '));
  const terms = [text, folded, undotted, bare, spaced, token, word].filter(
    (term) => term.length >= MIN_SEARCH_LENGTH && !/[()]/.test(term),
  );
  // Another spelling of the same text isn't worth a request, nor is a case-only difference.
  return terms.filter((term, index) => terms.findIndex((other) => other.toLowerCase() === term.toLowerCase()) === index);
}

/**
 * Asks the search box for the series named like `text`. The box answers nothing at all (an empty
 * body) when the term matches no name, and it matches the names as the site stores them, with plain
 * letters and straight apostrophes: `À Bord De L’Étoile Matutine` finds nothing there while
 * `A Bord De L'Etoile Matutine` finds `A bord de l'Etoile Matutine`. So the typed text goes first,
 * then, while no series matches it, its folded form, then its longest word (the series are matched
 * against the whole text afterwards). An empty or unreadable answer counts as no series; only a
 * failure to reach the site is thrown, when no term got an answer.
 */
async function searchBox(text: string, http: HttpOptions): Promise<BedethequeSeries[]> {
  let found: BedethequeSeries[] = [];
  let failure: unknown = null;
  let answered = false;
  for (const term of searchTerms(text)) {
    try {
      found = parseSeriesSearch(await getJson(`${SERIES_SEARCH_URL}?term=${encodeURIComponent(term)}`, paced(http), SOURCE));
      answered = true;
    } catch (error) {
      if (http.signal?.aborted) {
        throw error;
      }
      lookupLog('bedetheque', `search box failed for "${term}": ${String(error)}`);
      // An empty body is how the box says "nothing found"; anything else is a failure to reach it.
      if (error instanceof Error && error.cause instanceof SyntaxError) {
        answered = true;
      } else {
        failure = error;
      }
      found = [];
      continue;
    }
    if (pickSeriesAll(found, text).length > 0) {
      return found;
    }
    lookupLog('bedetheque', `search box: no matching series for "${term}" (${found.length} series returned)`);
  }
  if (failure && !answered) {
    throw failure;
  }
  return found;
}

/**
 * Finds a book by series name and volume, in three sequential requests at most: the search box's
 * JSON for the series, the series page for its album list, then the album's page for its credits.
 * The requests are spaced out and what the site answered is remembered for a while (see
 * {@link resetBedethequeState}), so repeated searches stay light on it.
 * Returns that one album when the volume is found (or the series has a single album); otherwise the
 * series' albums as candidates, with no credits yet (the album page is read when one is picked).
 * Nothing is returned when no series matches, or the text is too short for the site's search box.
 */
export async function searchBedetheque(query: MetadataQuery, http: HttpOptions): Promise<MetadataCandidate[]> {
  const text = query.text.trim();
  lookupLog('bedetheque', `search "${text}" (volume: ${query.volume ?? 'none'})`);
  if (text.length < MIN_SEARCH_LENGTH) {
    lookupLog('bedetheque', `text shorter than ${MIN_SEARCH_LENGTH} characters, nothing searched`);
    return [];
  }
  const found = await seriesSearches.get(normalizeName(text), () => searchBox(text, http));
  const matched = pickSeriesAll(found, text);
  lookupLog(
    'bedetheque',
    `search box: ${found.length} series [${found.slice(0, 10).map((entry) => `S${entry.id} "${entry.label}"`).join(', ')}]; ` +
      (matched.length > 0 ? `picked ${matched.map((entry) => `S${entry.id} "${entry.label}"`).join(', ')}` : 'none picked'),
  );
  const lists: { series: BedethequeSeries; albums: SeriesAlbum[]; album: SeriesAlbum | null }[] = [];
  for (const series of matched) {
    const albums = await seriesAlbums.get(series.id, async () => {
      const html = await getHtml(`${SERIES_PAGE_URL}${series.id}`, paced(http), SOURCE);
      const albums = parseSeriesAlbums(html);
      if (albums.length === 0) {
        lookupLog('bedetheque', `series page read but no album found: ${describePage(html)}`);
      }
      return albums;
    });
    const album = pickAlbum(albums, query.volume);
    lookupLog(
      'bedetheque',
      `series S${series.id}: ${albums.length} albums; ` + (album ? `picked "${album.number}" ${album.url}` : 'none picked'),
    );
    lists.push({ series, albums, album });
  }
  // The albums of the right volume, one per homonymous series, else every series' albums to choose from.
  const picked = lists.filter((entry) => entry.album);
  if (picked.length > 0) {
    const candidates: MetadataCandidate[] = [];
    for (const entry of picked) {
      candidates.push(await fetchBedethequeAlbum(entry.album!.url, http));
    }
    return candidates;
  }
  return lists
    .flatMap((entry) => entry.albums.map((album) => listCandidate(album, entry.series.label)))
    .slice(0, MAX_SERIES_CANDIDATES);
}
