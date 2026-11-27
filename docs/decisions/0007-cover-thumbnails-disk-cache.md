# 0007. Cover thumbnails in a disk cache, outside the database

- **Status:** Accepted; generation now runs in the decoder process ([ADR 0012](./0012-decoder-utility-process.md))
- **Date:** 2026-10-01

## Context

The library list shows a cover for each book: its first page. Reading it means opening the archive (a CBR is read fully into memory, a PDF page is rasterized), far too slow to do for every book each time the list is shown. The covers have to be kept somewhere, and that somewhere has to survive the database being moved ([ADR 0003](./0003-database-location-pointer-file.md)) and a library being restored on another machine from a JSON export.

## Decision

- Thumbnails are generated in the main process (`ThumbnailCache`, `src/main/services/thumbnail-cache.ts`): the first page is shrunk with `@napi-rs/canvas`, already shipped for PDF rendering ([ADR 0004](./0004-pdf-rendering-pdfjs-napi-canvas.md)), to fit in 240 × 360 px, and encoded as WebP.
- They are files in `<userData>/thumbnails/`, named after a hash of the book's **path**, and are a *cache*: nothing in the database refers to them, they are not exported, and any missing one is regenerated.
- They are generated when a book is added (folder scan, from the archive already open; opening a book, from the reader's archive), on demand when the library asks for a missing one (`library:thumbnail`), and for the whole library after a JSON import. Generation goes through a single queue, one book at a time.
- The renderer gets the bytes over IPC and shows them through a `blob:` URL, like reader pages.

## Consequences

- The database stays small, and the export format is unchanged: an import rebuilds the cache instead of carrying images.
- Keying by path rather than by library id keeps a thumbnail valid when an import gives an entry a new id. The other side: a file replaced at the same path keeps its old cover until its thumbnail is deleted.
- The cache stays in `userData` even when the database is moved, so a shared database on a synced folder doesn't drag images along; each machine builds its own. Thumbnails of books no longer in the library are pruned at start-up and after an import.
- A book whose file can't be opened is not retried until the next start or import, so a library with missing files doesn't reopen them every time it is shown.

## Alternatives considered

- A `BLOB` column in the `library` table: bloats the database (and a synced copy of it) with rebuildable data, and would have to be left out of the export by hand.
- Full-size first pages, scaled down by the renderer: several megabytes per book to read and send over IPC, for an 80 px tall image.
- A custom protocol (`skeudenn-thumb://…`) for `<img src>`: one more privileged entry point and a CSP change, where the existing IPC + `blob:` path already works.
- Electron's `nativeImage` for resizing: decodes only PNG and JPEG (not WebP or AVIF pages), and can't run under Vitest.
