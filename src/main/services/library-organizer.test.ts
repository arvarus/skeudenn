import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import type { Credit } from '../../shared/library';
import { LibraryRepository } from '../db/library-repository';
import { migrate } from '../db/schema';
import {
  MAX_NAME_BYTES,
  letterFolderName,
  moveFile,
  organizedPaths,
  organizeEntries,
  planOrganization,
  safeFolderName,
  structureFolders,
  templatedStem,
  unorganizedIds,
  type OrganizedEntry,
} from './library-organizer';
import { nfoPathFor } from './nfo';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots.length = 0;
});

async function tree(files: string[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'skeudenn-organize-'));
  roots.push(root);
  for (const file of files) {
    const fullPath = path.join(root, file);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file);
  }
  return root;
}

/** Whether the temporary directory's file system ignores letter case (NTFS, APFS by default): `A` finds `a`. */
const caseInsensitive = (() => {
  const probe = mkdtempSync(path.join(tmpdir(), 'skeudenn-case-'));
  try {
    writeFileSync(path.join(probe, 'a'), '');
    return existsSync(path.join(probe, 'A'));
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

function repository(): LibraryRepository {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  return new LibraryRepository(db);
}

const ID = '3f2a9c1e-0000-4000-8000-000000000001';

/** The default layout, one subfolder per comic, in `root`. */
const flat = (root: string) => ({ root, structure: [], fileName: '' });

/** The subfolder of the default layout for a comic at `filePath`. */
const folderOf = (filePath: string) => path.basename(path.dirname(organizedPaths(flat('/org'), entry({ path: filePath }))[0]));

describe('default layout subfolder', () => {
  it('is the file name without its extension, then the id', () => {
    expect(folderOf('/comics/Astérix T01.cbz')).toBe(`Astérix T01 (${ID})`);
  });

  it('cuts a long name to fit the OS limit, never splitting a character', () => {
    const name = folderOf(`/comics/${'é'.repeat(300)}.cbz`);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(MAX_NAME_BYTES);
    expect(name.endsWith(` (${ID})`)).toBe(true);
    expect(name).not.toContain('�');
  });

  it('drops the trailing spaces and dots left by a cut', () => {
    const name = folderOf(`/comics/${'a'.repeat(214)}. ${'b'.repeat(50)}.cbz`);
    expect(name).toBe(`${'a'.repeat(214)} (${ID})`);
  });
});

describe('moveFile', () => {
  it('moves the file into a new folder', async () => {
    const root = await tree(['in/a.cbz']);
    const to = path.join(root, 'out', 'sub', 'a.cbz');
    await moveFile(path.join(root, 'in/a.cbz'), to);
    expect(await readFile(to, 'utf8')).toBe('in/a.cbz');
    expect(await exists(path.join(root, 'in/a.cbz'))).toBe(false);
  });

  it('never overwrites an existing file', async () => {
    const root = await tree(['a.cbz', 'out/a.cbz']);
    await expect(moveFile(path.join(root, 'a.cbz'), path.join(root, 'out/a.cbz'))).rejects.toThrow();
    expect(await readFile(path.join(root, 'out/a.cbz'), 'utf8')).toBe('out/a.cbz');
    expect(await exists(path.join(root, 'a.cbz'))).toBe(true);
  });

  it('removes the folder it created when the move fails', async () => {
    const root = await tree([]);
    await expect(moveFile(path.join(root, 'missing.cbz'), path.join(root, 'out/missing.cbz'))).rejects.toThrow();
    expect(await exists(path.join(root, 'out'))).toBe(false);
  });

  it('removes every folder it created, and only those, when the move fails', async () => {
    const root = await tree(['kept/other.cbz']);
    await expect(
      moveFile(path.join(root, 'missing.cbz'), path.join(root, 'kept', 'a', 'b', 'missing.cbz')),
    ).rejects.toThrow();
    expect(await exists(path.join(root, 'kept', 'a'))).toBe(false);
    expect(await exists(path.join(root, 'kept', 'other.cbz'))).toBe(true);
  });

  it.skipIf(!caseInsensitive)('renames a file to another letter case in two steps', async () => {
    const root = await tree(['tintin.cbz']);
    await moveFile(path.join(root, 'tintin.cbz'), path.join(root, 'Tintin.cbz'));
    expect(await readdir(root)).toEqual(['Tintin.cbz']);
    expect(await readFile(path.join(root, 'Tintin.cbz'), 'utf8')).toBe('tintin.cbz');
  });

  it.skipIf(caseInsensitive)('keeps refusing an existing file that differs only by case on a case-sensitive system', async () => {
    const root = await tree(['tintin.cbz', 'Tintin.cbz']);
    await expect(moveFile(path.join(root, 'tintin.cbz'), path.join(root, 'Tintin.cbz'))).rejects.toThrow();
    expect((await readdir(root)).sort()).toEqual(['Tintin.cbz', 'tintin.cbz']);
  });
});

describe.skipIf(!caseInsensitive)('organizeEntries on a case-insensitive file system', () => {
  /** Registers `files` (relative to `root`) and organizes them under `target`; their ids. */
  async function organized(
    root: string,
    target: Parameters<typeof organizeEntries>[1],
    repo: LibraryRepository,
    books: { file: string; series: string; volume: string }[],
  ): Promise<string[]> {
    const ids = books.map(({ file, series, volume }) => {
      const from = path.join(root, file);
      repo.register(from, file, 1, 1, 1);
      const id = repo.idOfPath(from)!;
      repo.updateMetadata(id, { series, volume });
      return id;
    });
    const summary = await organizeEntries(repo, target, ids);
    expect(summary.failed).toBe(0);
    return ids;
  }

  it('gives a comic of the default layout the new case of its series, folder and file', async () => {
    const source = await tree(['a.cbz']);
    const root = await tree([]);
    const repo = repository();
    const target = { root, structure: [], fileName: '{series}' };
    const [id] = await organized(source, target, repo, [{ file: 'a.cbz', series: 'tintin', volume: '1' }]);
    expect(await readdir(root)).toEqual([`tintin (${id})`]);

    repo.updateMetadata(id!, { series: 'Tintin' });
    expect(unorganizedIds(repo, target)).toEqual([id]);
    const summary = await organizeEntries(repo, target, [id!]);

    const to = path.join(root, `Tintin (${id})`, 'Tintin.cbz');
    expect(summary).toMatchObject({ failed: 0, moved: [{ id, to }] });
    expect(await readdir(root)).toEqual([`Tintin (${id})`]);
    expect(await readdir(path.dirname(to))).toEqual(['Tintin.cbz']);
    expect(repo.get(id!)?.path).toBe(to);
    expect(unorganizedIds(repo, target)).toEqual([]);
  });

  it('renames a level folder to the new case and repoints the other comics it holds', async () => {
    const source = await tree(['a.cbz', 'b.cbz']);
    const root = await tree([]);
    const repo = repository();
    const target = { root, structure: ['series' as const], fileName: '{series} {volume}' };
    const [first, second] = await organized(source, target, repo, [
      { file: 'a.cbz', series: 'tintin', volume: '1' },
      { file: 'b.cbz', series: 'tintin', volume: '2' },
    ]);
    repo.updateMetadata(first!, { series: 'Tintin' });
    repo.updateMetadata(second!, { series: 'Tintin' });

    const summary = await organizeEntries(repo, target, [first!]);

    expect(summary).toMatchObject({
      failed: 0,
      moved: [{ id: first, to: path.join(root, 'Tintin', 'Tintin 1.cbz') }],
      relocated: [{ id: second, to: path.join(root, 'Tintin', 'tintin 2.cbz') }],
    });
    expect(await readdir(root)).toEqual(['Tintin']);
    expect(repo.get(second!)?.path).toBe(path.join(root, 'Tintin', 'tintin 2.cbz'));

    expect(await organizeEntries(repo, target, unorganizedIds(repo, target))).toMatchObject({ failed: 0 });
    expect((await readdir(path.join(root, 'Tintin'))).sort()).toEqual(['Tintin 1.cbz', 'Tintin 2.cbz']);
    expect(unorganizedIds(repo, target)).toEqual([]);
  });

  it('only renames the folder when the file name already has the right case', async () => {
    const source = await tree(['Tome.cbz']);
    const root = await tree([]);
    const repo = repository();
    const target = { root, structure: ['series' as const], fileName: '' };
    const [id] = await organized(source, target, repo, [{ file: 'Tome.cbz', series: 'tintin', volume: '1' }]);

    repo.updateMetadata(id!, { series: 'Tintin' });
    const summary = await organizeEntries(repo, target, [id!]);

    const to = path.join(root, 'Tintin', 'Tome.cbz');
    expect(summary).toMatchObject({ failed: 0, moved: [{ id, to }], relocated: [] });
    expect(await readdir(path.join(root, 'Tintin'))).toEqual(['Tome.cbz']);
    expect(unorganizedIds(repo, target)).toEqual([]);
  });
});

describe('organizeEntries', () => {
  it('moves each comic into its own subfolder and points its entry there', async () => {
    const source = await tree(['Série/Tome 1.cbz']);
    const target = await tree([]);
    const repo = repository();
    const from = path.join(source, 'Série/Tome 1.cbz');
    repo.register(from, 'Tome 1', 10, 10, 1);
    const id = repo.idOfPath(from)!;
    repo.updateTags(id, ['Lu']);

    const summary = await organizeEntries(repo, flat(target), [id]);

    const to = summary.moved[0]?.to;
    expect(to).toBe(path.join(target, `Tome 1 (${id})`, 'Tome 1.cbz'));
    expect(summary).toEqual({ moved: [{ id, from, to }], failed: 0, cancelled: false, relocated: [] });
    expect(await exists(to)).toBe(true);
    expect(await exists(from)).toBe(false);
    expect(repo.get(id)).toMatchObject({ path: to, tags: ['Lu'] });
    // The source folder is outside the organized folder: left alone, even empty.
    expect(await exists(path.join(source, 'Série'))).toBe(true);
  });

  it('moves the cover kept beside the comic with it', async () => {
    const source = await tree(['Tome 1.cbz', 'Tome 1.cover.webp']);
    const target = await tree([]);
    const repo = repository();
    const from = path.join(source, 'Tome 1.cbz');
    repo.register(from, 'Tome 1', 10, 10, 1);
    const id = repo.idOfPath(from)!;

    const summary = await organizeEntries(repo, flat(target), [id]);

    const to = summary.moved[0]!.to;
    expect(await exists(path.join(path.dirname(to), 'Tome 1.cover.webp'))).toBe(true);
    expect(await exists(path.join(source, 'Tome 1.cover.webp'))).toBe(false);
  });

  it('moves the .nfo beside the comic with it, under the comic\'s new name', async () => {
    const source = await tree(['Tome 1.cbz', 'Tome 1.nfo']);
    const target = await tree([]);
    const repo = repository();
    const from = path.join(source, 'Tome 1.cbz');
    repo.register(from, 'Tome 1', 10, 10, 1);
    const id = repo.idOfPath(from)!;

    const summary = await organizeEntries(repo, flat(target), [id]);

    expect(await exists(nfoPathFor(summary.moved[0]!.to))).toBe(true);
    expect(await exists(path.join(source, 'Tome 1.nfo'))).toBe(false);
  });

  it('never moves a file that is not a comic, and does not offer it for organizing', async () => {
    const source = await tree(['notes.txt']);
    const target = await tree([]);
    const repo = repository();
    const from = path.join(source, 'notes.txt');
    repo.register(from, 'notes', 1, 1, 1);
    const id = repo.idOfPath(from)!;

    expect(unorganizedIds(repo, flat(target))).toEqual([]);
    expect(await organizeEntries(repo, flat(target), [id])).toEqual({ moved: [], failed: 1, cancelled: false, relocated: [] });
    expect(await exists(from)).toBe(true);
  });

  it('skips a comic already in place and counts a missing file as failed', async () => {
    const target = await tree([]);
    const repo = repository();
    repo.register('/nowhere/gone.cbz', 'gone', 1, 1, 1);
    const gone = repo.idOfPath('/nowhere/gone.cbz')!;

    const first = await organizeEntries(repo, flat(target), [gone, 'unknown-id']);
    expect(first).toEqual({ moved: [], failed: 1, cancelled: false, relocated: [] });
    expect(repo.get(gone)?.path).toBe('/nowhere/gone.cbz');
  });

  it('tidies a comic dropped in the organized folder, deleting the subfolder it leaves empty', async () => {
    const target = await tree(['dropped/a.cbz']);
    const repo = repository();
    const from = path.join(target, 'dropped/a.cbz');
    repo.register(from, 'a', 1, 1, 1);
    const id = repo.idOfPath(from)!;

    await organizeEntries(repo, flat(target), [id]);
    const again = await organizeEntries(repo, flat(target), [id]);

    expect(again).toEqual({ moved: [], failed: 0, cancelled: false, relocated: [] });
    expect(repo.get(id)?.path).toBe(path.join(target, `a (${id})`, 'a.cbz'));
    expect(await exists(path.join(target, 'dropped'))).toBe(false);
  });
});

describe('planOrganization', () => {
  const added = [
    { id: 'in', path: '/organized/x.cbz' },
    { id: 'out', path: '/comics/y.cbz' },
  ];

  it('does nothing when off or without a folder', () => {
    expect(planOrganization('off', '/organized', added)).toEqual({ now: [], offer: [] });
    expect(planOrganization('always', '', added)).toEqual({ now: [], offer: [] });
  });

  it('moves everything with always', () => {
    expect(planOrganization('always', '/organized', added)).toEqual({ now: ['in', 'out'], offer: [] });
  });

  it('moves what is in the organized folder and offers the rest with ask', () => {
    expect(planOrganization('ask', '/organized', added)).toEqual({ now: ['in'], offer: ['out'] });
  });
});

describe('unorganizedIds', () => {
  it('lists the entries not at their organized path yet', async () => {
    const target = await tree([]);
    const source = await tree(['a.cbz', 'b.cbz']);
    const repo = repository();
    for (const name of ['a.cbz', 'b.cbz']) repo.register(path.join(source, name), name, 1, 1, 1);
    const a = repo.idOfPath(path.join(source, 'a.cbz'))!;
    const b = repo.idOfPath(path.join(source, 'b.cbz'))!;
    expect(unorganizedIds(repo, flat(target)).sort()).toEqual([a, b].sort());

    const progress: [number, number][] = [];
    await organizeEntries(repo, flat(target), [a], (processed, total) => progress.push([processed, total]));

    expect(progress).toEqual([[0, 1]]);
    expect(unorganizedIds(repo, flat(target))).toEqual([b]);
  });
});

function credit(firstName: string, lastName: string, role: Credit['role']): Credit {
  return { personId: `${firstName}-${lastName}`, firstName, lastName, role };
}

function entry(fields: Partial<OrganizedEntry> = {}): OrganizedEntry {
  return {
    id: ID,
    path: '/comics/Tintin au Tibet.cbz',
    title: 'Tintin au Tibet',
    series: 'Tintin',
    volume: '20',
    releaseDate: '1960-01',
    language: null,
    credits: [credit('', 'Hergé', 'writer')],
    ...fields,
  };
}

describe('organizedPaths without a fiche', () => {
  it('keeps the original file name when the template has nothing to fill it with', () => {
    const bare = entry({ series: null, volume: null, releaseDate: null, credits: [] });
    const root = path.resolve('/org');
    const target = { root, structure: [], fileName: '{series} - T{volume}' };
    expect(organizedPaths(target, bare)).toEqual([path.join(root, `Tintin au Tibet (${ID})`, 'Tintin au Tibet.cbz')]);
    expect(organizedPaths(target, entry())[0]).toBe(path.join(root, `Tintin - T20 (${ID})`, 'Tintin - T20.cbz'));
  });
});

describe('safeFolderName', () => {
  it('replaces the characters Windows refuses and trims the ends', () => {
    expect(safeFolderName(' AC/DC: "Live"? <1>. ')).toBe('AC_DC_ _Live__ _1_');
  });

  it('suffixes a reserved device name', () => {
    expect(safeFolderName('Con')).toBe('Con_');
    expect(safeFolderName('lpt1.txt')).toBe('lpt1.txt_');
  });

  it('cuts a long name to fit the OS limit', () => {
    expect(Buffer.byteLength(safeFolderName('é'.repeat(300)))).toBeLessThanOrEqual(MAX_NAME_BYTES);
  });

  it('falls back to the translated "Unknown"', () => {
    applyLanguage('fr');
    try {
      expect(safeFolderName(' .. ')).toBe('Inconnu');
    } finally {
      applyLanguage('en');
    }
    expect(safeFolderName('')).toBe('Unknown');
  });
});

describe('letterFolderName', () => {
  it('takes the first letter, upper-cased and without its accent', () => {
    expect(letterFolderName('astérix')).toBe('A');
    expect(letterFolderName('Élise')).toBe('E');
  });

  it('keeps a digit and uses # for anything else', () => {
    expect(letterFolderName('2001 Nights')).toBe('2');
    expect(letterFolderName('_Untitled')).toBe('#');
    expect(letterFolderName('')).toBe('#');
  });
});

describe('structureFolders', () => {
  it('names one folder per level', () => {
    expect(structureFolders(['year', 'author', 'album'], entry())).toEqual(['1960', 'Hergé', 'Tintin au Tibet']);
  });

  it('names a letter level after the next level', () => {
    expect(structureFolders(['letter', 'series'], entry())).toEqual(['T', 'Tintin']);
    expect(structureFolders(['letter', 'author', 'series'], entry())).toEqual(['H', 'Hergé', 'Tintin']);
  });

  it('files under the first writer, as last name then first name', () => {
    const credits = [credit('Albert', 'Uderzo', 'artist'), credit('René', 'Goscinny', 'writer')];
    expect(structureFolders(['author'], entry({ credits }))).toEqual(['Goscinny René']);
    expect(structureFolders(['author'], entry({ credits: [credit('Albert', 'Uderzo', 'artist')] }))).toEqual([
      'Uderzo Albert',
    ]);
  });

  it('uses "Unknown" for a missing year or author and the title for a missing series', () => {
    const bare = entry({ series: null, releaseDate: null, credits: [] });
    expect(structureFolders(['year', 'author', 'series'], bare)).toEqual(['Unknown', 'Unknown', 'Tintin au Tibet']);
  });
});

describe('organizedPaths', () => {
  it('puts the file straight in the last level, with an id-suffixed fallback name', () => {
    expect(organizedPaths({ root: '/org', structure: ['series'], fileName: '' }, entry())).toEqual([
      path.join('/org', 'Tintin', 'Tintin au Tibet.cbz'),
      path.join('/org', 'Tintin', `Tintin au Tibet (${ID}).cbz`),
    ]);
  });

  it('keeps the original name of a file renamed by a collision', () => {
    const renamed = entry({ path: `/org/Tintin/Tintin au Tibet (${ID}).cbz` });
    expect(organizedPaths({ root: '/org', structure: ['year'], fileName: '' }, renamed)[0]).toBe(
      path.join('/org', '1960', 'Tintin au Tibet.cbz'),
    );
    expect(organizedPaths(flat('/org'), renamed)[0]).toBe(path.join('/org', `Tintin au Tibet (${ID})`, 'Tintin au Tibet.cbz'));
  });
});

describe('templatedStem', () => {
  it('puts the volume prefix in front of the volume, of numeric ones only on request', () => {
    expect(templatedStem('{series} {volume}', entry(), '.cbz', [], 'T')).toBe('Tintin T20');
    expect(templatedStem('{series} {volume}', entry({ volume: 'HS' }), '.cbz', [], 'T')).toBe('Tintin THS');
    expect(templatedStem('{series} {volume}', entry({ volume: 'HS' }), '.cbz', [], 'T', true)).toBe('Tintin HS');
  });

  it('fills the template from the entry', () => {
    expect(templatedStem('{series} - T{volume} - {title} ({year}, {author})', entry(), '.cbz')).toBe(
      'Tintin - T20 - Tintin au Tibet (1960, Hergé)',
    );
  });

  it('writes "Unknown" for a missing field and makes the name safe', () => {
    const bare = entry({ series: null, volume: '  ', releaseDate: null, credits: [], title: 'Quoi?' });
    expect(templatedStem('{series} - T{volume} - {title} {year} {author}', bare, '.cbz')).toBe(
      'Unknown - Quoi_ Unknown Unknown',
    );
  });

  it('leaves a missing volume out with the text glued before it', () => {
    const noVolume = entry({ volume: null });
    expect(templatedStem('{series} - T{volume} - {title}', noVolume, '.cbz')).toBe('Tintin - Tintin au Tibet');
    expect(templatedStem('{series} T{volume}', noVolume, '.cbz')).toBe('Tintin');
  });

  it('cuts a long name so that the extension still fits', () => {
    const long = entry({ title: 'é'.repeat(200) });
    const stem = templatedStem('{title}', long, '.cbz');
    expect(Buffer.byteLength(`${stem}.cbz`)).toBeLessThanOrEqual(MAX_NAME_BYTES);
  });
});

describe('organizedPaths with a file name template', () => {
  const fileName = '{series} - T{volume} - {title}';

  it('renames the file in the last level, with an id-suffixed fallback', () => {
    expect(organizedPaths({ root: '/org', structure: ['series'], fileName }, entry())).toEqual([
      path.join('/org', 'Tintin', 'Tintin - T20 - Tintin au Tibet.cbz'),
      path.join('/org', 'Tintin', `Tintin - T20 - Tintin au Tibet (${ID}).cbz`),
    ]);
  });

  it('names the subfolder of the default layout after the new name', () => {
    expect(organizedPaths({ root: '/org', structure: [], fileName }, entry())[0]).toBe(
      path.join('/org', `Tintin - T20 - Tintin au Tibet (${ID})`, 'Tintin - T20 - Tintin au Tibet.cbz'),
    );
  });

  it('renames the comics already in place when the template changes', async () => {
    const source = await tree(['a/Tome 1.cbz']);
    const target = await tree([]);
    const repo = repository();
    const file = path.join(source, 'a', 'Tome 1.cbz');
    repo.register(file, 'Tome 1', 1, 1, 1);
    const id = repo.idOfPath(file)!;
    repo.updateMetadata(id, { series: 'Blacksad', volume: '1', title: 'Quelque part entre les ombres' });

    await organizeEntries(repo, { root: target, structure: ['series'], fileName: '' }, [id]);
    const renamed = { root: target, structure: ['series'] as const, fileName };
    expect(unorganizedIds(repo, renamed)).toEqual([id]);
    await organizeEntries(repo, renamed, [id]);

    const expected = path.join(target, 'Blacksad', 'Blacksad - T1 - Quelque part entre les ombres.cbz');
    expect(repo.get(id)?.path).toBe(expected);
    expect(await readFile(expected, 'utf8')).toBe('a/Tome 1.cbz');
    expect(await exists(path.join(target, 'Blacksad', 'Tome 1.cbz'))).toBe(false);
    expect(unorganizedIds(repo, renamed)).toEqual([]);
  });
});

describe('organizeEntries with a structure', () => {
  it('files comics by series, renaming one whose name is taken', async () => {
    const source = await tree(['a/Tome 1.cbz', 'b/Tome 1.cbz']);
    const target = await tree([]);
    const repo = repository();
    const ids = ['a', 'b'].map((folder) => {
      const file = path.join(source, folder, 'Tome 1.cbz');
      repo.register(file, 'Tome 1', 1, 1, 1);
      const id = repo.idOfPath(file)!;
      repo.updateMetadata(id, { series: 'Blacksad' });
      return id;
    });
    const structure = { root: target, structure: ['letter', 'series'] as const, fileName: '' };

    const summary = await organizeEntries(repo, structure, ids);

    expect(summary.failed).toBe(0);
    expect(repo.get(ids[0])?.path).toBe(path.join(target, 'B', 'Blacksad', 'Tome 1.cbz'));
    expect(repo.get(ids[1])?.path).toBe(path.join(target, 'B', 'Blacksad', `Tome 1 (${ids[1]}).cbz`));
    expect(unorganizedIds(repo, structure)).toEqual([]);
  });

  it('moves the comics again when the structure changes, deleting the emptied folders', async () => {
    const source = await tree(['Tome 1.cbz']);
    const target = await tree([]);
    const repo = repository();
    repo.register(path.join(source, 'Tome 1.cbz'), 'Tome 1', 1, 1, 1);
    const id = repo.idOfPath(path.join(source, 'Tome 1.cbz'))!;
    repo.updateMetadata(id, { series: 'Blacksad', releaseDate: '2000' });

    await organizeEntries(repo, { root: target, structure: ['letter', 'series'], fileName: '' }, [id]);
    const byYear = { root: target, structure: ['year', 'series'] as const, fileName: '' };
    expect(unorganizedIds(repo, byYear)).toEqual([id]);
    await organizeEntries(repo, byYear, [id]);

    expect(repo.get(id)?.path).toBe(path.join(target, '2000', 'Blacksad', 'Tome 1.cbz'));
    expect(await exists(path.join(target, 'B'))).toBe(false);
    expect(await exists(target)).toBe(true);
  });
});

describe('ignoring leading articles', () => {
  const articles = ['le', 'la', "l'", 'the'];
  const northWind = entry({ title: 'Le vent du nord', series: 'Le vent du nord', volume: '3' });

  it('files the series and album names under their first real word', () => {
    expect(structureFolders(['letter', 'series'], northWind, articles)).toEqual(['V', 'Vent du nord (Le)']);
    expect(structureFolders(['letter', 'album'], northWind, articles)).toEqual(['V', 'Vent du nord (Le)']);
    // The option off, the name is kept as it is.
    expect(structureFolders(['letter', 'series'], northWind)).toEqual(['L', 'Le vent du nord']);
  });

  it('uses the title for a one-shot, and leaves author and year alone', () => {
    const oneShot = entry({ series: null, title: "L'été indien" });
    expect(structureFolders(['letter', 'series'], oneShot, articles)).toEqual(['E', "Été indien (L')"]);
    expect(structureFolders(['year', 'author'], northWind, articles)).toEqual(['1960', 'Hergé']);
  });

  it('applies to the series and title fields of the file name', () => {
    expect(templatedStem('{series} - T{volume} - {title}', northWind, '.cbz', articles)).toBe(
      'Vent du nord (Le) - T3 - Vent du nord (Le)',
    );
    expect(templatedStem('{series} - {title}', northWind, '.cbz')).toBe('Le vent du nord - Le vent du nord');
  });

  it('puts the file where the target with articles says, and not in place under the other target', () => {
    const target = { root: '/org', structure: ['letter', 'series'] as const, fileName: '', articles };
    const [place] = organizedPaths(target, northWind);
    expect(place).toBe(path.join('/org', 'V', 'Vent du nord (Le)', path.basename(northWind.path)));
    expect(organizedPaths({ ...target, articles: [] }, northWind)[0]).not.toBe(place);
  });
});
