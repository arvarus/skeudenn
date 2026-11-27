# 0030. Stopping every run over the library files through the run lock

- **Status:** Accepted
- **Date:** 2026-11-25

## Context

Paramètres › Organisation starts long runs over the library files: organizing the whole library, converting the CBR, checking and rewriting the Deflate64 CBZ, emptying `.deletedBySkeudenn`, cleaning the orphan folders, removing duplicates, resynchronizing, cleaning the books. They already share a `LibraryRunLock` so that only one of them touches the files at a time. Only two could be stopped, each its own way (`Resynchronizer.cancel()`, `LibraryCleaner.cancel()`), and the next step is one dialog with an "Arrêter" button for every action, which needs one way to stop whichever run is going.

## Decision

- **The lock carries the stop**: `LibraryRunLock.tryStart(kind)` returns an `AbortSignal` for that run (null when the lock is taken) instead of a boolean; `end()` forgets it; `cancel()` aborts it and returns false when nothing holds the lock or a stop was already asked. Every run that takes the lock checks its signal between two items (a comic, a book, a folder, an item of the trash), never inside one.
- **Same semantics everywhere**, those of the resynchronization and the books' cleanup: a move, a rewrite or a conversion under way always finishes; what was done stays, counted, written to the database and announced as at the end of a full run; the lock is released in `finally`. The `ok` result gains `cancelled: boolean`; a check that yields a plan (`countDeflate64`, the cleanup's analysis) answers `{ status: 'cancelled' }` and keeps nothing, since a partial plan would silently leave books out.
- **One channel**: `library:cancel-run` (`library.cancelRun()`) calls `lock.cancel()` and `LibraryCleaner.cancel()` (the cleanup's analysis only reads and doesn't take the lock). `library:cancel-resync` and `library:cancel-cleanup` keep working: the first goes through the lock, the cleaner's rewrite follows the lock's signal.
- **Removing a selection takes the lock** (kind `remove`): `library:remove-many` trashes or parks files, which a walk could register again or the organizer try to move meanwhile. It moves to `createLibraryRemover()` (`library-removal.ts`, Electron-free), reports over `library:scan-progress` and gets an `error` member when the lock is taken.
- **Emptying `.deletedBySkeudenn` goes item by item** with progress, so it can be stopped like the rest; the hourly automatic emptying keeps its behavior (no progress, skipped when the lock is taken).

## Consequences

- A new run over the files gets its stop for free by taking the lock and checking the signal it returns between two items.
- Removing a selection from the library page, or the duplicates, is refused while another run holds the lock (the start-up resynchronization included); removing a single book (`library:remove`) is not.
- `library:cancel-run` stops whichever run holds the lock, whoever started it, as `library:cancel-resync` already did.

## Alternatives considered

- **One `AbortController` per service** (as the resynchronizer and the cleaner had): every run would need its own cancel channel, and the dialog would have to know which one is going.
- **Leaving `library:remove-many` outside the lock**, with its own controller: it would keep working during a resynchronization, but could race a walk or the organizer on the same files, and `cancelRun()` would need a second path to reach it.
