/**
 * The reference sites an author can be searched on from their page, and the pure construction of
 * the search address. The renderer only names a provider and a name (`app:open-author-search`):
 * the main process builds the address with {@link authorSearchUrl} and opens it, so the renderer
 * never hands a URL to `shell.openExternal`.
 * @module
 */
import { formatPersonName, splitPersonName } from './title-parsing';

/** Longest author name accepted, in characters (a name is a few words; a longer text is not one). */
export const MAX_AUTHOR_NAME_LENGTH = 200;

/** One site an author can be searched on. */
export interface AuthorSearchProvider {
  /** Stable key, sent over IPC. */
  id: string;
  /** The site's name, as shown in the tooltip (a brand name, not translated). */
  label: string;
  /** Key of the local drawing shown on the button (`AuthorSearchIcon`); an unknown key shows a generic icon. */
  icon: string;
  /**
   * The search address, an `https:` URL with a `{q}` placeholder for the URL-encoded name. The
   * host is fixed here: it is the only host the main process opens for this provider.
   */
  urlPattern: string;
}

/**
 * The sites offered, in display order. Adding one is adding an entry (and, for its own drawing, a
 * monogram in `AuthorSearchIcon`).
 */
export const AUTHOR_SEARCH_PROVIDERS = [
  { id: 'wikipedia', label: 'Wikipédia', icon: 'wikipedia', urlPattern: 'https://fr.wikipedia.org/w/index.php?search={q}' },
  // The search of the whole site (authors, series and albums); the site has no page of its own for authors only.
  { id: 'bedetheque', label: 'BD Gest’', icon: 'bedetheque', urlPattern: 'https://www.bedetheque.com/search/tout?RechTexte={q}&RechWhere=1' },
  { id: 'comicvine', label: 'Comic Vine', icon: 'comicvine', urlPattern: 'https://comicvine.gamespot.com/search/?i=person&q={q}' },
  { id: 'myanimelist', label: 'MyAnimeList', icon: 'myanimelist', urlPattern: 'https://myanimelist.net/people.php?q={q}' },
  // The quotes and the extra words are part of the pattern: they narrow the results to the author.
  { id: 'google', label: 'Google', icon: 'google', urlPattern: 'https://www.google.com/search?q=%22{q}%22+auteur+bande+dessin%C3%A9e' },
] as const satisfies readonly AuthorSearchProvider[];

/** Key of one of the {@link AUTHOR_SEARCH_PROVIDERS}. */
export type AuthorSearchProviderId = (typeof AUTHOR_SEARCH_PROVIDERS)[number]['id'];

/** Whether `value` names one of the {@link AUTHOR_SEARCH_PROVIDERS}; IPC arguments are checked, not trusted. */
export function isAuthorSearchProviderId(value: unknown): value is AuthorSearchProviderId {
  return typeof value === 'string' && AUTHOR_SEARCH_PROVIDERS.some((provider) => provider.id === value);
}

/**
 * The name to search: control characters and runs of spaces collapsed, and a "Last, First" name
 * (the ComicInfo form) turned back into "First Last". Several authors in one field ("A & B") are
 * not split: the text is searched as is. Empty when there is nothing to search.
 */
export function normalizeAuthorName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const text = name.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.includes(',') ? formatPersonName(splitPersonName(text)) : text;
}

/** `encodeURIComponent` that also escapes the characters it leaves bare (`!'()*`). */
function encodeQuery(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * The search address of `authorName` on `provider`: the name normalized by
 * {@link normalizeAuthorName} and URL-encoded (accents and non-Latin characters as UTF-8). Null
 * when the name is empty, so there is nothing to search.
 */
export function buildSearchUrl(provider: Pick<AuthorSearchProvider, 'urlPattern'>, authorName: string): string | null {
  const name = normalizeAuthorName(authorName);
  if (name === '') return null;
  // A replacer function: a `$` in the encoded name (never present) can't be read as a pattern.
  return provider.urlPattern.replace('{q}', () => encodeQuery(name));
}

/**
 * The address to open for the provider named `id`, or null when the id is unknown, the name is
 * empty or the result is not an `https:` URL on the provider's own host (checked again here, even
 * though the host comes from a constant, since this is what stands between the renderer and
 * `shell.openExternal`).
 */
export function authorSearchUrl(id: unknown, authorName: string): string | null {
  const provider = AUTHOR_SEARCH_PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) return null;
  const built = buildSearchUrl(provider, authorName);
  if (built === null) return null;
  try {
    const url = new URL(built);
    const expectedHost = new URL(provider.urlPattern.replace('{q}', 'x')).hostname;
    return url.protocol === 'https:' && url.hostname === expectedHost && url.username === '' && url.password === '' ? url.href : null;
  } catch {
    return null;
  }
}
