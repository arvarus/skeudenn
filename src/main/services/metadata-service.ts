/**
 * Metadata lookup across the configured public APIs.
 * @module
 */
import { t } from '../../shared/i18n';
import { validReleaseDate } from '../../shared/release-date';
import {
  type MetadataApiSource,
  type MetadataCandidate,
  type MetadataPageResult,
  type MetadataQuery,
  type MetadataSearchResult,
  pageSourceOf,
} from '../../shared/metadata';
import type { AppSettings } from '../../shared/settings';
import { errorText } from '../../shared/errors';
import { fetchBedethequeAlbum, searchBedetheque } from './bedetheque';
import { fetchStructuredPage } from './structured-page';
import { ComicVineClient } from './comic-vine';
import { GoogleBooksClient } from './google-books';
import type { HttpOptions } from './http-json';

/** The settings a lookup needs: which sources are enabled, and their API keys. */
export type SourceSettings = Pick<
  AppSettings,
  'comicVineEnabled' | 'comicVineApiKey' | 'googleBooksEnabled' | 'googleBooksApiKey' | 'bedethequeSearchByDefault'
>;

/** A client of one source, as the lookup sees it. */
interface MetadataClient {
  search(query: MetadataQuery): Promise<MetadataCandidate[]>;
}

/**
 * Candidates whose volume is the one asked for come first; otherwise the sources' own order is
 * kept (each source ranks its results by relevance already).
 */
export function rankCandidates(candidates: MetadataCandidate[], query: MetadataQuery): MetadataCandidate[] {
  if (!query.volume) {
    return candidates;
  }
  const matches = (candidate: MetadataCandidate) => candidate.volume?.replace(/^0+(?=\d)/, '') === query.volume;
  return [...candidates.filter(matches), ...candidates.filter((candidate) => !matches(candidate))];
}

/** The candidate with a release date that exists, or none: a source's answer is not trusted to be a date. */
function withValidDate(candidate: MetadataCandidate): MetadataCandidate {
  return { ...candidate, releaseDate: validReleaseDate(candidate.releaseDate) };
}

/**
 * Queries every enabled source in parallel (Comic Vine only when it has an API key) and merges
 * their results. A failing source only adds its message to `errors`; the result is an error only
 * when no source is configured, the query is empty, or every source failed.
 */
export async function searchMetadata(
  query: MetadataQuery,
  settings: SourceSettings,
  http: HttpOptions,
): Promise<MetadataSearchResult> {
  const text = query.text.trim();
  if (!text) {
    return { status: 'error', message: t('errors:metadata.emptyQuery') };
  }
  const volume = query.volume?.trim() || null;

  const clients: MetadataClient[] = [];
  const wanted = (source: MetadataApiSource) => !query.sources || query.sources.includes(source);
  if (wanted('comicvine') && settings.comicVineEnabled && settings.comicVineApiKey.trim()) {
    clients.push(new ComicVineClient(settings.comicVineApiKey.trim(), http));
  }
  if (wanted('googlebooks') && settings.googleBooksEnabled) {
    clients.push(new GoogleBooksClient(settings.googleBooksApiKey.trim(), http));
  }
  // Bédéthèque has no switch of its own: the dialog's box says so, and its default is a setting.
  if (query.sources ? query.sources.includes('bedetheque') : settings.bedethequeSearchByDefault) {
    clients.push({ search: (q) => searchBedetheque(q, http) });
  }
  if (clients.length === 0) {
    return {
      status: 'error',
      message: t('errors:metadata.noSource'),
    };
  }

  const results = await Promise.allSettled(clients.map((client) => client.search({ text, volume })));
  const candidates = results.flatMap((result) => (result.status === 'fulfilled' ? result.value.map(withValidDate) : []));
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [errorText(result.reason)] : [],
  );
  if (errors.length === clients.length) {
    return { status: 'error', message: errors.join('\n') };
  }
  return { status: 'ok', candidates: rankCandidates(candidates, { text, volume }), errors };
}

/**
 * Reads a book from the page whose link the user pasted (a Bédéthèque album, a BDfugue product or
 * a Nautiljon volume page). Needs no setting: pasting the link is the opt-in.
 */
export async function fetchMetadataPage(url: string, http: HttpOptions): Promise<MetadataPageResult> {
  try {
    const candidate = pageSourceOf(url) === 'bedetheque' ? await fetchBedethequeAlbum(url, http) : await fetchStructuredPage(url, http);
    return { status: 'ok', candidate: withValidDate(candidate) };
  } catch (error) {
    return { status: 'error', message: errorText(error) };
  }
}
