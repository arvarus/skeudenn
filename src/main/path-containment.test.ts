import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isInside, leavesFolder } from './path-containment';

describe('isInside', () => {
  it('is true for descendants only', () => {
    expect(isInside('/comics', '/comics/a/b.cbz')).toBe(true);
    expect(isInside('/comics', '/comics')).toBe(false);
    expect(isInside('/comics', '/comics-other/a.cbz')).toBe(false);
    expect(isInside('/comics/a', '/comics/b.cbz')).toBe(false);
    expect(isInside('/comics', '/other/a.cbz')).toBe(false);
    expect(isInside('/comics/a', '/comics/../b.cbz')).toBe(false);
  });

  it('keeps files and folders whose name starts with two dots inside', () => {
    expect(isInside('/comics', '/comics/...Et alors.cbz')).toBe(true);
    expect(isInside('/comics', '/comics/..hidden/a.cbz')).toBe(true);
    expect(isInside('/comics', '/comics/a/..b.cbz')).toBe(true);
  });
});

describe('leavesFolder', () => {
  it('is true for a `..` segment and an absolute path only', () => {
    expect(leavesFolder('..')).toBe(true);
    expect(leavesFolder(path.join('..', 'x'))).toBe(true);
    expect(leavesFolder(path.resolve('/x'))).toBe(true);
    expect(leavesFolder(path.join('...x', 'y'))).toBe(false);
    expect(leavesFolder(path.join('a', 'b'))).toBe(false);
  });
});
