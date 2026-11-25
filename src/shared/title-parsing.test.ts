import { describe, expect, it } from 'vitest';

import { formatPersonName, splitPersonName, splitSeriesTitle } from './title-parsing';

describe('splitSeriesTitle', () => {
  it('splits series, volume and title around an explicit marker', () => {
    expect(splitSeriesTitle('Astérix - Tome 3 - Astérix et les Goths')).toEqual({
      series: 'Astérix',
      volume: '3',
      title: 'Astérix et les Goths',
    });
    expect(splitSeriesTitle('Blacksad T02 : Arctic Nation')).toEqual({
      series: 'Blacksad',
      volume: '2',
      title: 'Arctic Nation',
    });
  });

  it('keeps the full text as title when nothing follows the volume', () => {
    expect(splitSeriesTitle('Naruto, Vol. 1')).toEqual({ series: 'Naruto', volume: '1', title: 'Naruto, Vol. 1' });
  });

  it('leaves the series unknown without a marker', () => {
    expect(splitSeriesTitle('Maus')).toEqual({ series: null, volume: null, title: 'Maus' });
  });
});

describe('splitPersonName', () => {
  it('takes the last word as the last name', () => {
    expect(splitPersonName('Stan Lee')).toEqual({ firstName: 'Stan', lastName: 'Lee' });
    expect(splitPersonName('Jean-Claude  Mézières')).toEqual({ firstName: 'Jean-Claude', lastName: 'Mézières' });
  });

  it('keeps particles with the last name', () => {
    expect(splitPersonName('Jean Van Hamme')).toEqual({ firstName: 'Jean', lastName: 'Van Hamme' });
    expect(splitPersonName('Juan Díaz de la Canales')).toEqual({ firstName: 'Juan Díaz', lastName: 'de la Canales' });
  });

  it('treats a single word as a last name', () => {
    expect(splitPersonName('Hergé')).toEqual({ firstName: '', lastName: 'Hergé' });
  });

  it('honours the "Last, First" form', () => {
    expect(splitPersonName('Goscinny, René')).toEqual({ firstName: 'René', lastName: 'Goscinny' });
  });
});

describe('formatPersonName', () => {
  it('joins first and last name, skipping an empty first name', () => {
    expect(formatPersonName({ firstName: 'René', lastName: 'Goscinny' })).toBe('René Goscinny');
    expect(formatPersonName({ firstName: '', lastName: 'Hergé' })).toBe('Hergé');
  });
});

describe('splitSeriesTitle: long runs of separators', () => {
  it('trims them in linear time', () => {
    const run = ', '.repeat(500_000);
    const started = performance.now();
    const split = splitSeriesTitle(`a${run}b T1 c${run}d`);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(split.volume).toBe('1');
    expect(split.series).toBe(`a${run}b`.replace(/\s+/g, ' '));
  });
});
