import { describe, expect, it } from 'vitest';

import { pickRandomUnread, resolveDrawn } from '@/lib/home-picks';
import type { LibraryEntry } from '@/shared/library';

function entry(id: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry {
  return { id, series: null, volume: null, tags: [], pageCount: 10, currentPage: 0, ...overrides } as LibraryEntry;
}

describe('pickRandomUnread', () => {
  it('skips finished books, by last page or by the Lu tag', () => {
    const library = [entry('a'), entry('b', { currentPage: 9 }), entry('c', { tags: ['Lu'] }), entry('d')];
    const ids = pickRandomUnread(library, 5).map((e) => e.id).sort();
    expect(ids).toEqual(['a', 'd']);
  });

  it('returns at most the requested count, without duplicates', () => {
    const library = Array.from({ length: 20 }, (_, i) => entry(String(i)));
    const picks = pickRandomUnread(library, 5);
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map((e) => e.id)).size).toBe(5);
  });

  it('is deterministic for a given random source and leaves the library untouched', () => {
    const library = ['a', 'b', 'c', 'd'].map((id) => entry(id));
    expect(pickRandomUnread(library, 2, () => 0).map((e) => e.id)).toEqual(['a', 'b']);
    expect(pickRandomUnread(library, 2, () => 0.99).map((e) => e.id)).toEqual(['d', 'a']);
    expect(library.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns nothing for an empty or fully read library', () => {
    expect(pickRandomUnread([], 5)).toEqual([]);
    expect(pickRandomUnread([entry('a', { tags: ['Lu'] })], 5)).toEqual([]);
  });

  it('proposes only the next unread volume of a series', () => {
    const book = (id: string, volume: string, overrides: Partial<LibraryEntry> = {}) =>
      entry(id, { series: 'Saga', volume, title: id, ...overrides });
    const library = [book('v3', '3'), book('v1', '1'), book('v2', '2'), entry('solo')];
    expect(pickRandomUnread(library, 5).map((e) => e.id).sort()).toEqual(['solo', 'v1']);
    const read = [book('v3', '3'), book('v1', '1', { tags: ['Lu'] }), book('v2', '2', { tags: ['Lu'] })];
    expect(pickRandomUnread(read, 5).map((e) => e.id)).toEqual(['v3']);
  });
});

describe('resolveDrawn', () => {
  it('takes the books from the current library, in the order of the draw', () => {
    const library = [entry('a', { currentPage: 1 }), entry('b'), entry('c')];
    expect(resolveDrawn(library, ['c', 'a'])).toEqual([library[2], library[0]]);
  });

  it('leaves out the books no longer in the library', () => {
    expect(resolveDrawn([entry('a')], ['gone', 'a']).map((e) => e.id)).toEqual(['a']);
    expect(resolveDrawn([], ['a'])).toEqual([]);
  });

  it('applies the block condition again', () => {
    const library = [entry('a', { rating: 1 }), entry('b', { rating: 4 })];
    expect(resolveDrawn(library, ['a', 'b'], (e) => e.rating <= 2).map((e) => e.id)).toEqual(['a']);
  });
});
