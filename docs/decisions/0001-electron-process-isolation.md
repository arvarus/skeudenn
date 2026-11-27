# 0001. Strict Electron process isolation, one preload bridge

- **Status:** Accepted
- **Date:** recorded 2026-09-30 (the decision predates this record)

## Context

The app reads files the user picks from anywhere on disk (comic archives, PDFs, JSON exports) and renders their content in a Chromium renderer. Electron's security guidance recommends keeping Node.js out of the renderer.

## Decision

- The window is created with `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` (`src/main.ts`).
- The main process owns every privileged resource: the SQLite database, the filesystem, archive decoding and native dialogs.
- `src/preload.ts` is the only bridge: it exposes one explicit object, `window.skeudenn`, through `contextBridge`, never the raw `ipcRenderer`. Its type, `SkeudennApi`, is what the renderer sees (`src/global.d.ts`).
- The renderer only ever calls `window.skeudenn.*`.
- The window can't leave the app: `will-navigate` is cancelled for any other URL, `setWindowOpenHandler` denies every new window, and the renderer cancels the default of `dragover`/`drop` on the document, so a file dropped on the window is never opened by Chromium. The CSP also sets `base-uri 'none'`, `form-action 'none'` and `object-src 'none'`.

## Consequences

- Every new capability needs up to three changes: a handler in `src/main/ipc/`, a method in `src/preload.ts`, and (if data crosses the boundary) a type in `src/shared/`.
- The preload can't import main-process modules, so channel names are duplicated between `src/preload.ts` and `src/main/ipc/`. `npm run docs:gen` fails when the two sides don't declare the same set of channels.
- Page images cross the boundary as bytes (`ComicPage.data`); the renderer turns them into blob URLs.
- Errors meant for the user are returned as values (`{ status: 'error', message }`), because a rejected `ipcMain.handle` reaches the renderer with a generic "Error invoking remote method" prefix.

## Alternatives considered

None: Electron's recommended secure configuration was adopted from the start.
