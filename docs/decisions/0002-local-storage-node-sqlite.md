# 0002. Local storage in a SQLite file through `node:sqlite`

- **Status:** Accepted
- **Date:** recorded 2026-09-30 (the decision predates this record)

## Context

The app needs to remember the library (one entry per comic: path, page count, reading progress, rating, tags) and the user's settings. The data is personal and must stay on the user's machine.

## Decision

- All persistent data lives in a single SQLite file, `skeudenn.db`, opened in the main process with Node's built-in `node:sqlite` (`DatabaseSync`, `src/main/db/database.ts`).
- Nothing is stored in the cloud, nor in Chromium's `localStorage`/IndexedDB.
- The schema is migrated in place at startup: `CREATE TABLE IF NOT EXISTS` for tables, `addColumnIfMissing()` for columns added later (`src/main/db/schema.ts`).
- Settings are a key/value table (JSON-encoded values) merged over `DEFAULT_SETTINGS`, so adding a setting needs no migration.

## Consequences

- No native SQLite module to compile or rebuild against Electron's Node ABI (the reason given in `database.ts`).
- `node:sqlite` is not yet in Node's `builtinModules`, so it must stay listed in `vite.main.config.mts`'s `external`; otherwise Vite bundles an empty stub and `DatabaseSync` is `undefined` at runtime.
- The API is synchronous (`DatabaseSync`), acceptable for a personal-size library.
- Repositories receive the `DatabaseSync` in their constructor, so tests run on `:memory:` databases without Electron.
- Migrations are additive only; a destructive change (renaming or dropping a column) would need a new mechanism.

## Alternatives considered

None: `node:sqlite` was chosen from the start. Other options (a native module such as `better-sqlite3`, browser storage, a plain JSON file) were not evaluated.
