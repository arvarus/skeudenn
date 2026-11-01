# Development

## Prerequisites

- Node.js 24 (see `.nvmrc`; every CI workflow uses Node 24 too). The app runs on the Node embedded in Electron (Electron 44 ships Node 24.x, see `node_version` in Electron's `DEPS`), and `node:sqlite`, which is still young, changes between Node releases: running the tests on the same major keeps them faithful to what the packaged app does. When bumping Electron, check its embedded Node major and keep `.nvmrc` and the `node-version` of the workflows in line. Electron Forge 8 needs Node 22.13 or later, which Node 24 satisfies.
- npm (the repository ships a `package-lock.json`).

## Line endings

Every text file uses LF. `.editorconfig` tells editors so, and `.gitattributes` (`* text=auto eol=lf`) makes Git store and check out LF whatever the platform or `core.autocrlf` setting, so a Windows checkout no longer brings CRLF back. After pulling this change into an existing clone, `git add --renormalize .` converts any file still committed with CRLF.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies. |
| `npm start` | `electron-forge start`: runs the app from the sources, with HMR on the renderer. Also regenerates `src/routeTree.gen.ts`. |
| `npm run dev` | The same, in [development mode](#development-mode): the app also restarts by itself when main-process code changes, and opens DevTools. |
| `npm run lint` | ESLint (flat config: `typescript-eslint`, `import-x`, `react-hooks`, `react-refresh`). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Vitest, once (`node` environment; a test that renders a component or a hook opts into jsdom, see [Testing components and hooks](#testing-components-and-hooks)). |
| `npm run test:e2e` | Playwright smoke tests of the packaged app (run `npm run package` first; on a headless Linux, prefix with `xvfb-run`). See [Smoke tests](#smoke-tests-of-the-packaged-app). |
| `npm run package` | `electron-forge package`: builds the app into `out/`. |
| `npm run make` | `electron-forge make`: builds installers for the current platform (Squirrel, ZIP on macOS, deb, rpm). |
| `npm run icons` | Renders `assets/icon.svg` into `assets/icon.png`, `icon.ico` and `icon.icns` (committed; run it after editing the SVG). |
| `npm run docs:gen` | Generates the database schema and IPC references, and checks the IPC channels of preload and main agree. |
| `npm run docs:api` | Generates the API reference with TypeDoc; fails on an undocumented export or a broken `{@link}`. |
| `npm run docs:check` | Checks that the npm scripts, file paths and relative links cited in the docs exist. |
| `npm run docs:build` | All of the above, then builds the static site with VitePress into `docs/.vitepress/dist` (fails on a dead link). |
| `npm run docs:dev` | Generates the references, then serves the docs site locally with hot reload. |

Run a single test file or a single test by name with Vitest directly:

```sh
npx vitest run src/main/db/library-repository.test.ts
npx vitest run -t "clamps the current page"
```

## Development mode

`npm run dev` is the command to use while working on the code. What happens on a change depends on the process it belongs to:

| Code changed | Without restarting by hand |
|---|---|
| Renderer (`src/routes/`, `src/components/`, `src/hooks/`, `src/lib/`…) | Hot-replaced by Vite (HMR), the page keeps its state when it can. Same with `npm start`. |
| Preload (`src/preload.ts`) | Rebuilt, then the window reloads. Same with `npm start`. |
| Main process and decoder process (`src/main.ts`, `src/main/`, `src/shared/`) | Rebuilt, then the whole app restarts (the window closes and reopens). Only in development mode; with `npm start`, type `rs` in the terminal. |

DevTools open (detached) only in development mode; with `npm start` they stay closed but can still be opened from the *View* menu or with `Ctrl+Shift+I`.

How it's wired: `forge.config.ts` recognizes `npm run dev` from `npm_lifecycle_event` and sets `TANKOBON_DEV=1`, which the Electron app inherits from Forge's process; `src/main.ts` opens DevTools when it is set and the app isn't packaged. The restart is a `postStart` hook watching `.vite/build/main.cjs` and `decoder-worker.cjs` and calling Forge's own restart (the one `rs` triggers). The Vite plugin's `hotRestart` option is not used: in Forge 8.0 it has no effect, its watch builds running in a subprocess that never receives it.

A restart kills the app without going through `will-quit`, so the database isn't closed cleanly; SQLite handles that, but a long write (a folder scan) is interrupted.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `master` and on every pull request, as independent parallel jobs: `lint`, `typecheck`, `test` and `docs` (`npm run docs:build`).

`.github/workflows/e2e.yml` runs the [smoke tests](#smoke-tests-of-the-packaged-app) every night and on demand (`workflow_dispatch`), not on pull requests: it packages the app and drives it under xvfb.

Four other workflows run on GitHub:

- `.github/workflows/docs.yml` builds the documentation and publishes it to GitHub Pages on every push to `master`.
- `.github/workflows/release-please.yml` maintains a release pull request (version bump + `CHANGELOG.md`) from the Conventional Commits merged into `master`; merging that pull request tags the release.
- `.github/workflows/build.yml` builds the installers of a release tag (`npm run make`) and attaches them to its GitHub release: Squirrel (`.exe`) on Windows, ZIP on macOS (Apple silicon), `.deb` and `.rpm` on Linux. Each platform builds on its own runner, since only the native `@napi-rs/canvas` package of the machine that ran `npm ci` gets packaged (see [Build gotchas](./architecture.md#build-gotchas)). The job fails if the tag isn't `v` + `package.json`'s version. A tag created by release-please doesn't trigger workflows (it is pushed with the default `GITHUB_TOKEN`), so `release-please.yml` calls `build.yml` itself once it has created a release; the `push: tags` trigger covers a `v*` tag pushed by hand (the release is then created if missing), and `workflow_dispatch` rebuilds an existing tag. Once the installers are attached, its `notify` job posts the release (title, link and notes) to Discord to the English and French channels through the `DISCORD_WEBHOOK_URL_EN` and `DISCORD_WEBHOOK_URL_FR` repository secrets (a channel's webhook, Settings › Integrations); a channel whose secret is missing is skipped, and without any the job does nothing. A called workflow doesn't inherit the caller's secrets, so `release-please.yml` passes both to `build.yml` explicitly.
- `.github/workflows/pr-title.yml` checks that a pull request's title follows the [commit convention](https://github.com/arvarus/tankobon/blob/master/CONTRIBUTING.md), since squash-merging turns it into the commit message on `master`.

**Token permissions**: each workflow declares the least `GITHUB_TOKEN` permissions it needs. `ci.yml`, `pr-title.yml` and `build.yml` default to `contents: read` at the workflow level; `build.yml` grants `contents: write` to its `release` job only (it creates the release and uploads the installers), so the `make` jobs, which run `npm ci` and third-party scripts, hold a read-only token. `docs.yml` adds `pages: write` and `id-token: write` for the Pages deployment, and `release-please.yml` needs `contents: write` and `pull-requests: write` to maintain the release pull request. A new workflow or job should start from `contents: read` and add only what it uses.

Dependabot (`.github/dependabot.yml`) opens one pull request a week, titled `ci(deps): bump …`, when the GitHub Actions used by these workflows have new versions. Every action is pinned to the commit SHA of its release (`uses: actions/checkout@<sha> # v7`, the tag kept as a comment), so a moved or hijacked tag can't change what runs, notably `release-please-action`, which has `contents: write`; Dependabot updates the SHA and the comment together.

## Testing components and hooks

Logic stays pure and in `src/lib/` where it can, but a hook or a component has behaviour of its own (an effect, a retry button). Such a test is `*.test.tsx`, starts with `// @vitest-environment jsdom` (the rest of the suite keeps the faster `node` environment) and uses `@testing-library/react`:

- `window.tankobon` doesn't exist in jsdom: `renderWithTankobon(ui, fake)` (`src/test/tankobon.tsx`) installs a fake of it, typed by `TankobonApi`, and renders `ui` in French inside the `I18nextProvider`. The test fakes only the methods it needs (`{ library: { removeMany: vi.fn(…) } }`); calling any other one rejects with "window.tankobon.library.x is not faked by this test", so a forgotten method fails loudly, and a `on…` listener subscription is a no-op. Import the helper before the code under test (the data store keeps the `window.tankobon` it finds when it is first imported). `libraryEntry()` (`src/test/fixtures.ts`) builds a `LibraryEntry`. A hook test that needs no component can call `installTankobon(fake)` alone.
- **What to cover in a dialog that writes** (modification, duplicates, cleanup, metadata lookup): the success path, the call that rejects (refused arguments, main process error) and the result union's `error` member. The dialog must stay open, say so with a translated message and let the user try again; a `try`/`finally` with no `catch`, or an `await` with no way out of its "busy" state, is the bug these tests exist for (`src/components/duplicates-dialog.test.tsx`, `cleanup-dialog.test.tsx`, `metadata-dialog.test.tsx`).
- jsdom has no `IntersectionObserver`/`ResizeObserver`: stub them with `vi.stubGlobal` (`src/components/reader/continuous-page.test.tsx` shows both), and `URL.createObjectURL`.
- A component using `useTranslation()` is wrapped in `<I18nextProvider i18n={i18n}>` (`@/shared/i18n`), the language set with `applyLanguage()`.
- Other examples: `src/hooks/use-comic.test.tsx` (reopening a book the decoder lost, with a guard against looping) and `src/components/reader/continuous-page.test.tsx`.

## Smoke tests of the packaged app

Vitest runs in a `node` environment by default, so most React components are covered through their pure helpers in `src/lib/` (a few have their own tests, see below). `npm run test:e2e` completes that with a few [Playwright](https://playwright.dev) tests against the *packaged* app (`out/`, built by `npm run package`), which also catches what only breaks once packaged (see [Build gotchas](./architecture.md#build-gotchas)). They are not part of `npm test`: they need the package and a display, so on a headless Linux run `xvfb-run npm run test:e2e`.

What they cover (`e2e/smoke.e2e.ts`): the app starts and `window.tankobon` exists; a CBZ opens from the library in single-page mode and its progress is saved; the continuous mode follows the scroll, saves the last page and resumes on the saved page without reporting page 1 over it; a book opened from a reading list offers the list's next book on its last page.

How it works:

- **Seeded user data**: each test starts the app on a throw-away `--user-data-dir`, whose database `e2e/app.ts` fills through the app's own `migrate()` and repositories (books, reading lists, settings), so no native file dialog is involved. The language is forced to English.
- **Generated CBZ**: `e2e/cbz.ts` builds the test books on the fly (a few tall PNGs drawn with `@napi-rs/canvas`, in an uncompressed ZIP): no binary in the repository.
- **CDP, not `_electron.launch()`**: Playwright's Electron launcher needs `--inspect`, which the packaged app refuses (the `EnableNodeCliInspectArguments` fuse is off, on purpose). The executable is started with Chromium's `--remote-debugging-port` and Playwright attaches over CDP (`chromium.connectOverCDP`), which leaves the fuses untouched. The cost: the main process can't be reached from the tests (no dialog stubbing), hence the seeding.
- **A copy in an ASCII path**: `e2e/global-setup.ts` copies the package to a temporary directory first. On Linux the packaged app exits at once, silently, when it runs from a folder holding a decomposed character such as the "ō" of the former name (`Tankōbon-linux-x64`); the copy is kept as a precaution; the same files start fine from an ASCII path, as in the deb's `/usr/lib/tankobon`.
- **CI**: `.github/workflows/e2e.yml`, nightly and on demand, on Linux only (packaging takes a few minutes and a pull request doesn't need it). It uploads `test-results/` when it fails. The code of `e2e/app.ts` also handles the Windows and macOS executables, but only Linux has been run.

## Documentation

The site's sources are in `docs/`:

- hand-written pages: `docs/guide/`, `docs/architecture.md`, `docs/development.md`, `docs/decisions/` (ADRs);
- generated pages, never edited nor committed: `docs/reference/api/` (by TypeDoc), `docs/reference/schema.md` and `docs/reference/ipc.md` (by `scripts/gen-reference.mjs`).

The API reference covers the modules listed in `typedoc.json`'s `entryPoints`. Every exported symbol there must have a TSDoc comment, or `npm run docs:api` fails.

## Dependency audit

As of 2026-10-13, `npm audit` reports 14 findings (8 high, 6 moderate) and `npm audit --omit=dev` 10 of them. None ships in the packaged app, and none is reachable by a file or an answer the app handles:

- **`upscaler` → `wireit` → `chokidar`/`fast-glob`/`micromatch` → `braces`** (high, a denial of service on deeply nested glob patterns). `upscaler` 1.0.0 declares `wireit`, a build tool, as a runtime dependency; nothing of it is in the renderer bundle (`node_modules/upscaler/dist/browser/esm` doesn't reference it). `npm audit` proposes `upscaler@0.12.3`, a downgrade of a major version: not an option.
- **`@tensorflow/tfjs` → `argparse` → `sprintf-js`** (moderate, a denial of service through unbounded precision specifiers in a format string): no fix exists. The umbrella package declares `argparse` for its own scripts; the browser entry the renderer imports (`dist/index.js`) doesn't reference it.
- **Build and docs tooling**, never shipped: `esbuild` and `vite` through `vitepress` 1.x (its bundled Vite 5; the advisory only concerns the dev server, `npm run docs:dev`, and the published site is static; no fix until VitePress 2 leaves pre-release), and `braces` again through `vite-plugin-static-copy`'s `chokidar`, which only runs at build time on the project's own files.

Re-read `npm audit` after each dependency bump: a new finding that is not in this list, or one on a package the renderer or the decoder process really loads, is a real one.

Upgrading Electron Forge to 8 removed the `extract-zip` findings (`@electron/packager` 20 no longer depends on it) and made the former `tar`/`tmp` `overrides` unnecessary; `npm audit fix` took care of `brace-expansion`, `fast-uri` and `ip-address`.

Majors deliberately left behind:

- `@tensorflow/tfjs` stays on `~4.11.0`, the range `upscaler` itself requires.
- TypeScript 7 and `@types/node` above 22: not needed by any fix, to be done as their own change.
