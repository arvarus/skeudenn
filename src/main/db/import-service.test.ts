import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { DEFAULT_SETTINGS } from '../../shared/settings';
import { buildExport } from './export-service';
import { applyImport, parseExport, readExportFile } from './import-service';
import { LibraryRepository } from './library-repository';
import { ReadingListRepository } from './reading-list-repository';
import { migrate } from './schema';
import { SettingsRepository } from './settings-repository';

// The user-facing messages are checked in French; English is the interface's default.
beforeAll(() => applyLanguage('fr'));

function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return db;
}

describe('parseExport', () => {
  it('rejects a file that is not JSON', () => {
    expect(() => parseExport('not json')).toThrow(/JSON valide/);
  });

  it('rejects JSON that is not a Tankobon export', () => {
    expect(() => parseExport('{"hello":"world"}')).toThrow(/export Skeudenn/);
    expect(() => parseExport('{"version":2,"library":[]}')).toThrow(/export Skeudenn/);
  });

  it('accepts what buildExport produces', () => {
    const db = createDatabase();
    const libraryRepo = new LibraryRepository(db);
    libraryRepo.touch('/comics/one.cbz', 'One', 20, 22, 123456);
    const raw = JSON.stringify(buildExport(libraryRepo, new SettingsRepository(db), new ReadingListRepository(db)));

    const parsed = parseExport(raw);

    expect(parsed.library).toHaveLength(1);
    expect(parsed.library[0]).toMatchObject({ path: '/comics/one.cbz', title: 'One', pageCount: 20 });
    expect(parsed.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('only keeps entries whose path is an absolute path of a supported comic', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [
          { path: '/comics/ok.cbz' },
          { path: 'C:\\Comics\\windows.PDF' },
          { path: 'relative/one.cbz' },
          { path: '/home/me/.ssh/id_rsa' },
          { path: '/comics/notes.txt' },
        ],
      }),
    );

    expect(parsed.library.map((entry) => entry.path)).toEqual(['/comics/ok.cbz', 'C:\\Comics\\windows.PDF']);
  });

  it('refuses network and device paths, which would make Windows reach out to another host', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [
          { path: '\\\\attacker\\share\\one.cbz' },
          { path: '//attacker/share/two.cbz' },
          { path: '\\\\?\\UNC\\attacker\\share\\three.cbz' },
          { path: '/comics/ok.cbz' },
        ],
      }),
    );

    expect(parsed.library.map((entry) => entry.path)).toEqual(['/comics/ok.cbz']);
  });

  it('drops unusable entries, fills in missing fields and clamps the current page', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [
          { title: 'No path' },
          { path: '/comics/two.cbz', pageCount: 10, currentPage: 99, rating: 12, tags: ['Lu', 7] },
        ],
      }),
    );

    expect(parsed.library).toHaveLength(1);
    expect(parsed.library[0]).toMatchObject({
      path: '/comics/two.cbz',
      title: '/comics/two.cbz',
      currentPage: 9,
      rating: 5,
      tags: ['Lu'],
    });
  });

  it('keeps a valid measured page size and drops a half-written one (to be measured again)', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [
          { path: '/a.cbz', avgPageWidth: 1200.7, avgPageHeight: 1800 },
          { path: '/b.cbz', avgPageWidth: 1200 },
          { path: '/c.cbz' },
        ],
      }),
    );

    expect(parsed.library.map((entry) => [entry.avgPageWidth, entry.avgPageHeight])).toEqual([
      [1200, 1800],
      [null, null],
      [null, null],
    ]);
  });

  it('refuses out-of-range setting values, keeping the defaults', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [],
        settings: { readingMode: 'webtoon', pageSpacing: -400, readerBackground: 'url(x)', readingDirection: 'rtl' },
      }),
    );
    expect(parsed.settings).toEqual({ ...DEFAULT_SETTINGS, readingDirection: 'rtl' });
  });

  it('ignores unknown settings keys and values of the wrong type', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [],
        settings: { readingDirection: 'rtl', pageSpacing: 'wide', nope: true },
      }),
    );

    expect(parsed.settings).toEqual({ ...DEFAULT_SETTINGS, readingDirection: 'rtl' });
    expect(parsed.settings).not.toHaveProperty('nope');
  });

  it('keeps a supported language and turns any other back into `system`', () => {
    const parse = (language: string) =>
      parseExport(JSON.stringify({ version: 1, library: [], settings: { language } })).settings.language;

    expect(parse('fr')).toBe('fr');
    expect(parse('system')).toBe('system');
    expect(parse('de')).toBe('system');
  });
});

