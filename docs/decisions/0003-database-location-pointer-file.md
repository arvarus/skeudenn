# 0003. Database location in a pointer file, never moved automatically

- **Status:** Accepted
- **Date:** recorded 2026-09-30 (the decision predates this record)

## Context

Users may want the database somewhere other than Electron's `userData` directory, for example in a synced folder shared between machines. But the location can't be an ordinary setting: settings are stored *in* the database, and the location must be known before the database is opened.

## Decision

- The location is stored in `db-location.json`, a pointer file that always stays in `userData` and holds the directory of the database (`src/main/db/db-location.ts`).
- A missing, unreadable or malformed pointer falls back to `userData` instead of throwing.
- Changing the location (`database:choose-location`) only rewrites the pointer. The existing database file is **not** moved or copied, and the open database stays open until the app restarts (`database:relaunch`).
- A directory that can't be written to is rejected before the pointer is written (`checkDirectoryUsable()`).

## Consequences

- Pointing at a directory that already holds a `skeudenn.db` (another machine, a synced folder) uses that database as is, rather than overwriting it.
- A user who wants to carry their data to the new location has to export it first and import it afterwards; the settings page says so.
- The pointer-file functions are pure (they take the `userData` path as a parameter), so they are unit-tested without Electron (`src/main/db/db-location.test.ts`).

## Alternatives considered

- Storing the location as an `AppSettings` entry: impossible, for the chicken-and-egg reason above.
- Moving the file on change: rejected, because it would overwrite an existing database in the target directory.
