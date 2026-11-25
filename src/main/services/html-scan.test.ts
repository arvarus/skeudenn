import { describe, expect, it } from 'vitest';

import { firstBetween, firstSequence, scanSequences, stripTags } from './html-scan';

/** About 1 MB of `piece`, repeated. */
function flood(piece: string): string {
  return piece.repeat(Math.ceil(1_000_000 / piece.length));
}

/** Runs `parse` and checks that it took well under a second (a quadratic pattern takes minutes on 1 MB). */
function expectFast(parse: () => unknown): void {
  const started = performance.now();
  parse();
  expect(performance.now() - started).toBeLessThan(1000);
}

describe('scanSequences', () => {
  const SAMPLES = [
    '<dt>Scénario :</dt> <dd class="x"><a>A</a></dd><dt>Dessin</dt>\n<dd><a>B</a></dd>',
    '<dt>A</dt><p>not a dd</p><dt>B</dt><dd>b</dd><dt>C</dt>',
    '<dt>A</dt><dd>no close<dt>B</dt><dd>b</dd>',
    '<DT>a</DT><DD>b</DD>',
    '',
  ];

  it('finds what the single lazy regular expression finds', () => {
    for (const html of SAMPLES) {
      const expected = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)].map((m) => [m[1], m[2]]);
      const found = [...scanSequences(html, [/<dt>/i, /<\/dt>\s*<dd\b[^<>]*>/i, /<\/dd>/i])].map((s) => s.gaps);
      expect(found).toEqual(expected);
    }
  });

  it('gives each step its match, and skips the openings `accept` refuses', () => {
    const html = '<li class="grp">G</li><li class="a">A</li><li>B</li>';
    const found = [...scanSequences(html, [/<li\b([^<>]*)>/i, /<\/li>/i], (opening) => opening[1] !== ' class="grp"')];
    expect(found.map(({ matches, gaps }) => [matches[0][1], gaps[0]])).toEqual([
      [' class="a"', 'A'],
      ['', 'B'],
    ]);
  });

  it('gives the first run, or null', () => {
    expect(firstSequence('<b>1</b><b>2</b>', [/<b>/i, /<\/b>/i])?.gaps).toEqual(['1']);
    expect(firstSequence('<b>1', [/<b>/i, /<\/b>/i])).toBeNull();
    expect(firstBetween('x<h1>Title</h1>', /<h1>/i, /<\/h1>/i)).toBe('Title');
    expect(firstBetween('<h1>Title', /<h1>/i, /<\/h1>/i)).toBeUndefined();
  });

  it('stays linear on openings that nothing closes', () => {
    const html = flood('<dt>');
    expectFast(() => [...scanSequences(html, [/<dt>/i, /<\/dt>/i])]);
    expect(html.length).toBeGreaterThanOrEqual(1_000_000);
  });

  it('stays linear on accepted and refused openings that nothing closes', () => {
    const html = flood('<article class="bdt-edition--detail"><article class="other">');
    expectFast(() => [...scanSequences(html, [/<article\b([^<>]*)>/i, /<\/article>/i], (opening) => opening[1].includes('detail'))]);
  });
});

describe('stripTags', () => {
  it('drops the tags as `/<[^>]*>/g` does', () => {
    for (const html of ['<a href="x">A</a> <b>B', 'a < b > c', '<<x>y', 'text <unclosed', '>only', '', '<a title="<N&B>">x</a>']) {
      expect(stripTags(html)).toBe(html.replace(/<[^>]*>/g, ''));
    }
  });

  it('stays linear on a text full of unclosed `<`', () => {
    expectFast(() => stripTags(flood('<')));
    expectFast(() => stripTags(`${flood('<a ')}>`));
  });
});
