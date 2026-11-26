import { describe, expect, it } from 'vitest';

import {
  IpcArgumentError,
  args,
  booleanArg,
  idArg,
  tokenArg,
  pageIndexArg,
  MAX_ID_LENGTH,
  MAX_LIBRARY_IDS,
  expectIdArray,
  expectInteger,
  expectMetadataQuery,
  expectMetadataUpdate,
  expectNonEmptyString,
  expectStringArray,
} from './validate';

describe('expectStringArray', () => {
  it('returns an array of strings', () => {
    expect(expectStringArray(['a', 'b'], 'tags')).toEqual(['a', 'b']);
  });

  it.each([null, undefined, 'a', [1], [null], {}])('refuses %j', (value) => {
    expect(() => expectStringArray(value, 'tags')).toThrow(IpcArgumentError);
  });
});

describe('expectIdArray', () => {
  it('accepts a selection of a whole large library', () => {
    const ids = Array.from({ length: 20_000 }, (_, i) => `id-${i}`);
    expect(expectIdArray(ids, 'ids')).toHaveLength(20_000);
  });

  it('is not bound by the 1 000 items of the other lists', () => {
    expect(() => expectStringArray(Array.from({ length: 1_001 }, () => 'a'), 'tags')).toThrow(IpcArgumentError);
    expect(expectIdArray(Array.from({ length: 1_001 }, () => 'a'), 'ids')).toHaveLength(1_001);
  });

  it.each([null, undefined, 'a', [1], [null], {}])('refuses %j', (value) => {
    expect(() => expectIdArray(value, 'ids')).toThrow(IpcArgumentError);
  });

  it('refuses too many ids and ids that are too long', () => {
    expect(() => expectIdArray(new Array(MAX_LIBRARY_IDS + 1).fill('a'), 'ids')).toThrow(IpcArgumentError);
    expect(() => expectIdArray(['a'.repeat(MAX_ID_LENGTH + 1)], 'ids')).toThrow(IpcArgumentError);
  });
});

describe('expectInteger', () => {
  it('enforces type and range', () => {
    expect(expectInteger(3, 'rating', 0, 5)).toBe(3);
    for (const value of [6, -1, 1.5, '3', null, Number.NaN, Infinity]) {
      expect(() => expectInteger(value, 'rating', 0, 5)).toThrow(IpcArgumentError);
    }
  });
});

describe('expectNonEmptyString', () => {
  it('refuses empty and non-string values', () => {
    expect(expectNonEmptyString('x', 'id')).toBe('x');
    expect(() => expectNonEmptyString('', 'id')).toThrow(IpcArgumentError);
    expect(() => expectNonEmptyString(undefined, 'id')).toThrow(IpcArgumentError);
    expect(() => expectNonEmptyString('x'.repeat(5000), 'id', 4096)).toThrow(IpcArgumentError);
  });
});

describe('expectMetadataUpdate', () => {
  it('keeps the known fields only', () => {
    expect(
      expectMetadataUpdate({
        title: 'T',
        series: null,
        credits: [{ firstName: 'A', lastName: 'B', role: 'writer', extra: 1 }],
        isAdmin: true,
      }),
    ).toEqual({ title: 'T', series: null, credits: [{ firstName: 'A', lastName: 'B', role: 'writer' }] });
  });

  it('refuses wrong types and unknown roles', () => {
    expect(() => expectMetadataUpdate(null)).toThrow(IpcArgumentError);
    expect(() => expectMetadataUpdate({ title: 3 })).toThrow(IpcArgumentError);
    expect(() => expectMetadataUpdate({ volume: 3 })).toThrow(IpcArgumentError);
    expect(() => expectMetadataUpdate({ credits: 'x' })).toThrow(IpcArgumentError);
    expect(() => expectMetadataUpdate({ credits: [{ firstName: '', lastName: 'B', role: 'boss' }] })).toThrow(
      IpcArgumentError,
    );
  });
});

describe('expectMetadataQuery', () => {
  it('requires a text and a nullable volume', () => {
    expect(expectMetadataQuery({ text: 'x', volume: null })).toEqual({ text: 'x', volume: null });
    expect(() => expectMetadataQuery({ text: 'x' })).toThrow(IpcArgumentError);
    expect(() => expectMetadataQuery({ text: 1, volume: null })).toThrow(IpcArgumentError);
  });

  it('accepts the API sources by name, Bédéthèque included, and refuses any other', () => {
    expect(expectMetadataQuery({ text: 'x', volume: null, sources: ['comicvine', 'bedetheque'] }).sources).toEqual([
      'comicvine',
      'bedetheque',
    ]);
    expect(() => expectMetadataQuery({ text: 'x', volume: null, sources: ['bdfugue'] })).toThrow(IpcArgumentError);
    expect(() => expectMetadataQuery({ text: 'x', volume: null, sources: 'bedetheque' })).toThrow(IpcArgumentError);
  });
});

describe('args', () => {
  it('parses each argument and returns them in order', () => {
    expect(args(idArg, pageIndexArg)(['a', 2])).toEqual(['a', 2]);
  });

  it('refuses a wrong number of arguments or a bad one', () => {
    expect(() => args(idArg)([])).toThrow(IpcArgumentError);
    expect(() => args(idArg)(['a', 'b'])).toThrow(IpcArgumentError);
    expect(() => args()(['x'])).toThrow(IpcArgumentError);
    expect(() => args(idArg, pageIndexArg)(['a', -1])).toThrow(IpcArgumentError);
    expect(() => args(idArg)([{ path: '/etc/passwd' }])).toThrow(IpcArgumentError);
  });
});

describe('tokenArg', () => {
  it('accepts a token and a flag, as `library:add-folders` takes them', () => {
    expect(args(tokenArg, booleanArg)(['0b5f9f9e-3a52-4c2e-9d9e-6e2d0a1a7c11', false])).toEqual([
      '0b5f9f9e-3a52-4c2e-9d9e-6e2d0a1a7c11',
      false,
    ]);
  });

  it('refuses a path in its place, a missing flag, a non-boolean flag, an empty or oversized token', () => {
    expect(() => args(tokenArg, booleanArg)([['/etc'], true])).toThrow(IpcArgumentError);
    expect(() => args(tokenArg, booleanArg)(['token'])).toThrow(IpcArgumentError);
    expect(() => args(tokenArg, booleanArg)(['token', 'yes'])).toThrow(IpcArgumentError);
    expect(() => tokenArg('')).toThrow(IpcArgumentError);
    expect(() => tokenArg('x'.repeat(MAX_ID_LENGTH + 1))).toThrow(IpcArgumentError);
  });
});
