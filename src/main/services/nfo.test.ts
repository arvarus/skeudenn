import { lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildNfo, MAX_NFO_BYTES, nfoPathFor, parseNfo, readNfoFor, writeNfo, writeNfoIfMissing } from './nfo';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs.length = 0;
});

describe('parseNfo', () => {
  it('reads the fields and the credits', () => {
    const update = parseNfo(`<?xml version="1.0"?>
      <book>
        <title>Arctic-Nation</title><series>Blacksad</series><volume>2</volume>
        <releasedate>2003-05-12</releasedate><language>FR</language>
        <author role="writer">Juan Díaz Canales</author>
        <author role="artist">Guarnido, Juanjo</author>
        <author>Anonyme</author>
      </book>`);
    expect(update).toEqual({
      title: 'Arctic-Nation',
      series: 'Blacksad',
      volume: '2',
      releaseDate: '2003-05-12',
      language: 'fr',
      credits: [
        { firstName: 'Juan Díaz', lastName: 'Canales', role: 'writer' },
        { firstName: 'Juanjo', lastName: 'Guarnido', role: 'artist' },
        { firstName: '', lastName: 'Anonyme', role: 'author' },
      ],
    });
  });

  it('falls back on <year>, role elements and an unknown role', () => {
    const update = parseNfo('<year>2003</year><writer>Hergé</writer><author role="boss">X Y</author>');
    expect(update?.releaseDate).toBe('2003');
    expect(update?.credits).toEqual([
      { firstName: 'X', lastName: 'Y', role: 'author' },
      { firstName: '', lastName: 'Hergé', role: 'writer' },
    ]);
  });

  it('drops invalid values and returns null when nothing is usable', () => {
    expect(parseNfo('<releasedate>2003-02-31</releasedate><language>français</language>')).toBeNull();
    expect(parseNfo('not xml at all')).toBeNull();
  });

  it('decodes the predefined entities and strips markup and control characters', () => {
    const update = parseNfo('<title><![CDATA[A <b>&amp;</b>\u0000B]]></title><series>Tom &amp; Jerry &#x41;&bogus;</series>');
    expect(update?.title).toBe('A & B');
    expect(update?.series).toBe('Tom & Jerry A&bogus;');
  });

  it('bounds the length of a value and the number of credits', () => {
    const authors = Array.from({ length: 80 }, (_, i) => `<author>P${i} Name</author>`).join('');
    const update = parseNfo(`<title>${'x'.repeat(1000)}</title>${authors}`);
    expect(update?.title).toHaveLength(300);
    expect(update?.credits).toHaveLength(50);
  });
});

describe('parseNfo on hostile input', () => {
  // These made the lazy regexes re-scan the whole file for every opening tag: 4 to 19 s at 256 KiB, in the main process.
  it.each(['<title>', '<author>', '<writer ', '<![CDATA[', '<', '<author role="a">x</author '])(
    'stays fast on a file full of %j',
    (unit) => {
      const xml = unit.repeat(Math.floor(MAX_NFO_BYTES / unit.length));
      const start = performance.now();
      parseNfo(xml);
      expect(performance.now() - start).toBeLessThan(500);
    },
  );

  it('still reads an element after an unclosed lookalike and with spaced closing tags', () => {
    const nfo = parseNfo('<titlefoo>x</titlefoo><title>Un</title ><author role="writer">Jean Van Hamme</author  >');
    expect(nfo?.title).toBe('Un');
    expect(nfo?.credits).toEqual([{ firstName: 'Jean', lastName: 'Van Hamme', role: 'writer' }]);
  });
});

describe('readNfoFor', () => {
  async function dir(): Promise<string> {
    const d = await mkdtemp(path.join(tmpdir(), 'skeudenn-nfo-'));
    dirs.push(d);
    return d;
  }

  it('reads the sidecar of the same name', async () => {
    const d = await dir();
    await writeFile(nfoPathFor(path.join(d, 'Tome 1.cbz')), '<title>Un</title>');
    expect(await readNfoFor(path.join(d, 'Tome 1.cbz'))).toEqual({ title: 'Un' });
  });

  it('ignores a missing or oversized file', async () => {
    const d = await dir();
    expect(await readNfoFor(path.join(d, 'a.cbz'))).toBeNull();
    await writeFile(path.join(d, 'b.nfo'), `<title>${'x'.repeat(MAX_NFO_BYTES)}</title>`);
    expect(await readNfoFor(path.join(d, 'b.cbz'))).toBeNull();
  });
});

