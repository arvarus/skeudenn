# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture in brief

Skeudenn is an Electron app (Vite + Electron Forge, React 19, TypeScript) that manages and reads digital comics (CBZ, CBR, PDF).

- **Main process** (`src/main.ts`, `src/main/`): the window, the SQLite database (`node:sqlite`, `src/main/db/`) and IPC handlers (`src/main/ipc/`). It never parses a comic file.
- **Decoder process** (`src/main/decoder/`, `src/main/services/`): a `utilityProcess` that does the archive decoding and thumbnails; the main process reaches it only through `DecoderClient`.
- **Preload** (`src/preload.ts`): the only bridge, exposing `window.tankobon` via `contextBridge`. Channel strings are duplicated from `src/main/ipc/` by hand: keep both sides in sync (`npm run docs:gen` fails otherwise).
- **Renderer** (`src/renderer.tsx`, `src/routes/`, `src/hooks/`, `src/components/`, `src/lib/`): React UI, reaches main only through `window.tankobon`.
- **Shared types** (`src/shared/`): everything that crosses the IPC boundary.

The detailed architecture, including the build gotchas that don't fail the build but break the packaged app, is imported below. Read the relevant section before touching the database, archives, packaging or the reader.

@docs/architecture.md

## Commands

```sh
npm install
npm start            # app from the sources, HMR on the renderer; regenerates src/routeTree.gen.ts
npm run dev          # same, plus auto-restart on main-process changes and DevTools (development mode)
npm run lint         # eslint .
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:e2e     # Playwright smoke tests of the packaged app (after npm run package; xvfb-run on headless Linux)
npm run docs:build   # generate references + TypeDoc + doc checks + VitePress build
npm run docs:dev     # docs site locally
npm run package      # electron-forge package, into out/
npm run make         # platform installers
```

Single test file or test name: `npx vitest run src/main/db/library-repository.test.ts`, `npx vitest run -t "clamps the current page"`.

CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test` and `docs:build` as parallel jobs on pushes to `master` and on pull requests; `e2e.yml` runs the smoke tests nightly and on demand. See `docs/development.md` for the other workflows and the `npm audit` situation.

## Conventions

- **Language**: code, comments and documentation in English. User-facing UI strings and error messages are never hard-coded: they go through i18next (`t()` from `src/shared/i18n.ts`, `useTranslation()` in components), with a key in **both** `src/locales/en/<namespace>.ts` and `src/locales/fr/<namespace>.ts` (the French file is typed against the English one, so a missing key fails `typecheck`). See "Interface language" in `docs/architecture.md`.
- **Imports**: `@/` aliases `src/` in the renderer; main-process code uses relative imports.
- **Tests**: colocated `*.test.ts`, Vitest `node` environment (no DOM); a hook or component test is a `*.test.tsx` that opts into jsdom (`// @vitest-environment jsdom`, see `docs/development.md`). Keep testable logic pure and out of components/Electron: pure helpers in `src/lib/`, repositories that take a `DatabaseSync` (tests use `:memory:`), functions that take paths instead of calling `app.getPath`.
- **IPC errors meant for the user** are returned as `{ status: 'error', message }` members of a result union, not thrown.
- **Database changes**: every schema change (table, index, column, data fix) is a new entry at the end of `MIGRATIONS` in `src/main/db/schema.ts`, applied once and recorded in `PRAGMA user_version`; never edit a shipped migration. New columns still go through `addColumnIfMissing()` inside it. The repository tests call the same `migrate()`, so they pick the change up with no copy to update. Writes spanning several statements use `withTransaction()`.
- **Renderer data**: views read the library, reading lists and settings through `useLibrary()`, `useReadingLists()` and `useSettings()` (the `DataStore`, ADR 0013), never by calling `library:list`/`reading-lists:list`/`settings:get-all`. A new IPC handler that writes to the database must call its `notify(…)` (`DataChange`, `src/shared/data-changes.ts`) so every view updates.
- **Settings**: add the key to `AppSettings` and `DEFAULT_SETTINGS` (`src/shared/settings.ts`); no migration needed. A setting is per user unless its key is in `SHARED_SETTINGS` (library organization, metadata sources, updates): decide which when adding it.
- **Users**: what is personal (rating, tags, progress, reading lists, reading history, achievements, settings) is read and written for the active user (`userId` getter of the repositories, ADR 0019); the library's books and metadata are common. A new personal table or column keys on the user (`user_id`).
- **Generated files**: never edit `src/routeTree.gen.ts` (committed, regenerated by the router plugin) nor `docs/reference/` (generated, not committed).
- **Commits**: Conventional Commits (`feat(reader): …`), one subject per commit; pull request titles too, since PRs are squash-merged. See `CONTRIBUTING.md`.

## Documentation rule

Any change to public behavior updates the documentation **in the same pull request**: user-visible behavior → `docs/guide/features.md`; IPC channels, shared types or exported symbols → their TSDoc; schema, settings, commands or build steps → `docs/architecture.md` / `docs/development.md` / this file; structural decisions → a new ADR in `docs/decisions/`. Every export in the TypeDoc scope (`typedoc.json`) must have a TSDoc comment. Use `/update-docs` to find what a change affects.
