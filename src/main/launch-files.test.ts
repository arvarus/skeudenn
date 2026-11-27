import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { comicPathFromArgv } from './launch-files';

const cwd = path.resolve('/work');

describe('comicPathFromArgv', () => {
  it('returns the first supported comic, absolute', () => {
    const file = path.resolve('/books/Tintin T01.cbz');
    expect(comicPathFromArgv(['/opt/skeudenn', file], cwd)).toBe(file);
  });

  it('resolves a relative path against the working directory', () => {
    expect(comicPathFromArgv(['skeudenn', 'book.CBR'], cwd)).toBe(path.join(cwd, 'book.CBR'));
  });

  it('skips options and files that are not comics', () => {
    expect(comicPathFromArgv(['electron', '.', '--inspect=1', 'notes.txt', 'a.pdf'], cwd)).toBe(path.join(cwd, 'a.pdf'));
  });

  it('returns null when the command line names no comic', () => {
    expect(comicPathFromArgv(['skeudenn', '--flag', '.'], cwd)).toBeNull();
    expect(comicPathFromArgv([], cwd)).toBeNull();
  });
});
