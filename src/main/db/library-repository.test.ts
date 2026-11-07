import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryRepository } from './library-repository';
import { PathRoots } from './path-roots';
import { migrate } from './schema';

function createRepository(): LibraryRepository {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return new LibraryRepository(db);
}

describe('LibraryRepository', () => {
  let repo: LibraryRepository;

  beforeEach(() => {
    repo = createRepository();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a new entry on first touch', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 123456);
    expect(entry).toMatchObject({
      path: '/comics/one.cbz',
      title: 'One',
      pageCount: 20,
      currentPage: 0,
      fileCount: 22,
      fileSize: 123456,
      rating: 0,
      tags: [],
    });
    expect(repo.list()).toHaveLength(1);
  });

  it('stores the average page size, and lists the books still to measure', () => {
    const a = repo.touch('/comics/a.cbz', 'A', 20, 22, 1);
    const b = repo.touch('/comics/b.cbz', 'B', 20, 22, 1);
    expect(a).toMatchObject({ avgPageWidth: null, avgPageHeight: null });
    expect(repo.unmeasured().map((entry) => entry.id).sort()).toEqual([a.id, b.id].sort());

    expect(repo.updateImageStats(a.id, 1200, 1800)).toMatchObject({ avgPageWidth: 1200, avgPageHeight: 1800 });

    expect(repo.unmeasured()).toEqual([{ id: b.id, path: '/comics/b.cbz' }]);
    // Opening the book again refreshes its other fields, not its measure.
    expect(repo.touch('/comics/a.cbz', 'A', 20, 22, 1)).toMatchObject({ avgPageWidth: 1200, avgPageHeight: 1800 });
    expect(repo.updateImageStats('unknown', 1, 1)).toBeNull();
  });

  it('reuses the existing entry for the same path', () => {
    const first = repo.touch('/comics/one.cbz', 'One', 20, 22, 123456);
    const second = repo.touch('/comics/one.cbz', 'One', 20, 22, 123456);
    expect(second.id).toBe(first.id);
    expect(repo.list()).toHaveLength(1);
  });

  it('refreshes file count and size on touch', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    const reopened = repo.touch('/comics/one.cbz', 'One', 20, 25, 2000);
    expect(reopened.id).toBe(entry.id);
    expect(reopened).toMatchObject({ fileCount: 25, fileSize: 2000 });
  });

  it('clamps the current page if the page count shrinks', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateProgress(entry.id, 15);
    const reopened = repo.touch('/comics/one.cbz', 'One', 10, 12, 1000);
    expect(reopened.currentPage).toBe(9);
  });

  it('persists reading progress', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateProgress(entry.id, 7);
    expect(repo.list()[0].currentPage).toBe(7);
  });

  it('persists a rating without touching it back to 0 on reopen', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateRating(entry.id, 4);
    const reopened = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    expect(reopened.rating).toBe(4);
  });

  it('persists tags without touching them back to empty on reopen', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateTags(entry.id, ['Lu', 'Favori']);
    const reopened = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    expect(reopened.tags).toEqual(['Lu', 'Favori']);
  });

  it('overwrites tags on repeated writes', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateTags(entry.id, ['À lire']);
    repo.updateTags(entry.id, ['Lu']);
    expect(repo.list()[0].tags).toEqual(['Lu']);
  });

  it('registers a scanned comic without marking it as opened', () => {
    expect(repo.hasPath('/comics/one.cbz')).toBe(false);
    expect(repo.register('/comics/one.cbz', 'One', 20, 22, 1000)).toBe('created');

    const [entry] = repo.list();
    expect(entry).toMatchObject({ path: '/comics/one.cbz', title: 'One', pageCount: 20, currentPage: 0 });
    expect(entry.lastOpenedAt).toBe(entry.addedAt);
    expect(repo.hasPath('/comics/one.cbz')).toBe(true);
  });

  it('leaves an already known comic alone when registering it again', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateProgress(entry.id, 7);
    repo.updateTags(entry.id, ['Lu']);

    expect(repo.register('/comics/one.cbz', 'Autre titre', 99, 99, 9999)).toBe('existing');

    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0]).toMatchObject({ title: 'One', pageCount: 20, currentPage: 7, tags: ['Lu'] });
  });

  it('writes only the metadata fields given', () => {
    const entry = repo.touch('/comics/one.cbz', 'Blacksad_T02', 20, 22, 1000);
    repo.updateMetadata(entry.id, { series: 'Blacksad', volume: '2' });
    const updated = repo.updateMetadata(entry.id, { releaseDate: '2003-01', language: 'fr' });

    expect(updated).toMatchObject({
      title: 'Blacksad_T02',
      titleLocked: false,
      series: 'Blacksad',
      volume: '2',
      releaseDate: '2003-01',
      language: 'fr',
    });
    expect(repo.updateMetadata(entry.id, { series: null })?.series).toBeNull();
  });

  it('keeps a title set from metadata when the file is reopened', () => {
    const entry = repo.touch('/comics/one.cbz', 'Blacksad_T02', 20, 22, 1000);
    repo.updateMetadata(entry.id, { title: 'Arctic Nation' });

    const reopened = repo.touch('/comics/one.cbz', 'Blacksad_T02', 20, 22, 1000);
    expect(reopened).toMatchObject({ title: 'Arctic Nation', titleLocked: true });
  });

  it('returns null when updating the metadata of an unknown entry', () => {
    expect(repo.updateMetadata('missing', { series: 'X' })).toBeNull();
  });

  it('writes the same metadata on several entries, skipping unknown ids', () => {
    const one = repo.touch('/comics/one.cbz', 'One', 20, 22, 1);
    const two = repo.touch('/comics/two.cbz', 'Two', 20, 22, 1);
    const updated = repo.updateMetadataMany([one.id, two.id, 'missing', one.id], {
      series: 'Blacksad',
      credits: [{ firstName: 'Juan', lastName: 'Díaz Canales', role: 'writer' }],
    });
    expect(updated.map((entry) => entry.id)).toEqual([one.id, two.id]);
    expect(repo.get(two.id)).toMatchObject({ series: 'Blacksad', title: 'Two', titleLocked: false });
    expect(repo.get(one.id)?.credits[0].personId).toBe(repo.get(two.id)?.credits[0].personId);
  });

  it('replaces the credits, sharing people across books', () => {
    const one = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    const two = repo.touch('/comics/two.cbz', 'Two', 20, 22, 1000);
    repo.updateMetadata(one.id, {
      credits: [
        { firstName: 'Juan', lastName: 'Díaz Canales', role: 'writer' },
        { firstName: 'Juanjo', lastName: 'Guarnido', role: 'artist' },
        { firstName: 'Juanjo', lastName: 'Guarnido', role: 'colorist' },
        // Same person and role twice: kept once.
        { firstName: 'juanjo', lastName: 'GUARNIDO', role: 'artist' },
        // No last name: dropped.
        { firstName: 'Nobody', lastName: ' ', role: 'letterer' },
      ],
    });
    repo.updateMetadata(two.id, { credits: [{ firstName: 'Juanjo', lastName: 'Guarnido', role: 'artist' }] });

    const credits = repo.get(one.id)?.credits ?? [];
    expect(credits.map((c) => [c.lastName, c.role])).toEqual([
      ['Díaz Canales', 'writer'],
      ['Guarnido', 'artist'],
      ['Guarnido', 'colorist'],
    ]);
    expect(repo.get(two.id)?.credits[0].personId).toBe(credits[1].personId);

    repo.updateMetadata(one.id, { credits: [] });
    expect(repo.list().find((e) => e.id === one.id)?.credits).toEqual([]);
    expect(repo.list().find((e) => e.id === two.id)?.credits).toHaveLength(1);
  });

  it('keeps metadata and credits when the file is reopened or rescanned', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateMetadata(entry.id, { series: 'S', credits: [{ firstName: '', lastName: 'Hergé', role: 'author' }] });

    repo.register('/comics/one.cbz', 'One', 20, 22, 1000);
    const reopened = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    expect(reopened.series).toBe('S');
    expect(reopened.credits).toMatchObject([{ firstName: '', lastName: 'Hergé', role: 'author' }]);
  });

  it('removes an entry along with its credits', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateMetadata(entry.id, { credits: [{ firstName: '', lastName: 'Hergé', role: 'author' }] });
    repo.remove(entry.id);
    expect(repo.list()).toHaveLength(0);
    // Re-adding the same file starts without the old credits.
    expect(repo.touch('/comics/one.cbz', 'One', 20, 22, 1000).credits).toEqual([]);
  });

  it('removes an entry', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.remove(entry.id);
    expect(repo.list()).toHaveLength(0);
  });

  // `touch` stamps `last_opened_at` from the clock, so two touches in the same millisecond
  // would order arbitrarily: fake time keeps the two opens genuinely apart.
  it('reports the most recently opened path, or null when the library is empty', () => {
    expect(repo.lastOpenedPath()).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
    repo.touch('/other/two.cbz', 'Two', 10, 10, 1000);
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
    repo.touch('/comics/one.cbz', 'One', 20, 22, 123456);

    expect(repo.lastOpenedPath()).toBe('/comics/one.cbz');
  });
});

