# Skeudenn

**Skeudenn, lecteur de BD, mangas et comics** (formerly Tankōbon). Desktop library manager and reader for digital comics, BD and manga (CBZ, CBR and PDF). Everything stays on your machine: the library, reading progress, ratings, tags, reading lists and book information live in a local SQLite file. Looking a book up in Comic Vine or Google Books, or reading its Bédéthèque page from a pasted link, is optional and only sends the search text or fetches that page.

Built with Electron, React 19 and TypeScript.

## Install

Installers for Windows, macOS (Apple silicon) and Linux (`.deb`, `.rpm`) are attached to each [GitHub release](https://github.com/arvarus/tankobon/releases).

From source: requires Node.js 24 (see `.nvmrc`).

```sh
npm install
```

## Run

```sh
npm run dev        # development mode: hot reload of the UI, auto-restart on main-process changes, DevTools
npm start          # the app from the sources, with hot reload of the UI
npm test           # unit tests
npm run make       # installers for the current platform
```

## Documentation

**https://arvarus.github.io/tankobon/**, built from `docs/`:

- [Features](docs/guide/features.md)
- [Development](docs/development.md): all commands, CI, releases
- [Architecture](docs/architecture.md) and [decision records](docs/decisions/index.md)
- API reference, IPC channels and database schema: generated from the code (`npm run docs:dev` to browse them locally)

Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE). Skeudenn is provided "as is", without warranty of any kind: keep backups of your comics and export your library regularly.
