import { app, net } from 'electron';

import { MAX_COVER_BYTES, type LibraryEntry, type MetadataUpdate } from '../../shared/library';
import { isCoverUrl, type MetadataPageResult, type MetadataSearchResult } from '../../shared/metadata';
import type { LibraryRepository } from '../db/library-repository';
import type { SettingsRepository } from '../db/settings-repository';
import type { DecoderClient } from '../decoder/decoder-client';
import { writeNfo } from '../services/nfo';
import { fetchMetadataPage, searchMetadata } from '../services/metadata-service';
import { getImage, type HttpOptions } from '../services/http-json';
import { handle } from './handle';
import { PendingRequests } from './pending-requests';
import type { NotifyDataChange } from './data-changes';
import {
  MAX_PATH_LENGTH,
  args,
  expectMetadataQuery,
  expectMetadataUpdate,
  expectNonEmptyString,
  expectNullableString,
} from './validate';

// Channel names are shared with preload.ts: keep them in sync.
export const METADATA_CHANNELS = {
  search: 'metadata:search',
  fromPage: 'metadata:from-page',
  cancel: 'metadata:cancel',
  apply: 'metadata:apply',
} as const;

function httpOptions(): HttpOptions {
  return {
    // Chromium's network stack rather than Node's: it honours the system proxy settings.
    fetch: net.fetch as typeof fetch,
    userAgent: `Skeudenn/${app.getVersion()}`,
    timeoutMs: 15_000,
  };
}

export function registerMetadataIpc(
  settingsRepo: SettingsRepository,
  libraryRepo: LibraryRepository,
  decoder: DecoderClient,
  notify: NotifyDataChange,
): void {
  // What each window is waiting for, so its "Stop" (or a newer lookup) really interrupts the requests.
  const pending = new PendingRequests();
  const cancelable = async <T>(owner: number, run: (http: HttpOptions) => Promise<T>): Promise<T> => {
    const signal = pending.begin(owner);
    try {
      return await run({ ...httpOptions(), signal });
    } finally {
      pending.end(owner, signal);
    }
  };
  handle(METADATA_CHANNELS.search, args(expectMetadataQuery), (event, query): Promise<MetadataSearchResult> =>
    cancelable(event.sender.id, (http) => searchMetadata(query, settingsRepo.getAll(), http)),
  );
  handle(
    METADATA_CHANNELS.fromPage,
    args((url) => expectNonEmptyString(url, 'url', MAX_PATH_LENGTH)),
    (event, url): Promise<MetadataPageResult> => cancelable(event.sender.id, (http) => fetchMetadataPage(url, http)),
  );
  handle(METADATA_CHANNELS.cancel, args(), (event): void => pending.cancel(event.sender.id));
  // The lookup dialog's save: the information goes to the library, then to the `.nfo` beside the
  // file, and the cover is made if the book has none yet, so nothing waits for a later scan. With a
  // `coverUrl` (the picture of the chosen result) the cover is replaced by that picture instead.
  handle(
    METADATA_CHANNELS.apply,
    args((id) => expectNonEmptyString(id, 'id', MAX_PATH_LENGTH), expectMetadataUpdate, (value) => expectNullableString(value, 'coverUrl')),
    async (_event, id, update: MetadataUpdate, coverUrl): Promise<LibraryEntry | null> => {
      const updated = libraryRepo.updateMetadata(id, update);
      if (!updated) return null;
      notify({ scope: 'library', upserted: [updated] });
      if (settingsRepo.getAll().libraryWriteNfo) await writeNfo(updated);
      // A picture that can't be downloaded or read never fails the save: the book keeps its cover.
      const picture =
        coverUrl !== null && isCoverUrl(coverUrl)
          ? await getImage(coverUrl, httpOptions(), new URL(coverUrl).hostname, MAX_COVER_BYTES).catch(() => null)
          : null;
      if (picture) await decoder.setThumbnail(updated.path, picture).catch(() => null);
      await decoder.thumbnail(updated.path).catch(() => null);
      return updated;
    },
  );
}
