# 0032. Author search links: the renderer names a site and a name, the main process builds the URL

- **Status:** Accepted
- **Date:** 2026-11-28

## Context

The author's page offers buttons that open a search for the author on reference sites (Wikipédia, Bédéthèque, Comic Vine, MyAnimeList, Google) in the system browser. Until now the renderer could only ask the main process to open one of a few fixed pages (`app:open-link` takes a key of `APP_LINKS`, [ADR 0001](./0001-electron-process-isolation.md) and the "À propos" section of the architecture page), so that a compromised renderer could not make `shell.openExternal` open anything. A search address depends on a name typed by someone, so a key alone no longer names it.

## Decision

- **A new channel, `app:open-author-search`, takes a provider id and a name**, not a URL. The ids are the keys of `AUTHOR_SEARCH_PROVIDERS` (`src/shared/author-search.ts`), a declarative list (`id`, `label`, `icon`, `urlPattern`) used by both sides; the renderer builds its buttons from it, the main process validates against it.
- **The main process builds the address.** The handler refuses an unknown id, an empty name or one over `MAX_AUTHOR_NAME_LENGTH` (200) characters (`handle()` and the guards of `validate.ts`, [ADR 0009](./0009-ipc-argument-validation.md) and [ADR 0011](./0011-ipc-handle-wrapper-and-open-tokens.md)), builds the URL with the pure `buildSearchUrl()` (name normalized and URL-encoded into the pattern's `{q}`), and `authorSearchUrl()` then checks that the result is an `https:` URL, without credentials, on the host of the provider's own pattern. Only then does it call `shell.openExternal`. The name can only end up in the query string, never in the scheme or the host.
- **No network call by the app.** The address is only opened in the browser: no API, no scraping, no key, and the renderer's CSP is unchanged.
- **Local icons.** The sites' logos are trademarks and the CSP allows no remote image, so each button carries a small SVG monogram drawn by the app (`AuthorSearchIcon`), with a generic globe for a provider that has none.

## Consequences

- The trust model of `app:open-link` stays true in spirit: the renderer cannot make the main process open an address of its choosing, only one of a fixed set of search pages on fixed hosts, filled with a text that cannot leave the query string. The tests of `src/main/ipc/app.test.ts` pin the refusals and the host check.
- Adding a site is one entry in `AUTHOR_SEARCH_PROVIDERS` (and a monogram); nothing to change in the channel or the preload.
- The search patterns depend on the sites' own search pages, which can change without notice; the Bédéthèque one (`search/tout?RechTexte=…&RechWhere=1`, the form "Rechercher dans tout le site" of the site) was read from a snapshot of that form, since the site could not be queried directly from the environment this was written in (Cloudflare challenge).
- Out of scope for now: choosing or ordering the sites in the settings, custom sites, direct links to an author's own page on a site, and the same buttons on series or album pages.

## Alternatives considered

- **Adding the search URLs to `APP_LINKS`**: the name varies, so it would need one entry per author.
- **A channel that opens any `https:` URL the renderer gives**: the very thing `app:open-link` was designed to avoid; a compromised renderer could open arbitrary pages.
- **Opening the link from the renderer (`<a target="_blank">`)**: `window.open` and navigation are denied by the main window on purpose.
- **Embedding the sites' favicons**: license and size, and one more file to refresh per site.
