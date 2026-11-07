import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { LibraryFolderRepository } from './library-folder-repository';
import { PathRoots } from './path-roots';
import { migrate } from './schema';

function repository(): LibraryFolderRepository {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return new LibraryFolderRepository(db);
}

describe('LibraryFolderRepository', () => {
  it('starts empty', () => {
    expect(repository().list()).toEqual([]);
  });

  it('remembers a folder once, however many times it is added', () => {
    const repo = repository();
    repo.add('/comics');
    repo.add('/comics');
    expect(repo.list()).toEqual(['/comics']);
  });

  it('stores books under its own folder, not under one this machine remembers from another database', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const folder = path.resolve('/comics');
    const roots = new PathRoots();
    roots.set('from-another-database', folder);
    db.prepare("INSERT INTO library_folders (id, path, added_at) VALUES ('own', ?, 'x')").run(folder);
    roots.set('own', folder);
    new LibraryFolderRepository(db, roots).syncRoots();
    expect(roots.encode(path.join(folder, 'a.cbz'))).toBe('root:own/a.cbz');
  });

  it('forgets a folder', () => {
    const repo = repository();
    repo.add('/a');
    repo.add('/b');
    repo.remove('/a');
    expect(repo.list()).toEqual(['/b']);
  });
});

describe('LibraryFolderRepository users', () => {
  it('lists, adds and forgets the folders of the active user only', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    let user = 'anna';
    const repo = new LibraryFolderRepository(db, new PathRoots(), () => user);
    repo.add('/shared');
    repo.add('/anna-only');
    user = 'ben';
    expect(repo.list()).toEqual([]);
    repo.add('/shared');
    expect(repo.list()).toEqual(['/shared']);
    repo.remove('/shared');
    expect(repo.list()).toEqual([]);

    user = 'anna';
    expect(repo.list().sort()).toEqual(['/anna-only', '/shared']);
  });
});

describe('LibraryFolderRepository roots', () => {
  function shared(): { db: DatabaseSync; a: PathRoots; b: PathRoots } {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    return { db, a: new PathRoots(), b: new PathRoots() };
  }

  it('keeps a forgotten folder, unwatched, and watches it again when re-added', () => {
    const { db, a } = shared();
    const repo = new LibraryFolderRepository(db, a);
    repo.add('/comics');
    expect(repo.unlinked()).toEqual([]);
    repo.remove('/comics');
    expect(repo.list()).toEqual([]);
    repo.add('/comics');
    expect(repo.list()).toEqual(['/comics']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM library_folders').get()).toEqual({ n: 1 });
  });

  it('lists as unlinked a folder another machine added, until it is relinked', () => {
    const { db, a, b } = shared();
    new LibraryFolderRepository(db, a).add('/home/anna/comics');
    const other = new LibraryFolderRepository(db, b);
    expect(other.list()).toEqual([]);
    const [folder] = other.unlinked();
    expect(folder.path).toBe('/home/anna/comics');
    expect(other.relink(folder.id, '/mnt/share/comics')).toBe(true);
    expect(other.unlinked()).toEqual([]);
    expect(other.list()).toEqual(['/mnt/share/comics']);
    expect(other.relink('unknown', '/x')).toBe(false);
  });
});
