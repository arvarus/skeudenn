# 0019. Several users on one library, without passwords

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

Skeudenn was a single-user app: one library, one set of ratings, reading lists, progress and settings. People sharing a computer (a family, a flatmate) share the comics too, but not their place in a book, their stars or their reading lists. The request is deliberately light: a nickname, no password, an optional picture, a menu in the sidebar to switch users, and a profile page; the library and its organization stay common.

## Decision

- **A user is a row** of `users` (`id`, `nickname`, `avatar` BLOB, `avatar_type`, `created_at`, `last_active_at`). There is no authentication: switching users is a convenience, not a security boundary, and the interface says so.
- **Personal data is keyed by user, the library is not.** Rating, tags, progress, completion date and last opening move to `user_books` (one row per user and book, created on first touch); reading lists and reading sessions get a `user_id`; achievements and settings get per-user tables (`user_achievements`, `user_settings`). `library` keeps the books and their metadata, shared by everyone. The settings that describe the library or the app's technical side (`SHARED_SETTINGS`: folders, organization, resynchronization, updates; the metadata sources and keys were shared at first and became personal in migration 10) stay in `settings`.
- **The active user lives in the main process.** `UserRepository.activeId()` is the user with the latest `last_active_at`, so the app reopens on the last one; the repositories receive a `userId` getter and scope every personal query to it. The renderer never names a user in a personal call, so it can't read or write another user's data by passing an id.
- **Migration 7** makes a first user (nickname from the OS session) and hands them everything that exists, so an upgrade changes nothing visible. The old personal columns of `library` are left in place, unused.
- **Switching** emits `data:changed` `{ scope: 'users' }`; the renderer's store drops the personal slices, reloads them and discards answers requested before the switch.
- **The picture** is picked by the main process (no path in the renderer), shrunk to a 256 px square WebP by the renderer, validated again in the main process (format by magic bytes, at most 256 KiB) and stored in the database.

## Consequences

- Every personal read of the library now joins `user_books` (`LEFT JOIN` on the primary key, indexed): the 20 000-book target is unaffected in practice, and the renderer still filters in memory.
- A new user starts empty: default settings (including the language), no progress, no lists. Copying another user's settings is a possible follow-up.
- The exports, the import and "Effacer la bibliothèque…" act on the active user's personal data; clearing removes the books for everyone. There is no way yet to delete a user.
- Anyone can switch to any user: nothing protects one user's reading habits from another. A password would need a different threat model (and a way to recover from forgetting it).
- A new personal table or column must be keyed by user, and a new setting is personal unless added to `SHARED_SETTINGS`.

## Alternatives considered

- **One database file per user**: would duplicate the library and its folders, and the organization of the files would diverge; the shared library is the point.
- **Copying the library per user (`user_id` on `library`)**: same duplication, and a metadata fix would have to be made once per user.
- **Storing the picture as a file in `userData`**: the request asks for it in the database when possible, and a synced database then carries the pictures along.
- **Resizing the picture in the main process or the decoder**: needs a native image decoder call for a file the user picked themselves, which the renderer's own sandboxed canvas does without a new decoder method.