describe('applyImport', () => {
  let db: DatabaseSync;
  let libraryRepo: LibraryRepository;
  let settingsRepo: SettingsRepository;
  let readingListRepo: ReadingListRepository;

  beforeEach(() => {
    db = createDatabase();
    libraryRepo = new LibraryRepository(db);
    settingsRepo = new SettingsRepository(db);
    readingListRepo = new ReadingListRepository(db);
  });

  it('adds unknown comics, overwrites known ones and leaves the rest alone', () => {
    const known = libraryRepo.touch('/comics/one.cbz', 'One', 20, 22, 123456);
    libraryRepo.updateRating(known.id, 1);
    libraryRepo.touch('/comics/local-only.cbz', 'Local', 5, 5, 10);

    const summary = applyImport(
      db,
      libraryRepo,
      settingsRepo,
      readingListRepo,
      parseExport(
        JSON.stringify({
          version: 1,
          library: [
            { path: '/comics/one.cbz', title: 'One', pageCount: 20, currentPage: 7, rating: 4, tags: ['Lu'] },
            { path: '/comics/new.cbz', title: 'New', pageCount: 30 },
          ],
        }),
      ),
    );

    expect(summary).toEqual({ added: 1, updated: 1 });
    const byPath = Object.fromEntries(libraryRepo.list().map((entry) => [entry.path, entry]));
    expect(Object.keys(byPath)).toHaveLength(3);
    expect(byPath['/comics/one.cbz']).toMatchObject({ id: known.id, currentPage: 7, rating: 4, tags: ['Lu'] });
    expect(byPath['/comics/new.cbz']).toMatchObject({ title: 'New', pageCount: 30 });
    expect(byPath['/comics/local-only.cbz']).toMatchObject({ title: 'Local' });
  });

  it('round-trips the looked-up metadata and credits through an export', () => {
    const entry = libraryRepo.touch('/comics/one.cbz', 'One', 20, 22, 123456);
    libraryRepo.updateMetadata(entry.id, {
      title: 'Le Lotus bleu',
      series: 'Tintin',
      volume: '5',
      releaseDate: '1936',
      language: 'fr',
      credits: [{ firstName: '', lastName: 'Hergé', role: 'author' }],
    });
    const raw = JSON.stringify(buildExport(libraryRepo, settingsRepo, readingListRepo));

    const targetDb = createDatabase();
    const target = new LibraryRepository(targetDb);
    applyImport(targetDb, target, new SettingsRepository(targetDb), new ReadingListRepository(targetDb), parseExport(raw));

    expect(target.list()[0]).toMatchObject({
      title: 'Le Lotus bleu',
      titleLocked: true,
      series: 'Tintin',
      volume: '5',
      releaseDate: '1936',
      language: 'fr',
      credits: [{ firstName: '', lastName: 'Hergé', role: 'author' }],
    });
  });

  it('drops credits without a last name or with an unknown role', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [
          {
            path: '/comics/one.cbz',
            credits: [
              { firstName: 'A', lastName: 'Ok', role: 'writer' },
              { firstName: 'B', lastName: '', role: 'writer' },
              { firstName: 'C', lastName: 'Bad', role: 'editor' },
            ],
          },
        ],
      }),
    );
    expect(parsed.library[0].credits).toMatchObject([{ lastName: 'Ok', role: 'writer' }]);
  });

  it('replaces the stored settings', () => {
    settingsRepo.set('readingMode', 'continuous');

    applyImport(
      db,
      libraryRepo,
      settingsRepo,
      readingListRepo,
      parseExport(JSON.stringify({ version: 1, library: [], settings: { readerBackground: '#ffffff' } })),
    );

    expect(settingsRepo.getAll()).toEqual({ ...DEFAULT_SETTINGS, readerBackground: '#ffffff' });
  });

  // The organized folder is where the app moves files, and `settings:set` refuses it: an edited export must not set it.
  it('keeps the settings only the main process writes', () => {
    settingsRepo.set('libraryOrganizationFolder', '/comics/organized');
    settingsRepo.set('lastBackupAt', '2026-01-01T00:00:00.000Z');

    applyImport(
      db,
      libraryRepo,
      settingsRepo,
      readingListRepo,
      parseExport(
        JSON.stringify({
          version: 1,
          library: [],
          settings: {
            libraryOrganization: 'always',
            libraryOrganizationFolder: '/home/someone',
            lastBackupAt: '2030-01-01T00:00:00.000Z',
            readerBackground: '#ffffff',
          },
        }),
      ),
    );

    expect(settingsRepo.getAll()).toMatchObject({
      libraryOrganization: 'always',
      readerBackground: '#ffffff',
      libraryOrganizationFolder: '/comics/organized',
      lastBackupAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('round-trips reading lists, matching their books by path', () => {
    const one = libraryRepo.touch('/comics/one.cbz', 'One', 20, 22, 1);
    const two = libraryRepo.touch('/comics/two.cbz', 'Two', 20, 22, 1);
    const created = readingListRepo.create('Pile');
    if (created.status !== 'ok') throw new Error(created.message);
    readingListRepo.addEntry(created.list.id, two.id);
    readingListRepo.addEntry(created.list.id, one.id);
    const raw = JSON.stringify(buildExport(libraryRepo, settingsRepo, readingListRepo));

    const targetDb = createDatabase();
    const target = new LibraryRepository(targetDb);
    // The target already knows one.cbz, under its own id.
    const local = target.touch('/comics/one.cbz', 'One', 20, 22, 1);
    const targetLists = new ReadingListRepository(targetDb);
    applyImport(targetDb, target, new SettingsRepository(targetDb), targetLists, parseExport(raw));

    const [list] = targetLists.list();
    const twoId = target.list().find((entry) => entry.path === '/comics/two.cbz')?.id;
    expect(list).toMatchObject({ id: created.list.id, name: 'Pile', entryIds: [twoId, local.id] });
  });

  it("applies the snapshot's order of the reading lists, local-only lists last", () => {
    const local = readingListRepo.create('Locale');
    const shared = readingListRepo.create('Partagée');
    if (local.status !== 'ok' || shared.status !== 'ok') throw new Error('create failed');

    applyImport(
      db,
      libraryRepo,
      settingsRepo,
      readingListRepo,
      parseExport(
        JSON.stringify({
          version: 1,
          library: [],
          readingLists: [
            { id: 'new', name: 'Nouvelle', createdAt: '2024-01-01', paths: [] },
            { id: shared.list.id, name: 'Partagée', createdAt: shared.list.createdAt, paths: [] },
          ],
        }),
      ),
    );

    expect(readingListRepo.list().map((list) => list.name)).toEqual(['Nouvelle', 'Partagée', 'Locale']);
  });

  it('drops broken reading lists and paths missing from the library', () => {
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [{ path: '/comics/one.cbz' }],
        readingLists: [
          { name: 'No id' },
          { id: 'x', name: '  ' },
          { id: 'l1', name: 'Pile', paths: ['/comics/one.cbz', '/comics/gone.cbz', 3] },
        ],
      }),
    );
    expect(parsed.readingLists).toHaveLength(1);

    applyImport(db, libraryRepo, settingsRepo, readingListRepo, parsed);

    expect(readingListRepo.get('l1')?.entryIds).toEqual([libraryRepo.list()[0].id]);
  });

  it('writes nothing when an error interrupts the import', () => {
    libraryRepo.touch('/comics/local.cbz', 'Local', 5, 5, 10);
    settingsRepo.set('language', 'fr');
    const parsed = parseExport(
      JSON.stringify({
        version: 1,
        library: [{ path: '/comics/new.cbz', title: 'New', pageCount: 3 }],
        readingLists: [{ id: 'l1', name: 'Pile', paths: ['/comics/new.cbz'] }],
        settings: { language: 'en' },
      }),
    );
    // The failure comes after the library and the reading lists were written.
    vi.spyOn(settingsRepo, 'set').mockImplementation(() => {
      throw new Error('disk full');
    });

    expect(() => applyImport(db, libraryRepo, settingsRepo, readingListRepo, parsed)).toThrow('disk full');

    expect(libraryRepo.list().map((entry) => entry.path)).toEqual(['/comics/local.cbz']);
    expect(readingListRepo.list()).toEqual([]);
    expect(db.isTransaction).toBe(false);
  });
});

describe('readExportFile', () => {
  it('reads a file, and refuses one above the limit before reading it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tankobon-import-'));
    try {
      const file = join(dir, 'export.json');
      await writeFile(file, '{"version":1}');
      expect(await readExportFile(file)).toBe('{"version":1}');
      await expect(readExportFile(file, 5)).rejects.toThrow('trop volumineux');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
