# 0029. Rewriting the Deflate64 CBZ with standard compression

- **Status:** Accepted
- **Date:** 2026-11-07

## Context

Windows Explorer and some archivers write ZIP entries with the Deflate64 method (method 9). `node-stream-zip` reads the directory of such an archive but can't inflate its entries, so the book opens and every page is unreadable. Supporting the method in the reader would mean replacing the ZIP library everywhere (pages, thumbnails, measure, cleaning); the user wants these files fixed once instead.

## Decision

- **Detect, then rewrite in place**: `hasDeflate64()` (`cbz-deflate64.ts`) reads only the central directory and looks for method 9. `convertDeflate64()` inflates each entry with `@zip.js/zip.js` (the one dependency that inflates Deflate64; no web worker, the entries are read on the decoder thread from a `Blob` over the file) and writes them with `yazl` (pages stored, other files deflated) to `<file>.converting.tmp`, reopens the result, checks its pages and entry count, and only then renames it over the original.
- **In place, whole library**: unlike the CBR conversion ([ADR 0025](./0025-convert-cbr-to-cbz.md)) the path doesn't change, so the entry, its id and everything personal keyed on it are untouched, and nothing is moved or parked. It is not limited to the organized folder. Only `file_count`/`file_size` and the cached thumbnail are refreshed.
- **Where**: Paramètres › Organisation, "Réparer les CBZ Deflate64…", after a confirmation giving the number of books (`library:count-deflate64`, `library:convert-deflate64`, progress over `library:scan-progress`). `createDeflate64Converter()` (`deflate64-conversion.ts`, Electron-free) takes the shared `LibraryRunLock` (kind `convert`).

## Consequences

- Reading a Deflate64 CBZ from the library still fails until it is converted; the conversion needs the free disk space of a second copy of the book while it runs.
- A book that can't be converted (corrupted entry, no image, entry above `MAX_ENTRY_SIZE`) is left as it was and counted as failed.
- `@zip.js/zip.js` is only loaded by the decoder process.

## Alternatives considered

- **Reading Deflate64 everywhere**: replaces `node-stream-zip` in every code path for a rare case.
- **Converting at open time**: rewrites a file the user only meant to read, silently.
