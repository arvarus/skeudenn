import { describe, expect, it } from 'vitest';

import { formatMissingVolumes, MAX_TRACKED_VOLUME, missingVolumes, volumeNumber } from './missing-volumes';

describe('volumeNumber', () => {
  it('reads whole numbers, with leading zeros and spaces', () => {
    expect(volumeNumber('07')).toBe(7);
    expect(volumeNumber(' 12 ')).toBe(12);
  });

  it('ignores anything that is not a whole number between 1 and the ceiling', () => {
    for (const volume of [null, '', 'HS', '12.1', '1/2', '-3', '0', '1e3', String(MAX_TRACKED_VOLUME + 1), '999999999']) {
      expect(volumeNumber(volume)).toBeNull();
    }
    expect(volumeNumber(String(MAX_TRACKED_VOLUME))).toBe(MAX_TRACKED_VOLUME);
  });
});

describe('missingVolumes', () => {
  it('lists the gaps below the highest volume held', () => {
    expect(missingVolumes(['1', '2', '3', '5'])).toEqual([4]);
  });

  it('counts from 1, not from the lowest volume held', () => {
    expect(missingVolumes(['3', '4'])).toEqual([1, 2]);
  });

  it('counts a volume held several times once, and reads leading zeros', () => {
    expect(missingVolumes(['01', '2', '2', '4'])).toEqual([3]);
  });

  it('ignores the volumes that are not whole numbers', () => {
    expect(missingVolumes(['1', 'HS', '12.1', '3'])).toEqual([2]);
    expect(missingVolumes(['1', null, '3'])).toEqual([2]);
  });

  it('finds no gap with fewer than two numbered volumes', () => {
    expect(missingVolumes(['5'])).toEqual([]);
    expect(missingVolumes([])).toEqual([]);
    expect(missingVolumes(['5', 'HS', null])).toEqual([]);
  });

  it('finds no gap in a complete series', () => {
    expect(missingVolumes(['1', '2', '3'])).toEqual([]);
  });

  it('ignores a pathological volume instead of listing millions of gaps', () => {
    expect(missingVolumes(['1', '3', '999999999'])).toEqual([2]);
    const start = Date.now();
    expect(missingVolumes(['1', String(MAX_TRACKED_VOLUME)]).length).toBe(MAX_TRACKED_VOLUME - 2);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('formatMissingVolumes', () => {
  it('lists single numbers', () => {
    expect(formatMissingVolumes([4, 6])).toEqual({ shown: '4, 6', hidden: 0, full: '4, 6' });
  });

  it('shortens consecutive numbers to a range', () => {
    expect(formatMissingVolumes([2, 3, 4, 5, 9])).toEqual({ shown: '2–5, 9', hidden: 0, full: '2–5, 9' });
  });

  it('keeps a pair as a range', () => {
    expect(formatMissingVolumes([1, 2]).shown).toBe('1–2');
  });

  it('cuts the list after the maximum number of ranges and counts the volumes left out', () => {
    const text = formatMissingVolumes([2, 3, 4, 5, 9, 12, 14, 16, 17, 18, 21]);
    expect(text.shown).toBe('2–5, 9, 12, 14, 16–18');
    expect(text.hidden).toBe(1);
    expect(text.full).toBe('2–5, 9, 12, 14, 16–18, 21');
  });

  it('counts every volume of the ranges left out', () => {
    expect(formatMissingVolumes([1, 3, 5, 7, 9, 11, 12, 13, 14]).hidden).toBe(4);
    expect(formatMissingVolumes([1, 3], 1)).toEqual({ shown: '1', hidden: 1, full: '1, 3' });
  });

  it('gives nothing for no gap', () => {
    expect(formatMissingVolumes([])).toEqual({ shown: '', hidden: 0, full: '' });
  });
});