describe('LibraryRepository: failed writes and bounds', () => {
  let db: DatabaseSync;
  let repo: LibraryRepository;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    migrate(db);
    repo = new LibraryRepository(db);
  });

  it('never records a page beyond the last one, nor a negative one', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateProgress(entry.id, 900_000);
    expect(repo.get(entry.id)?.currentPage).toBe(19);
    repo.updateProgress(entry.id, -4);
    expect(repo.get(entry.id)?.currentPage).toBe(0);
  });

  it('clear() leaves everything in place when one of its deletions fails', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    repo.updateMetadata(entry.id, { credits: [{ firstName: '', lastName: 'Hergé', role: 'writer' }] });
    db.exec("CREATE TRIGGER no_delete BEFORE DELETE ON library BEGIN SELECT RAISE(ABORT, 'boom'); END");

    expect(() => repo.clear()).toThrow('boom');

    expect(repo.list()).toHaveLength(1);
    expect(repo.get(entry.id)?.credits).toHaveLength(1);
  });

  it('updateMetadata() writes nothing when its credits cannot be written', () => {
    const entry = repo.touch('/comics/one.cbz', 'One', 20, 22, 1000);
    db.exec("CREATE TRIGGER no_credit BEFORE INSERT ON credits BEGIN SELECT RAISE(ABORT, 'boom'); END");

    expect(() =>
      repo.updateMetadata(entry.id, { title: 'Renamed', credits: [{ firstName: '', lastName: 'Hergé', role: 'writer' }] }),
    ).toThrow('boom');

    expect(repo.get(entry.id)).toMatchObject({ title: 'One', titleLocked: false });
  });
});

