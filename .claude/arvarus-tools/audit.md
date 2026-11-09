# Project notes for `/arvarus-tools:audit`

Skeudenn is an Electron app reading untrusted files (archives, PDFs), untrusted JSON (imports) and untrusted HTML (Bédéthèque pages).

## Scope

- Default scope: the whole of `src/`, plus `forge.config.ts`, the `vite.*.config.mts` files, `index.html`, `scripts/` and `.github/workflows/`.
- Ignore `src/routeTree.gen.ts`, `docs/reference/`, `node_modules/`, `.vite/` and `out/`.
- Read the relevant sections of `docs/architecture.md` and `docs/decisions/` first.
- Subagents can split the work per layer: main, preload, renderer.

## Automatic signals

- `npm run lint`, `npm run typecheck`, `npm test`.
- An export kept for TypeDoc (`typedoc.json` scope) is not dead.
- Compare `npm audit --omit=dev` with the "Dependency audit" section of `docs/development.md`.
- Prove findings with `npx vitest run` on a test in the scratchpad.

## Logic errors

- Async: races between an IPC call and an unmount or a book switch, resources closed while a read is in flight (see "CBZ: closing while reading" in `docs/architecture.md` for the pattern), shared state between concurrent calls (the CBR wasm module, `ThumbnailCache`'s queue).
- Database: the three library writers (`touch()`, `register()`, `upsert()`) keeping their documented rules, explicit deletions (foreign keys are off), positions with gaps, `COLLATE NOCASE` matches, transactions around multi-statement writes.
- Boundaries: off-by-one on page indexes (`current_page` vs page count, RTL), empty library, empty list, `MAX_READING_LIST_SIZE`, a file deleted or moved since it was added, dates with partial precision.
- Error paths: an IPC handler that throws where the convention is a `{ status: 'error', message }` result.

## Security

- The window's `webPreferences` in `src/main.ts` (`contextIsolation`, `nodeIntegration`, `sandbox`, no `webSecurity: false`), navigation and `window.open` handling, the CSP in `index.html` (each `img-src`/`connect-src` origin justified).
- `src/preload.ts`: only narrow, typed functions are exposed, never `ipcRenderer` itself or a generic `invoke(channel, …)`.
- Every `ipcMain.handle` in `src/main/ipc/`: arguments validated as if a compromised renderer sent them (types, ids, and above all **file paths**: can the renderer make main read, write or delete an arbitrary file?). `shell.openExternal` only with fixed URLs (`APP_LINKS`).
- Archives (`src/main/services/`): path traversal in entry names, decompression bombs (entry count, total size, image dimensions), malformed PDFs.
- Import: `parseExport()` trusting nothing (prototype pollution through `__proto__` keys, huge arrays, wrong types).
- Network: the scraped HTML never reaching the renderer as markup (`dangerouslySetInnerHTML`), API keys never logged nor sent to the renderer beyond the settings page.
- Dependencies with known advisories that ship in the packaged app.

## Dead code

- Settings keys in `AppSettings` but never read.
- IPC channels exposed by the preload but never called by the renderer (or handled in main but never exposed): check them with the same lists `npm run docs:gen` compares.

## Refactorings

- Look for duplication between the three archive implementations, the metadata clients, the reading-list and library repositories, the settings sections.
- Pure, tested helpers belong in `src/lib/` or `src/shared/` (the project's convention).

## Best practices

- `CLAUDE.md` "Conventions" and "Documentation rule": UI strings through i18next with keys in both `src/locales/en/` and `src/locales/fr/`, English code, `@/` imports in the renderer only, result unions for user errors, a new `MIGRATIONS` entry (`addColumnIfMissing()` for columns) for schema changes, TSDoc on exports in the TypeDoc scope, colocated tests.
- Performance traps: N+1 queries, a whole library re-rendered on each keystroke, archives opened in parallel.

## Architecture

- Growth axes: library size, new formats, new metadata sources, sync between machines, a people page.
- Look at the process boundaries (main, decoder, preload, renderer), the IPC surface, the database schema and its migrations, the renderer's data loading (`DataStore`, ADR 0013), and the test strategy.
- New ADRs use `docs/decisions/template.md`.
