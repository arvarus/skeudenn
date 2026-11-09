# Contributing

## Workflow

1. Branch off `master`.
2. Make the change, with its tests and its documentation (see below).
3. Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run docs:build`; CI runs the same four.
4. Open a pull request whose **title** follows the commit convention. Pull requests are squash-merged, so the title becomes the commit message on `master`, and that message feeds the changelog.

## Documentation rule

**Any change to public behavior updates the documentation in the same pull request.** Public behavior means:

- what the user sees or does (update `docs/guide/features.md`);
- an IPC channel, a type in `src/shared/`, or an exported symbol in the API reference scope (update its TSDoc: the reference is generated from it);
- the database schema, a setting, a command or a build step (update `docs/architecture.md`, `docs/development.md` or `CLAUDE.md`);
- a structural decision (add an ADR in `docs/decisions/`).

`npm run docs:build` fails on an undocumented export, a broken link, a cited file that no longer exists, or a cited npm script that doesn't exist. The `/arvarus-tools:update-docs` Claude Code command (shared `arvarus-tools` plugin, enabled in `.claude/settings.json`) helps find what a change affects. The `/arvarus-tools:audit` command (same plugin) reviews the code base, a directory or the changes since a ref for logic errors, security issues, dead code, refactorings, best practices and architecture evolutions, and writes a prioritized report without changing the code.

## Commit convention

Commits (and pull request titles) follow [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/), checked by commitlint with `@commitlint/config-conventional` (`commitlint.config.mjs`):

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

| Type | Use for | In the changelog |
|---|---|---|
| `feat` | A new user-visible feature | Features (minor bump) |
| `fix` | A bug fix | Bug Fixes (patch bump) |
| `perf` | A performance improvement | Performance Improvements |
| `docs` | Documentation only | Documentation |
| `refactor` | Code change that neither fixes a bug nor adds a feature | hidden |
| `test` | Tests only | hidden |
| `build` | Build system, packaging, dependencies | hidden |
| `ci` | CI configuration | hidden |
| `chore` | Anything else (tooling, housekeeping) | hidden |
| `style` | Formatting only | hidden |
| `revert` | Reverts a previous commit | Reverts |

A breaking change adds `!` after the type/scope (`feat(reader)!: …`) or a `BREAKING CHANGE:` footer. While the version is `0.x`, it bumps the minor version.

Scopes are optional; prefer the code areas: `reader`, `library`, `settings`, `db`, `archives`, `ipc`, `api` (TSDoc), `docs`, `release`.

Check a message locally:

```sh
echo "feat(reader): add a page thumbnail strip" | npx commitlint
```

## Releases

`.github/workflows/release-please.yml` keeps a release pull request open on `master`, updated with every conventional commit merged since the last release: it bumps `package.json`'s version and writes `CHANGELOG.md`. Merging that pull request creates the Git tag and the GitHub release. The same workflow then runs `.github/workflows/build.yml`, which builds the installers on Windows, macOS and Linux and attaches them to that release (see [Development](docs/development.md#continuous-integration)).