describe('LibraryRepository: paths relative to a library folder', () => {
  const lib = path.resolve('/data/lib');

  function setup(): { db: DatabaseSync; repo: LibraryRepository } {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const roots = new PathRoots();
    roots.set('r1', lib);
    return { db, repo: new LibraryRepository(db, () => 'default', roots) };
  }

  it('stores a book relative to its folder and hands back the absolute path', () => {
    const { db, repo } = setup();
    const file = path.join(lib, 'S', 'a.cbz');
    const entry = repo.touch(file, 'A', 10, 10, 100);
    expect(entry.path).toBe(file);
    expect(db.prepare('SELECT path FROM library').get()).toEqual({ path: 'root:r1/S/a.cbz' });
    expect(repo.hasPath(file)).toBe(true);
  });

  it('opens the same database from a machine where the folder is elsewhere', () => {
    const { db, repo } = setup();
    repo.register(path.join(lib, 'a.cbz'), 'A', 10, 10, 100);
    const roots = new PathRoots();
    roots.set('r1', path.resolve('/mnt/share'));
    const there = new LibraryRepository(db, () => 'default', roots);
    expect(there.list()[0].path).toBe(path.join(path.resolve('/mnt/share'), 'a.cbz'));
  });

  it('makes the paths of existing books relative once their folder is known', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const roots = new PathRoots();
    const repo = new LibraryRepository(db, () => 'default', roots);
    const file = path.join(lib, 'a.cbz');
    repo.register(file, 'A', 10, 10, 100);
    expect(repo.adoptRoots()).toBe(0);
    roots.set('r1', lib);
    expect(repo.adoptRoots()).toBe(1);
    expect(db.prepare('SELECT path FROM library').get()).toEqual({ path: 'root:r1/a.cbz' });
    expect(repo.list()[0].path).toBe(file);
  });

  describe('a file stored under two folders at the same place', () => {
    const file = path.join(lib, 'a.cbz');

    /** The old entry is stored under `own`, the database's folder, the new one under `stale`, a leftover of another database. */
    function twins() {
      const db = new DatabaseSync(':memory:');
      migrate(db);
      const roots = new PathRoots();
      roots.set('stale', lib);
      roots.set('own', lib);
      const repo = new LibraryRepository(db, () => 'default', roots);
      const insert = db.prepare(
        `INSERT INTO library (id, path, title, page_count, current_page, added_at, last_opened_at)
         VALUES (?, ?, 'A', 10, 0, ?, ?)`,
      );
      insert.run('old', 'root:own/a.cbz', '2026-01-01', '2026-01-01');
      insert.run('new', 'root:stale/a.cbz', '2026-02-01', '2026-02-01');
      roots.limitTo(['own']);
      return { db, repo };
    }

    it('recognizes the file under the folder of the open database', () => {
      const { repo } = twins();
      expect(repo.hasPath(file)).toBe(true);
      expect(repo.idOfPath(file)).toBe('old');
    });

    it('merges the two entries into the older one and says a merge is due', () => {
      const { db, repo } = twins();
      expect(repo.hasEntriesToMerge()).toBe(true);
      expect(repo.adoptRoots()).toBe(1);
      expect(db.prepare('SELECT id, path FROM library').all()).toEqual([{ id: 'old', path: 'root:own/a.cbz' }]);
      expect(repo.hasEntriesToMerge()).toBe(false);
      expect(repo.adoptRoots()).toBe(0);
    });

    it('moves an entry alone under the folder of the open database', () => {
      const { db, repo } = twins();
      db.prepare("UPDATE library SET path = 'root:stale/b.cbz' WHERE id = 'new'").run();
      expect(repo.hasEntriesToMerge()).toBe(false);
      expect(repo.adoptRoots()).toBe(1);
      expect(repo.get('new')?.path).toBe(path.join(lib, 'b.cbz'));
      expect(db.prepare("SELECT path FROM library WHERE id = 'new'").get()).toEqual({ path: 'root:own/b.cbz' });
    });

    it('keeps the older entry when it is the one stored under the wrong folder', () => {
      const { db, repo } = twins();
      db.exec(`
        UPDATE library SET path = 'swap' WHERE id = 'old';
        UPDATE library SET path = 'root:own/a.cbz' WHERE id = 'new';
        UPDATE library SET path = 'root:stale/a.cbz' WHERE id = 'old';
      `);
      repo.adoptRoots();
      expect(db.prepare('SELECT id, path FROM library').all()).toEqual([{ id: 'old', path: 'root:own/a.cbz' }]);
    });

    it("completes the older entry's metadata without replacing it", () => {
      const { db, repo } = twins();
      db.exec(`
        UPDATE library SET language = 'fr', series = NULL WHERE id = 'old';
        UPDATE library SET language = 'en', series = 'S', title = 'Typed', title_locked = 1 WHERE id = 'new';
      `);
      repo.adoptRoots();
      expect(repo.get('old')).toMatchObject({ language: 'fr', series: 'S', title: 'Typed', titleLocked: true });
    });

    it('takes the credits of the newer entry only when the older one has none', () => {
      const { repo } = twins();
      repo.updateMetadata('new', { credits: [{ firstName: 'Ann', lastName: 'Lee', role: 'writer' }] });
      repo.adoptRoots();
      expect(repo.get('old')?.credits).toMatchObject([{ lastName: 'Lee' }]);

      const other = twins();
      other.repo.updateMetadata('old', { credits: [{ firstName: 'Bob', lastName: 'Ray', role: 'artist' }] });
      other.repo.updateMetadata('new', { credits: [{ firstName: 'Ann', lastName: 'Lee', role: 'writer' }] });
      other.repo.adoptRoots();
      expect(other.repo.get('old')?.credits).toMatchObject([{ lastName: 'Ray' }]);
      expect(other.db.prepare('SELECT COUNT(*) AS count FROM credits').get()).toEqual({ count: 1 });
    });

    it("combines each user's progress, rating, tags and dates", () => {
      const { db, repo } = twins();
      const insert = db.prepare(
        `INSERT INTO user_books (user_id, library_id, current_page, rating, tags, finished_at, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      insert.run('default', 'old', 3, 0, '["Lu"]', '2026-03-01', '2026-03-01');
      insert.run('default', 'new', 7, 4, '["Lu","x"]', '2026-02-15', '2026-04-01');
      insert.run('other', 'new', 2, 5, '[]', null, '2026-02-02');
      repo.adoptRoots();
      expect(db.prepare('SELECT * FROM user_books ORDER BY user_id').all()).toEqual([
        {
          user_id: 'default',
          library_id: 'old',
          current_page: 7,
          rating: 4,
          tags: '["Lu","x"]',
          finished_at: '2026-02-15',
          last_opened_at: '2026-04-01',
        },
        {
          user_id: 'other',
          library_id: 'old',
          current_page: 2,
          rating: 5,
          tags: '[]',
          finished_at: null,
          last_opened_at: '2026-02-02',
        },
      ]);
    });

    it('moves the reading sessions and the places in the lists', () => {
      const { db, repo } = twins();
      db.exec(`
        INSERT INTO reading_lists (id, name, created_at) VALUES ('both', 'B', 'x'), ('one', 'O', 'x');
        INSERT INTO reading_list_items (list_id, library_id, position)
          VALUES ('both', 'old', 0), ('both', 'new', 1), ('one', 'new', 0);
        INSERT INTO reading_sessions (library_id, day, seconds) VALUES ('new', '2026-02-02', 60);
      `);
      repo.adoptRoots();
      expect(db.prepare('SELECT list_id, library_id FROM reading_list_items ORDER BY list_id').all()).toEqual([
        { list_id: 'both', library_id: 'old' },
        { list_id: 'one', library_id: 'old' },
      ]);
      expect(db.prepare('SELECT library_id FROM reading_sessions').all()).toEqual([{ library_id: 'old' }]);
    });
  });

  it('moves a book under a folder added inside its folder instead of adding it again', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const roots = new PathRoots();
    roots.set('parent', lib);
    const repo = new LibraryRepository(db, () => 'default', roots);
    const file = path.join(lib, 'sub', 'a.cbz');
    repo.register(file, 'A', 10, 10, 100);
    roots.set('child', path.join(lib, 'sub'));
    expect(repo.adoptRoots()).toBe(1);
    expect(db.prepare('SELECT path FROM library').get()).toEqual({ path: 'root:child/a.cbz' });
    expect(repo.hasPath(file)).toBe(true);
  });

  it('leaves alone a book whose folder has no path here', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const repo = new LibraryRepository(db, () => 'default', new PathRoots());
    db.exec(`
      INSERT INTO library (id, path, title, page_count, current_page, added_at, last_opened_at)
      VALUES ('a', 'root:elsewhere/a.cbz', 'A', 10, 0, 'x', 'x');
    `);
    expect(repo.adoptRoots()).toBe(0);
  });
});
