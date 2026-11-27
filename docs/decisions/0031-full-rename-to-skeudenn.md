# 0031. Full rename to Skeudenn, without migration

- **Status:** Accepted
- **Date:** 2026-11-27

## Context

The app was called Tankōbon. Release 0.27.0 renamed what the user sees (the product name, the documentation site, the repository) and deliberately kept every technical identifier, so that existing installations kept their library: the `tankobon` package name, `window.tankobon`, the `tankobon.db` database and its `.tankobon` backup folder, the `.deletedByTankobon` parking folder, the `TANKOBON_*` environment variables, and a `userData` folder pinned to `Tankōbon` in `main.ts`.

Keeping two names had a cost: every contributor met "tankobon" in the code and "Skeudenn" on screen, the pinned `userData` path needed an explanation next to the e2e tests' `--user-data-dir`, and the Linux executable needed its own override. The app has few users today, which is the cheapest moment to end it: the owner accepted a breaking change now rather than carry the exception for good.

## Decision

Every identifier is renamed to Skeudenn, in one change, and **no migration is written**.

- **On disk**: the database is `skeudenn.db` (`DEFAULT_DB_FILE_NAME`), the backups live in `.skeudenn` and are named `skeudenn-AAAAMMJJ-HHMMSS.db` (`isBackupName()` only accepts that form), the parking folder is `.deletedBySkeudenn` (`DELETED_BY_SKEUDENN_FOLDER`), the export is offered as `skeudenn-export-….json`, and the temporary folder of a case-only rename is `.skeudenn-case-*`. The `userData` pin of `main.ts` is removed: Electron derives the folder from `productName`, so a fresh install uses its own `Skeudenn` folder.
- **In the code**: `window.skeudenn` and `SkeudennApi` (preload, `global.d.ts`, the renderer, the tests and the reference generator), the drag type `application/x-skeudenn-entry`, `SKEUDENN_DEV` and `SKEUDENN_E2E_APP`, `src/test/skeudenn.tsx`, the Comic Vine `User-Agent`. The IPC channel strings never contained the name and don't change.
- **Packaging**: the package name is `skeudenn` (`package.json`, `package-lock.json`, `release-please-config.json`), which gives the Squirrel installer and the deb/rpm packages a new identity, and the Linux executable is `skeudenn` (`/usr/lib/skeudenn`).
- **Hidden folders are never walked.** In the same change the special case for the parking folder, which the scan and the orphan-folder search skipped by name, becomes a rule: a folder whose name starts with a dot (`.cache`, `.git`, `.Trash`…) is never entered by a walk of the library, at any depth and in every library folder (`isHiddenFolderName()`, `src/shared/library.ts`, used by `collectComicFiles()` and `findOrphanFolders()`). The folder given to a walk is walked whatever its name, and a folder holding a hidden folder is not an orphan, so the hidden content is never moved with it. The parking folder is still addressed by name where it is created, emptied, counted and used by the conversions: those are not walks. The rule has no list of legacy names, so the old `.deletedByTankobon` and `.tankobon` folders stay ignored without being mentioned in the code.

## Consequences

For an existing user, the first start after the update is a fresh install:

- **The library is empty.** The database, the users, the settings, the roots file and the thumbnails stay in the old `Tankōbon` folder of the user's application data, which the app no longer reads. To recover, close the app, then copy `tankobon.db` from that folder to `skeudenn.db` in the new `Skeudenn` folder (or in the folder the database location points at). An export made before the update can also be imported.
- **The old install is not replaced.** The Squirrel installer on Windows and the `tankobon` deb/rpm package on Linux have another identity: both apps stay installed side by side until the old one is uninstalled by hand.
- **The old folders are left alone.** A `.deletedByTankobon` folder is ignored by the walks (it is hidden) but no longer emptied by the app, neither by "Vider le dossier" nor by the automatic emptying, which address `.deletedBySkeudenn`: it has to be deleted by hand. The same goes for a `.tankobon` backup folder, which is no longer listed, restored or pruned.
- The documentation, the tests and the reference no longer need to explain two names; `npm run docs:gen` fails if the preload and the interface drift apart, as before.
- A comic left in a hidden folder is not part of the library any more, even when the user picked such a folder inside a library folder: only the folder picked itself is always walked.

## Alternatives considered

- **Migrating the data** (copying `Tankōbon/tankobon.db` to the new folder at first start): kept the library but meant carrying the old names in the code for good, which was the point to get rid of, and a copy of a database that a still-installed old version may keep writing to. Rejected for a handful of users who can recover by hand.
- **Keeping the technical identifiers** (the 0.27.0 situation): no break, but the double naming stays for ever.
- **A list of ignored folder names** (`.deletedByTankobon`, `.deletedBySkeudenn`): needs the old name in the code. The generic dot rule covers both, and the folders users already keep out of their library by habit.
