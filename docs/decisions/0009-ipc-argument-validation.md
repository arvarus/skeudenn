# 0009. IPC arguments validated in the main process

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

[ADR 0001](./0001-electron-process-isolation.md) isolates the renderer, but everything it sends over `window.skeudenn` still reaches handlers that trusted the TypeScript types of `SkeudennApi`. Types don't exist at run time: a buggy or compromised renderer could call `library.updateTags(id, null)` (stored as the string `"null"`, which then crashed the library page), `comic.open()` on any path of the disk, or `settings.set()` with any key and value. The JSON import had the same weakness for settings (`readingMode: "webtoon"`, `pageSpacing: -400` were accepted since only the `typeof` was checked). And `settings:get-all` handed the metadata API keys to every view.

## Decision

- **Every handler checks its arguments**, typed `unknown`, with the guards of `src/main/ipc/validate.ts` (`expectString`, `expectInteger`, `expectStringArray`, `expectMetadataUpdate`…) before touching a repository or the filesystem. A refused call rejects with an `IpcArgumentError`; it is a programming error or a hostile call, never shown to the user, so its message isn't translated. Errors the user can cause keep returning result-union values.
- **Settings have one validator per key** (`SETTING_VALIDATORS`, `src/shared/settings.ts`), typed so that a new setting can't be added without one. `settings:set` and the JSON import's `toSettings()` both use it: unknown key, wrong type or out-of-range value (a `readerBackground` that isn't `#rrggbb`, a `pageSpacing` outside 0–1000) is refused, the import falling back to the default for that key.
- **`comic:open` only opens known paths**: a path of the library, or the one `comic:pick-file` returned last. The renderer never opens a file by any other route (library rows, the reader's "open" button and the home page all go through one of the two).
- **API keys have their own channel**: `settings:get-all` returns `PublicSettings` (no keys); the Métadonnées page loads them with `settings:get-api-keys` and writes them with `settings:set`. The main process still reads them directly for lookups and exports.

## Consequences

- A new IPC handler must validate its arguments the same way; reviewers should refuse a handler that types a parameter as anything but `unknown` before checking it.
- The guards are pure and unit-tested (`validate.test.ts`, `settings.test.ts`).
- This is defense in depth, not a boundary of its own: the keys are still in the renderer's memory while the Métadonnées page is open, and `comic:open` still accepts any file the user picked or imported into the library, whatever its content.

## Alternatives considered

- **A schema library (zod…)** for every channel: heavier than the dozen shapes involved, and the guards double as TypeScript narrowing without a new dependency.
- **Masking the keys in `getAll()` but keeping them writable only**: the page needs to show the current value, hence the dedicated read channel.
