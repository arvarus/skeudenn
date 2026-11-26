import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeFolders, startingFolder } from './folder-selection';

const at = (...segments: string[]) => path.resolve(path.sep, ...segments);

describe('normalizeFolders', () => {
  it('keeps independent folders in the order picked', () => {
    expect(normalizeFolders([at('b'), at('a')])).toEqual([at('b'), at('a')]);
  });

  it('drops a repeated folder', () => {
    expect(normalizeFolders([at('a'), at('a'), at('a') + path.sep])).toEqual([at('a')]);
  });

  it('drops a folder nested in another picked one, whatever the order', () => {
    expect(normalizeFolders([at('a', 'b'), at('a'), at('c')])).toEqual([at('a'), at('c')]);
    expect(normalizeFolders([at('a'), at('a', 'b', 'c')])).toEqual([at('a')]);
  });

  it('keeps a sibling whose name only starts like another folder', () => {
    expect(normalizeFolders([at('comics'), at('comics-2'), at('comics', '...more')])).toEqual([at('comics'), at('comics-2')]);
  });

  it('gives nothing for nothing', () => {
    expect(normalizeFolders([])).toEqual([]);
  });
});

describe('startingFolder', () => {
  it('is the folder itself when there is one', () => {
    expect(startingFolder([at('a', 'b')])).toBe(at('a', 'b'));
  });

  it('is the folder the picked ones share', () => {
    expect(startingFolder([at('a', 'b', 'x'), at('a', 'b', 'y')])).toBe(at('a', 'b'));
    expect(startingFolder([at('a', 'b', 'x'), at('a', 'c', 'y')])).toBe(at('a'));
  });

  it('is empty without a folder', () => {
    expect(startingFolder([])).toBe('');
  });
});
