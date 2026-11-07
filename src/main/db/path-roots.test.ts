import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PathRoots, fileRootsStore, memoryRootsStore } from './path-roots';

const lib = path.resolve('/data/lib');

describe('PathRoots', () => {
  it('stores a file under a folder relative to it, with forward slashes', () => {
    const roots = new PathRoots();
    roots.set('r1', lib);
    expect(roots.encode(path.join(lib, 'Series', 'one.cbz'))).toBe('root:r1/Series/one.cbz');
  });

  it('keeps the absolute path of a file outside every folder', () => {
    const roots = new PathRoots();
    roots.set('r1', lib);
    const outside = path.resolve('/elsewhere/one.cbz');
    expect(roots.encode(outside)).toBe(outside);
    expect(roots.encode(path.resolve('/data/library/one.cbz'))).toBe(path.resolve('/data/library/one.cbz'));
  });

  it('stores a file whose name or first folder starts with two dots, and brings it back', () => {
    const roots = new PathRoots();
    roots.set('r1', lib);
    const file = path.join(lib, '...Et alors.cbz');
    const nested = path.join(lib, '..hidden', 'one.cbz');
    expect(roots.encode(file)).toBe('root:r1/...Et alors.cbz');
    expect(roots.encode(nested)).toBe('root:r1/..hidden/one.cbz');
    expect(roots.decode(roots.encode(nested))).toBe(nested);
  });

  it('stores paths only under the folders it was limited to, and still reads the others', () => {
    const roots = new PathRoots();
    roots.set('stale', lib);
    roots.set('own', lib);
    roots.limitTo(['own']);
    const file = path.join(lib, 'one.cbz');
    expect(roots.encode(file)).toBe('root:own/one.cbz');
    expect(roots.decode('root:stale/one.cbz')).toBe(file);
  });

  it('keeps a file outside the limited folders absolute', () => {
    const roots = new PathRoots();
    roots.set('stale', lib);
    roots.limitTo([]);
    const file = path.join(lib, 'one.cbz');
    expect(roots.encode(file)).toBe(file);
  });

  it('picks the first folder listed when two are at the same place, and counts a folder set later', () => {
    const roots = new PathRoots();
    roots.set('second', lib);
    roots.set('first', lib);
    roots.limitTo(['first', 'second']);
    expect(roots.encode(path.join(lib, 'one.cbz'))).toBe('root:first/one.cbz');
    const added = path.resolve('/data/added');
    roots.set('new', added);
    expect(roots.encode(path.join(added, 'one.cbz'))).toBe('root:new/one.cbz');
  });

  it('does not decode a stored path out of its folder', () => {
    const roots = new PathRoots();
    roots.set('r1', lib);
    expect(roots.decode('root:r1/../../etc/x.cbz')).toBe('root:r1/../../etc/x.cbz');
    expect(roots.decode('root:r1/a/../b.cbz')).toBe(path.join(lib, 'b.cbz'));
  });

  it('prefers the deepest folder', () => {
    const roots = new PathRoots();
    roots.set('outer', lib);
    roots.set('inner', path.join(lib, 'manga'));
    expect(roots.encode(path.join(lib, 'manga', 'a.cbz'))).toBe('root:inner/a.cbz');
    expect(roots.encode(path.join(lib, 'b.cbz'))).toBe('root:outer/b.cbz');
  });

  it('decodes on another machine where the folder is somewhere else', () => {
    const here = new PathRoots();
    here.set('r1', lib);
    const stored = here.encode(path.join(lib, 'S', 'a.cbz'));
    const there = new PathRoots();
    there.set('r1', path.resolve('/mnt/share'));
    expect(there.decode(stored)).toBe(path.join(path.resolve('/mnt/share'), 'S', 'a.cbz'));
  });

  it('leaves a folder without a path here, and absolute paths, as they are', () => {
    const roots = new PathRoots();
    expect(roots.decode('root:gone/a.cbz')).toBe('root:gone/a.cbz');
    expect(roots.encode('root:gone/a.cbz')).toBe('root:gone/a.cbz');
    expect(roots.decode('/abs/a.cbz')).toBe('/abs/a.cbz');
  });

  it('reloads what the store holds', () => {
    const store = memoryRootsStore();
    new PathRoots(store).set('r1', lib);
    expect(new PathRoots(store).get('r1')).toBe(lib);
  });
});

describe('fileRootsStore', () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });
  const tempDirectory = () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'tankobon-roots-'));
    directories.push(directory);
    return directory;
  };

  it('keeps what it saved, and leaves no temporary file behind', () => {
    const directory = tempDirectory();
    const file = path.join(directory, 'library-roots.json');
    const store = fileRootsStore(file);
    store.save({ r1: '/data/lib' });
    store.save({ r1: '/data/lib', r2: '/other' });
    expect(fileRootsStore(file).load()).toEqual({ r1: '/data/lib', r2: '/other' });
    expect(readdirSync(directory)).toEqual(['library-roots.json']);
  });

  it('reads a missing or damaged file as empty', () => {
    const directory = tempDirectory();
    const file = path.join(directory, 'library-roots.json');
    expect(fileRootsStore(file).load()).toEqual({});
    writeFileSync(file, '{"r1": "/da');
    expect(fileRootsStore(file).load()).toEqual({});
  });

  it('throws when it cannot write, leaving nothing behind', () => {
    const directory = tempDirectory();
    const store = fileRootsStore(path.join(directory, 'missing', 'library-roots.json'));
    expect(() => store.save({ r1: '/data/lib' })).toThrow();
    expect(readdirSync(directory)).toEqual([]);
  });
});
