# Architecture decision records

An ADR records one structural decision: the context, what was decided, and what it costs. ADRs are immutable once accepted: to change a decision, write a new ADR that supersedes the old one and update the old one's status.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-electron-process-isolation.md) | Strict Electron process isolation, one preload bridge | Accepted |
| [0002](./0002-local-storage-node-sqlite.md) | Local storage in a SQLite file through `node:sqlite` | Accepted |
| [0003](./0003-database-location-pointer-file.md) | Database location in a pointer file, never moved automatically | Accepted |
| [0004](./0004-pdf-rendering-pdfjs-napi-canvas.md) | PDF pages rasterized in the main process with pdf.js + `@napi-rs/canvas` | Accepted |
| [0005](./0005-metadata-lookup-public-apis.md) | Book metadata looked up on demand in public APIs, from the main process | Accepted |
| [0006](./0006-bedetheque-album-page-scraping.md) | Bédéthèque album pages read from a pasted link | Accepted |
| [0007](./0007-cover-thumbnails-disk-cache.md) | Cover thumbnails in a disk cache, outside the database | Accepted |
| [0008](./0008-interface-translations-i18next.md) | Interface translations with i18next, locales split by area | Accepted |
| [0009](./0009-ipc-argument-validation.md) | IPC arguments validated in the main process | Accepted |
| [0010](./0010-versioned-migrations.md) | Schema migrations versioned with `PRAGMA user_version` | Accepted |
| [0011](./0011-ipc-handle-wrapper-and-open-tokens.md) | A mandatory `handle()` wrapper for IPC, and opaque tokens instead of paths | Accepted |
| [0012](./0012-decoder-utility-process.md) | Comic files decoded in a utility process, not in the main process | Accepted |
| [0013](./0013-renderer-data-store-data-changed.md) | One renderer data store, kept current by a `data:changed` push | Accepted |
| [0014](./0014-achievements-evaluated-in-renderer.md) | Achievements evaluated in the renderer, only unlocks persisted | Accepted |
| [0015](./0015-library-organization-moves-files.md) | Library organization: the app moves files into one subfolder per comic | Accepted |
| [0016](./0016-library-structure-levels.md) | Library structure: a tree of up to three metadata levels | Accepted |
| [0017](./0017-library-file-name-template.md) | Library file names: a template of metadata fields | Accepted |
| [0018](./0018-decoder-timeouts-and-archive-ownership.md) | Decoder calls bounded by a timeout, archives tied to their window | Accepted |
| [0019](./0019-multiple-users.md) | Several users on one library, without passwords | Accepted |
| [0020](./0020-library-paths-relative-to-folders.md) | Library paths relative to the library folders | Accepted |
| [0021](./0021-metadata-lookup-dialog-rework.md) | Metadata lookup dialog: explicit search, more page sources, saved to the `.nfo` | Accepted |
| [0022](./0022-per-user-library-folders-and-settings-groups.md) | Watched folders per user, and settings split in two groups | Accepted |
| [0023](./0023-clean-books-rewrite-cbz.md) | Cleaning the books by rewriting the CBZ archives | Accepted |
| [0024](./0024-database-backups.md) | Database backups in a `.tankobon` folder, restored at start-up | Accepted |
| [0025](./0025-convert-cbr-to-cbz.md) | Converting the CBR of the organized library to CBZ | Accepted |
| [0029](./0029-rewrite-deflate64-cbz.md) | Rewriting the Deflate64 CBZ with standard compression | Accepted |
| [0026](./0026-bedetheque-series-search.md) | Bédéthèque: finding the album from the series name | Accepted |
| [0027](./0027-cheaper-library-reloads.md) | Cheaper library reloads: deltas and projections before SQL search | Proposed |
| [0028](./0028-separate-background-decoder-process.md) | A second decoder process for background work, the reader keeps its own | Proposed |

These first four ADRs were written after the fact, from the code and its comments, then checked by the maintainer.

## Writing a new ADR

Copy [the template](./template.md) to `NNNN-short-title.md` (next number), fill it in, add it to the table above, and ship it in the same pull request as the change it describes.