describe('buildNfo', () => {
  const entry = {
    title: 'Tom & <Jerry>',
    series: 'Cartoons',
    volume: '3',
    releaseDate: '2003-05',
    language: 'fr',
    credits: [
      { personId: '1', firstName: 'Jean', lastName: 'Van Hamme', role: 'writer' as const },
      { personId: '2', firstName: '', lastName: 'Moebius', role: 'artist' as const },
    ],
  };

  it('is read back by parseNfo', () => {
    expect(parseNfo(buildNfo(entry))).toEqual({
      title: 'Tom & <Jerry>',
      series: 'Cartoons',
      volume: '3',
      releaseDate: '2003-05',
      language: 'fr',
      credits: [
        { firstName: 'Jean', lastName: 'Van Hamme', role: 'writer' },
        { firstName: '', lastName: 'Moebius', role: 'artist' },
      ],
    });
  });

  it('leaves out the unknown fields', () => {
    const text = buildNfo({ title: 'Seul', series: null, volume: null, releaseDate: null, language: null, credits: [] });
    expect(parseNfo(text)).toEqual({ title: 'Seul' });
  });
});

describe('writeNfo', () => {
  const base = { title: 'Un', series: null, volume: null, releaseDate: null, language: null, credits: [] };

  it('replaces the sidecar, leaving no temporary file', async () => {
    const d = await mkdtemp(path.join(tmpdir(), 'skeudenn-nfo-'));
    dirs.push(d);
    const comic = path.join(d, 'Tome 1.cbz');
    await writeFile(nfoPathFor(comic), '<title>Ancien</title>');
    expect(await writeNfo({ ...base, path: comic })).toBe(true);
    expect(await readFile(nfoPathFor(comic), 'utf8')).toContain('<title>Un</title>');
    expect(await readdir(d)).toEqual(['Tome 1.nfo']);
  });

  it('does not write through a symbolic link planted as the sidecar', async (ctx) => {
    const d = await mkdtemp(path.join(tmpdir(), 'skeudenn-nfo-'));
    dirs.push(d);
    const comic = path.join(d, 'Tome 1.cbz');
    const precious = path.join(d, 'precious.txt');
    await writeFile(precious, 'keep me');
    try {
      await symlink(precious, nfoPathFor(comic));
    } catch (error) {
      // Windows only lets an administrator, or Developer Mode, create a symbolic link.
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') ctx.skip('symbolic links cannot be created here');
      throw error;
    }

    expect(await writeNfo({ ...base, path: comic })).toBe(true);
    expect(await readFile(precious, 'utf8')).toBe('keep me');
    expect((await lstat(nfoPathFor(comic))).isSymbolicLink()).toBe(false);
    expect(await readFile(nfoPathFor(comic), 'utf8')).toContain('<title>Un</title>');
  });

  it('returns false when the folder is missing', async () => {
    expect(await writeNfo({ ...base, path: path.join(tmpdir(), 'skeudenn-nfo-none', 'a.cbz') })).toBe(false);
  });
});

describe('writeNfoIfMissing', () => {
  const base = { title: 'Un', series: null, volume: null, releaseDate: null, language: null, credits: [] };

  it('creates the sidecar, then never overwrites it', async () => {
    const d = await mkdtemp(path.join(tmpdir(), 'skeudenn-nfo-'));
    dirs.push(d);
    const comic = path.join(d, 'Tome 1.cbz');
    expect(await writeNfoIfMissing({ ...base, path: comic })).toBe(true);
    expect(await readFile(nfoPathFor(comic), 'utf8')).toContain('<title>Un</title>');
    await writeFile(nfoPathFor(comic), '<title>Mien</title>');
    expect(await writeNfoIfMissing({ ...base, path: comic })).toBe(false);
    expect(await readFile(nfoPathFor(comic), 'utf8')).toBe('<title>Mien</title>');
  });

  it('returns false when the folder is missing', async () => {
    expect(await writeNfoIfMissing({ ...base, path: path.join(tmpdir(), 'skeudenn-nfo-none', 'a.cbz') })).toBe(false);
  });
});
