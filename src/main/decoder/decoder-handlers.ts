/**
 * What the decoder process does for each `DecoderMethods` call. Free of Electron, so it runs under Vitest.
 * @module
 */
import { convertCbrToCbz } from '../services/cbr-converter';
import { convertDeflate64, hasDeflate64 } from '../services/cbz-deflate64';
import { listJunkEntries, removeEntries } from '../services/cbz-cleaner';
import { comicFormat } from '../../shared/comic';
import { ComicService, openArchive } from '../services/comic-service';
import { measureArchive } from '../services/image-stats';
import { ThumbnailCache } from '../services/thumbnail-cache';
import type { DecoderMethods } from './protocol';

/** One implementation per `DecoderMethods` call, each resolving to what the call returns. */
export type DecoderHandlers = {
  [M in keyof DecoderMethods]: (...args: Parameters<DecoderMethods[M]>) => Promise<ReturnType<DecoderMethods[M]>>;
};

/** Builds the handlers around one `ComicService` (the open archives) and one `ThumbnailCache`. */
export function createDecoderHandlers(
  thumbnailsDirectory: string,
  sidecarCovers = true,
): DecoderHandlers & { setSidecarCovers(enabled: boolean): void } {
  const service = new ComicService();
  const thumbnails = new ThumbnailCache(thumbnailsDirectory);
  thumbnails.sidecars = sidecarCovers;
  return {
    setSidecarCovers: (enabled) => {
      thumbnails.sidecars = enabled;
    },
    open: (filePath) => service.open(filePath),
    readPage: (id, index) => service.readPage(id, index),
    close: (id) => service.close(id),
    async inspect(filePath) {
      const archive = await openArchive(filePath);
      try {
        // A book without a cover only goes without a thumbnail: not a reason to refuse it.
        await thumbnails.storeFromArchive(archive).catch(() => undefined);
        return { pageCount: archive.pages.length, fileCount: archive.fileCount };
      } finally {
        await archive.close();
      }
    },
    async measure(filePath) {
      const archive = await openArchive(filePath);
      try {
        return await measureArchive(archive);
      } finally {
        await archive.close();
      }
    },
    listJunk: (filePath) => (comicFormat(filePath) === 'CBZ' ? listJunkEntries(filePath) : Promise.resolve(null)),
    cleanArchive: (filePath, names) => removeEntries(filePath, names),
    convertCbr: (cbrPath, cbzPath) => convertCbrToCbz(cbrPath, cbzPath),
    hasDeflate64: (filePath) => (comicFormat(filePath) === 'CBZ' ? hasDeflate64(filePath) : Promise.resolve(false)),
    convertDeflate64: (filePath) => convertDeflate64(filePath),
    thumbnail: (filePath, archiveId, cachedOnly) =>
      cachedOnly
        ? thumbnails.read(filePath)
        : thumbnails.ensure(filePath, archiveId ? () => service.readPage(archiveId, 0) : undefined),
    hasThumbnail: (filePath) => thumbnails.has(filePath),
    setThumbnail: (filePath, image) => thumbnails.replace(filePath, image),
    removeThumbnail: (filePath) => thumbnails.remove(filePath),
    pruneThumbnails: (filePaths) => thumbnails.prune(filePaths),
    rebuildThumbnails: (filePaths) => thumbnails.rebuild(filePaths),
  };
}
