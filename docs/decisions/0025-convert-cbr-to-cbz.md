# 0025. Converting the CBR of the organized library to CBZ

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

A RAR can't be written by the libraries we use, so a CBR can't be cleaned ([ADR 0023](./0023-clean-books-rewrite-cbz.md)) or otherwise edited. Users want to turn their CBR into CBZ to get every option of the app, without losing what they recorded about the books (progress, rating, tags, lists).

## Decision

- **Only the organized folder**: the conversion moves and creates files, which the app only does in the folder it manages ([ADR 0015](./0015-library-organization-moves-files.md)). It needs the organization on and its folder reachable; a CBR elsewhere is left alone.
- **In the decoder process**: `convertCbrToCbz()` (`cbr-converter.ts`) extracts the RAR's entries one at a time into `<name>.cbz.converting.tmp` with `yazl` (pages stored, other files compressed), reopens the result, checks its pages and entry count against the RAR's, and only then renames it. It never overwrites an existing file.
- **The entry keeps its id**: once the CBZ exists, the main process (`cbr-conversion.ts`) moves the CBR into `.deletedBySkeudenn` at the root of the organized folder, then points the entry at the CBZ (`updatePath()`, `updateFileStats()`). The id, hence everything personal keyed on it, is unchanged. The cover and `.nfo` sidecars move to the CBZ's names. If the database refuses the new path the CBR goes back and the CBZ is deleted.
- **A holding folder, not the trash**: the CBR leave the library folders but are not deleted; "Vider le dossier .deletedBySkeudenn…" deletes them for good after a confirmation. The library scan skips that folder, a hidden one ([ADR 0031](./0031-full-rename-to-skeudenn.md)), otherwise the next resynchronization would add the CBR back.
- **One run at a time**: it takes the `LibraryRunLock` (kind `convert`) shared with the other runs over the files.

## Consequences

- Converting needs the free disk space of a second copy of each book until the CBR is moved, and a CBR is read whole into memory (as when it is opened).
- RAR-specific data that isn't a file (comments, recovery records) is not carried over.
- The CBR are not recoverable from the app once the folder is emptied.

## Alternatives considered

- **Converting in place and deleting the CBR**: no safety net if the user dislikes the result.
- **Sending the CBR to the OS trash**: works for a single file but is slow and noisy for a whole library, and the trash isn't visible to the library's own folder.
- **Converting any CBR of the library**: would write files outside the folder the app manages.
