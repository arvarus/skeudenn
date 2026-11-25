import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

import { LibraryFolderRepository } from './library-folder-repository';
import { PathRoots } from './path-roots';
import { migrate } from './schema';

/** A POSIX-style absolute path as an absolute path of this platform (`C:\comics` on Windows). */
const abs = (posixPath: string): string => path.resolve(posixPath);

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
    repo.add(abs('/comics'));
    repo.add(abs('/comics'));
    expect(repo.list()).toEqual([abs('/comics')]);
  });

  it('stores books under its own folder, not under one this machine remembers from another database', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    const folder = abs('/comics');
    const roots = new PathRoots();
    roots.set('from-another-database', folder);
    db.prepare("INSERT INTO library_folders (id, path, added_at) VALUES ('own', ?, 'x')").run(folder);
    roots.set('own', folder);
    new LibraryFolderRepository(db, roots).syncRoots();
    expect(roots.encode(path.join(folder, 'a.cbz'))).toBe('root:own/a.cbz');
  });

  it('forgets a folder', () => {
    const repo = repository();
    repo.add(abs('/a'));
    repo.add(abs('/b'));
    repo.remove(abs('/a'));
    expect(repo.list()).toEqual([abs('/b')]);
  });
});

describe('LibraryFolderRepository users', () => {
  it('lists, adds and forgets the folders of the active user only', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    let user = 'anna';
    const repo = new LibraryFolderRepository(db, new PathRoots(), () => user);
    repo.add(abs('/shared'));
    repo.add(abs('/anna-only'));
    user = 'ben';
    expect(repo.list()).toEqual([]);
    repo.add(abs('/shared'));
    expect(repo.list()).toEqual([abs('/shared')]);
    repo.remove(abs('/shared'));
    expect(repo.list()).toEqual([]);

    user = 'anna';
    expect(repo.list().sort()).toEqual([abs('/anna-only'), abs('/shared')]);
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
    repo.add(abs('/comics'));
    expect(repo.unlinked()).toEqual([]);
    repo.remove(abs('/comics'));
    expect(repo.list()).toEqual([]);
    repo.add(abs('/comics'));
    expect(repo.list()).toEqual([abs('/comics')]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM library_folders').get()).toEqual({ n: 1 });
  });

  it('lists as unlinked a folder another machine added, until it is relinked', () => {
    const { db, a, b } = shared();
    new LibraryFolderRepository(db, a).add(abs('/home/anna/comics'));
    const other = new LibraryFolderRepository(db, b);
    expect(other.list()).toEqual([]);
    const [folder] = other.unlinked();
    expect(folder.path).toBe(abs('/home/anna/comics'));
    expect(other.relink(folder.id, abs('/mnt/share/comics'))).toBe(true);
    expect(other.unlinked()).toEqual([]);
    expect(other.list()).toEqual([abs('/mnt/share/comics')]);
    expect(other.relink('unknown', abs('/x'))).toBe(false);
  });
});
