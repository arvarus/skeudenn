import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyLanguage } from '../../shared/i18n';
import { isBedethequeAlbumUrl, pageSourceOf } from '../../shared/metadata';
import {
  resetBedethequeState,
  fetchBedethequeAlbum,
  parseBedethequeAlbum,
  parseSeriesAlbums,
  parseSeriesSearch,
  pickAlbum,
  pickSeries,
  pickSeriesAll,
  searchBedetheque,
} from './bedetheque';
import type { HttpOptions } from './http-json';
import { setLookupLogSink } from './lookup-log';

// The user-facing messages are checked in French; English is the interface's default.
beforeAll(() => applyLanguage('fr'));
// Nothing is remembered from one test to the next, and the requests are not spaced out.
beforeEach(() => resetBedethequeState(0));
// The lookup log stays out of the test output.
beforeEach(() => setLookupLogSink(null));

const URL_1 = 'https://www.bedetheque.com/BD-Winged-Mermaids-Tome-1-311296.html';

/** A trimmed-down album page, keeping the markup of a real one around what the parser reads. */
function albumPage({
  subtitle = '1<span class="bdt-numa"></span>. Tome 1',
  deposit = '<b>09/2017</b>\n<meta itemprop="datePublished" content="2017-09-20">\n(20 septembre 2017)',
} = {}) {
  return `<!DOCTYPE html><html><head><title>Winged Mermaids -1- Tome 1</title></head><body>
<section class="bdt-ah">
  <div class="bdt-ah-cover">
    <img itemprop="image" src="https://www.bedetheque.com/media/Couvertures/Couv_311296.jpg" alt="Couverture">
  </div>
  <div class="bdt-ah-main">
    <div class="bdt-ah-top"><div>
      <h1><a href="https://www.bedetheque.com/serie-57963-BD-Winged-Mermaids.html" title="Winged Mermaids">Winged Mermaids</a></h1>
      ${subtitle === null ? '' : `<h2 class="bdt-ah-sub">\n ${subtitle}  </h2>`}
    </div></div>
    <meta itemprop="name" content="Winged Mermaids - Tome 1">
    <meta itemprop="alternativeheadline" content="Tome 1">
    <div class="bdt-ah-auteurs liste-auteurs">
      <span><a href="https://www.bedetheque.com/auteur-13741-BD-Shiono-Etorouji.html" title="Voir la fiche de Shiono, Etorouji">Shiono, Etorouji</a>   <small>(Scénario)</small></span>
      <span><a href="https://www.bedetheque.com/auteur-13741-BD-Shiono-Etorouji.html" title="Voir la fiche de Shiono, Etorouji">Shiono, Etorouji</a>   <small>(Dessin)</small></span>
      <span><a href="https://www.bedetheque.com/auteur-477-BD-NB.html" title="Voir la fiche de <N&B>">&lt;N&amp;B&gt;</a>   <small>(Couleurs)</small></span>
      <span><a href="https://www.bedetheque.com/auteur-1-BD-Van-Hamme-Jean.html">Van Hamme, Jean</a> <small>(Traduction)</small></span>
      <span><a href="https://www.bedetheque.com/auteur-2-BD-Herge.html">Hergé</a> <small>(Couverture)</small></span>
    </div>
    <div class="bdt-ah-meta"><ul class="bdt-ah-pastilles">
      <li title="Dépôt légal">${deposit}</li>
      <li><b itemprop="numberOfPages">200</b> pages</li>
    </ul></div>
    <meta itemprop="inLanguage" content="fr">
  </div>
</section>
<section class="bdt-shelf" id="albums-serie">
  <h1>Autre série</h1>
  <h2 class="bdt-ah-sub">2. Tome 2</h2>
</section>
<article itemprop="review"><time itemprop="datePublished" datetime="2020-10-30">le 30/10/2020</time></article>
</body></html>`;
}

describe('isBedethequeAlbumUrl', () => {
  it('accepts album pages only', () => {
    expect(isBedethequeAlbumUrl(URL_1)).toBe(true);
    expect(isBedethequeAlbumUrl(`  ${URL_1.replace('https', 'http').replace('www.', '')}  `)).toBe(true);
    expect(isBedethequeAlbumUrl('https://www.bedetheque.com/serie-57963-BD-Winged-Mermaids.html')).toBe(false);
    expect(isBedethequeAlbumUrl('https://example.com/BD-Winged-Mermaids-Tome-1-311296.html')).toBe(false);
    expect(isBedethequeAlbumUrl('Winged Mermaids')).toBe(false);
  });
});

describe('parseBedethequeAlbum', () => {
  it('reads the main album block', () => {
    expect(parseBedethequeAlbum(albumPage(), URL_1)).toEqual({
      source: 'bedetheque',
      sourceId: '311296',
      sourceUrl: URL_1,
      coverUrl: 'https://www.bedetheque.com/media/Couvertures/Couv_311296.jpg',
      title: 'Tome 1',
      series: 'Winged Mermaids',
      volume: '1',
      releaseDate: '2017-09-20',
      language: 'fr',
      credits: [
        { firstName: 'Etorouji', lastName: 'Shiono', role: 'writer' },
        { firstName: 'Etorouji', lastName: 'Shiono', role: 'artist' },
        { firstName: '', lastName: 'Hergé', role: 'cover' },
      ],
    });
  });

  it('keeps a volume letter and the title after the number', () => {
    const candidate = parseBedethequeAlbum(
      albumPage({ subtitle: '12<span class="bdt-numa">a</span>. L&#039;Affaire Tournesol' }),
      URL_1,
    );
    expect(candidate.volume).toBe('12a');
    expect(candidate.title).toBe("L'Affaire Tournesol");
  });

  it('has no volume for a one-shot', () => {
    const candidate = parseBedethequeAlbum(albumPage({ subtitle: 'Le Grand Voyage' }), URL_1);
    expect(candidate.volume).toBeNull();
    expect(candidate.title).toBe('Le Grand Voyage');
  });

  it('falls back to the alternative headline when there is no subtitle', () => {
    expect(parseBedethequeAlbum(albumPage({ subtitle: null as unknown as string }), URL_1).title).toBe('Tome 1');
  });

  it('keeps only the month when the exact day is unknown', () => {
    const deposit = '<b>03/1977</b> <meta itemprop="datePublished" content="1977-03-01">';
    expect(parseBedethequeAlbum(albumPage({ deposit }), URL_1).releaseDate).toBe('1977-03');
    expect(parseBedethequeAlbum(albumPage({ deposit: '<b>1977</b>' }), URL_1).releaseDate).toBe('1977');
  });

  it('rejects a page without an album block', () => {
    expect(() => parseBedethequeAlbum('<html><body>Série</body></html>', URL_1)).toThrow(
      'Bédéthèque : cette page ne décrit pas un album.',
    );
  });
});

describe('fetchBedethequeAlbum', () => {
  const http = (fetch: (input: string | URL | Request) => Promise<Response>): HttpOptions => ({
    fetch: fetch as typeof globalThis.fetch,
    userAgent: 'Tankobon/test',
    timeoutMs: 1000,
  });

  it('downloads the page over https, without the fragment', async () => {
    const fetch = vi.fn(async () => new Response(albumPage(), { status: 200 }));
    const candidate = await fetchBedethequeAlbum(`${URL_1.replace('https', 'http')}#ed-311296`, http(fetch));
    expect(fetch).toHaveBeenCalledWith(URL_1, expect.anything());
    expect(candidate.sourceUrl).toBe(URL_1);
    expect(candidate.series).toBe('Winged Mermaids');
  });

  it('refuses other links without fetching', async () => {
    const fetch = vi.fn<(input: string | URL | Request) => Promise<Response>>();
    await expect(fetchBedethequeAlbum('https://example.com/', http(fetch))).rejects.toThrow(/fiche album/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports a missing page', async () => {
    const fetch = vi.fn(async () => new Response('Not found', { status: 404 }));
    await expect(fetchBedethequeAlbum(URL_1, http(fetch))).rejects.toThrow("Bédéthèque : cette page n'existe pas.");
  });
});

describe('pageSourceOf', () => {
  it('tells the supported sites by the link', () => {
    expect(pageSourceOf(URL_1)).toBe('bedetheque');
    expect(pageSourceOf('https://www.bdfugue.com/knights-of-sidonia-tome-15')).toBe('bdfugue');
    expect(pageSourceOf('https://www.nautiljon.com/mangas/knights+of+sidonia/volume-1,12218.html')).toBe('nautiljon');
  });

  it('refuses anything else', () => {
    expect(pageSourceOf('https://www.bdfugue.com/')).toBeNull();
    expect(pageSourceOf('https://www.nautiljon.com/mangas/knights+of+sidonia/')).toBeNull();
    expect(pageSourceOf('https://example.com/knights-of-sidonia-tome-15')).toBeNull();
    expect(pageSourceOf('not a link')).toBeNull();
  });
});

/** The search box's answer for "blacksad" (shortened): the series, their translations, an author. */
const SEARCH_BLACKSAD = [
  { id: 'S86490', label: 'Blacksad (en allemand)', value: 'Blacksad (en allemand)', desc: 'skin/flags/Germany.png', category: 'Séries' },
  { id: 'S500', label: 'Blacksad', value: 'Blacksad', desc: 'skin/flags/France.png', category: 'Séries' },
  { id: 'S95276', label: 'Blacksad Stories', value: 'Blacksad Stories', desc: 'skin/flags/France.png', category: 'Séries' },
  { id: 'A543', label: 'Díaz Canalès, Juan', value: 'Díaz Canalès, Juan', desc: '', category: 'Auteurs' },
];

/** One line of the series page's album box, as the site writes it. */
function albumLine(slug: string, number: string, title: string, date: string, kind = '') {
  return `<li${kind ? ` class="${kind}"` : ''}>
    <a href="https://www.bedetheque.com/BD-Blacksad-${slug}.html" title="${title}">
      <span class="bdt-box-albums-num" title="${number}">${kind === '' ? `${number}<span class="bdt-numa"></span>` : `<span class="bdt-numa">${number}</span>`}</span>
      <span class="bdt-box-albums-titre">${title}</span>
      <span class="bdt-box-albums-dl">${date}</span>
    </a>
  </li>`;
}

/** A trimmed-down series page: the preview of four covers, the album box, and the paged detail. */
const SERIES_PAGE = `<html><body>
<div class="bdt-sh-tomes n4">
  <a class="bdt-img" href="https://www.bedetheque.com/BD-Blacksad-Tome-1-Quelque-part-entre-les-ombres-15161.html" title="Blacksad -1- Quelque part entre les ombres"></a>
</div>
<div class="bdt bdt-dense bdt-side-box">
  <div class="bdt-side-sheet bdt-box-albums is-hs-ouvert is-int-ouvert">
    <div class="bdt-kicker">Les 14 albums de la série</div>
    <ul class="bdt-box-albums-liste">
      ${albumLine('Tome-1-Quelque-part-entre-les-ombres-15161', '1', 'Quelque part entre les ombres', '11/2000')}
      ${albumLine('Tome-2-Arctic-Nation-24600', '2', 'Arctic-Nation', '03/2003')}
      ${albumLine('Tome-10-Dix-1', '10', 'Dix', '2030')}
      <li class="bdt-box-albums-grp"><button type="button" data-groupe="hs">4 hors-séries</button></li>
      ${albumLine('HS-What-s-News-426397', 'HS', "What&#039;s News", '11/2020', 'is-hs')}
      ${albumLine('HS1-L-histoire-des-aquarelles-51853', 'HS1', "L&#039;histoire des aquarelles", '11/2005', 'is-hs')}
      <li class="bdt-box-albums-grp"><button type="button" data-groupe="int">3 intégrales</button></li>
      ${albumLine('INT01-L-Integrale-226936', 'INT01', "L&#039;Intégrale", '11/2014', 'is-int')}
    </ul>
  </div>
</div>
<article class="bdt-edition bdt-edition--detail" itemscope itemtype="https://schema.org/Book">
  <a itemprop="url" href="https://www.bedetheque.com/BD-Blacksad-Tome-9-Detail-9.html"><span itemprop="name">9. Detail</span></a>
</article>
</body></html>`;

describe('parseSeriesSearch', () => {
  it('keeps the series, not the authors', () => {
    expect(parseSeriesSearch(SEARCH_BLACKSAD).map((series) => series.id)).toEqual(['86490', '500', '95276']);
  });

  it('ignores an answer that is not a list', () => {
    expect(parseSeriesSearch({ error: 'nope' })).toEqual([]);
    expect(parseSeriesSearch([null, 'S1', { id: 'S2' }, { id: 'S3', label: ' ' }])).toEqual([]);
  });
});

describe('parseSeriesSearch: escaped labels', () => {
  it("decodes the HTML entities of a label, so L'intégrale is found by its apostrophe", () => {
    const found = parseSeriesSearch([{ id: 'S3944', label: 'X-Men (L&#039;intégrale)', category: 'Série' }]);
    expect(found).toEqual([{ id: '3944', label: "X-Men (L'intégrale)" }]);
    expect(pickSeries(found, "X-Men (L'Intégrale)")?.id).toBe('3944');
  });
});

describe('pickSeries: initials', () => {
  it('treats spaced-out and joined initials as the same name', () => {
    const found = [{ id: '569', label: 'AD Grand-Rivière' }];
    expect(pickSeries(found, 'A.D Grand-Rivière')?.id).toBe('569');
    expect(pickSeries([{ id: '1', label: 'A.D Grand-Rivière' }], 'AD Grand-Rivière')?.id).toBe('1');
  });

  it('does not pick other rivers', () => {
    const found = [
      { id: '63189', label: "Rivière à l'envers (La)" },
      { id: '68530', label: "Rivière d'encre" },
    ];
    expect(pickSeries(found, 'A.D Grand-Rivière')).toBeNull();
  });
});

describe('pickSeriesAll', () => {
  const tutti = [
    { id: '9070', label: 'Tutti Frutti (Stakhano)' },
    { id: '2542', label: 'Tutti Frutti (Trantkat)' },
  ];

  it('returns every homonymous series, told apart by a qualifier in parentheses', () => {
    expect(pickSeriesAll(tutti, 'Tutti Frutti').map((series) => series.id)).toEqual(['9070', '2542']);
  });

  it('returns a single series for a looser match, not a crowd', () => {
    const found = [
      { id: '1', label: 'X-Men Legacy' },
      { id: '2', label: 'X-Men Forever' },
    ];
    expect(pickSeriesAll(found, 'X-Men')).toHaveLength(1);
  });

  it('prefers the exact name to its homonyms', () => {
    const found = [...tutti, { id: '7', label: 'Tutti Frutti' }];
    expect(pickSeriesAll(found, 'Tutti Frutti').map((series) => series.id)).toEqual(['7']);
  });

  it('is empty when nothing matches', () => {
    expect(pickSeriesAll(tutti, 'Blacksad')).toEqual([]);
  });
});

describe('pickSeries: a text with a trailing article', () => {
  it("finds a series when the text, like the site's name, has its article last", () => {
    const found = [{ id: '2649', label: "Âge d'ombre (L')" }];
    expect(pickSeries(found, "Âge D'Ombre (L')")?.id).toBe('2649');
    expect(pickSeries(found, "L'Âge D'Ombre")?.id).toBe('2649');
    expect(pickSeries(found, "Âge D'Ombre")?.id).toBe('2649');
  });

  it('puts the article of the text back in front for a name the site writes in full', () => {
    expect(pickSeries([{ id: '1', label: 'Les Cahiers d\'Esther' }], "Cahiers d'Esther (Les)")?.id).toBe('1');
  });
});

describe('pickSeries: trailing articles', () => {
  it('finds a series whose article the site moved to the end', () => {
    const found = [{ id: '50922', label: "Cahiers d'Esther (Les)" }];
    expect(pickSeries(found, "Les cahiers d'Esther")?.id).toBe('50922');
    expect(pickSeries(found, "Cahiers d'Esther")?.id).toBe('50922');
  });

  it("puts an elided article back against the name: L'Intégrale", () => {
    const found = [{ id: '1', label: 'Intégrale (L\')' }];
    expect(pickSeries(found, "L'Intégrale")?.id).toBe('1');
  });
});

describe('pickSeries', () => {
  const series = parseSeriesSearch(SEARCH_BLACKSAD);

  it('takes the name equal to the text, ignoring case and accents, before its translations', () => {
    expect(pickSeries(series, 'BLACKSAD')?.id).toBe('500');
    expect(pickSeries([{ id: '1', label: 'Pokémon' }], 'pokemon')?.id).toBe('1');
  });

  it('takes the shortest name starting with the text when none is equal', () => {
    expect(pickSeries(series.slice(2), 'Blacksad St')?.id).toBe('95276');
    expect(pickSeries(series, 'Blacksa')?.id).toBe('500');
  });

  it('only falls back on a translation when nothing else matches', () => {
    expect(pickSeries([series[0]], 'Blacksad')?.id).toBe('86490');
  });

  it('finds nothing when no name contains the text', () => {
    expect(pickSeries(series, 'Corto Maltese')).toBeNull();
    expect(pickSeries(series, '   ')).toBeNull();
  });
});

describe('parseSeriesAlbums', () => {
  it('reads the album box: links, numbers, titles, dates and kinds', () => {
    expect(parseSeriesAlbums(SERIES_PAGE)).toEqual([
      {
        url: 'https://www.bedetheque.com/BD-Blacksad-Tome-1-Quelque-part-entre-les-ombres-15161.html',
        number: '1',
        title: 'Quelque part entre les ombres',
        releaseDate: '2000-11',
        kind: 'album',
      },
      {
        url: 'https://www.bedetheque.com/BD-Blacksad-Tome-2-Arctic-Nation-24600.html',
        number: '2',
        title: 'Arctic-Nation',
        releaseDate: '2003-03',
        kind: 'album',
      },
      { url: 'https://www.bedetheque.com/BD-Blacksad-Tome-10-Dix-1.html', number: '10', title: 'Dix', releaseDate: '2030', kind: 'album' },
      {
        url: 'https://www.bedetheque.com/BD-Blacksad-HS-What-s-News-426397.html',
        number: 'HS',
        title: "What's News",
        releaseDate: '2020-11',
        kind: 'hs',
      },
      {
        url: 'https://www.bedetheque.com/BD-Blacksad-HS1-L-histoire-des-aquarelles-51853.html',
        number: 'HS1',
        title: "L'histoire des aquarelles",
        releaseDate: '2005-11',
        kind: 'hs',
      },
      {
        url: 'https://www.bedetheque.com/BD-Blacksad-INT01-L-Integrale-226936.html',
        number: 'INT01',
        title: "L'Intégrale",
        releaseDate: '2014-11',
        kind: 'int',
      },
    ]);
  });

  it('finds nothing on a page without the box', () => {
    expect(parseSeriesAlbums('<html><body>Série</body></html>')).toEqual([]);
  });
});

/** A one-shot's series page: a presentation with the album only as its cover (Vitesse moderne). */
const ONE_SHOT_PAGE = `<html><body>
  <section class="bdt-ah bdt-ah--serie"><h1><span class="bdt-ah-type">One shot :</span>
    <a href="https://www.bedetheque.com/serie-4603-BD-Vitesse-moderne.html">Vitesse moderne</a></h1></section>
  <div class="bdt-sh-tomes n1">
    <a class="bdt-img" href="https://www.bedetheque.com/BD-Vitesse-moderne-19759.html" title="Vitesse moderne">
      <img src="https://www.bedetheque.com/cache/thb_couv/vitessemoderne.JPG" alt="Vitesse moderne">
    </a>
  </div>
</body></html>`;

describe('a one-shot series page', () => {
  it('gives the album shown as its cover, with no number', () => {
    expect(parseSeriesAlbums(ONE_SHOT_PAGE)).toEqual([
      {
        url: 'https://www.bedetheque.com/BD-Vitesse-moderne-19759.html',
        number: '',
        title: 'Vitesse moderne',
        releaseDate: null,
        kind: 'album',
      },
    ]);
  });

  it('is picked with no volume or with volume 1, not with another', () => {
    const albums = parseSeriesAlbums(ONE_SHOT_PAGE);
    expect(pickAlbum(albums, null)?.title).toBe('Vitesse moderne');
    expect(pickAlbum(albums, '1')?.title).toBe('Vitesse moderne');
    expect(pickAlbum(albums, '2')).toBeNull();
  });

  it('is found by searchBedetheque, reading the album page', async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://www.bdgest.com/ajax/tout')) {
        return Response.json([{ id: 'S4603', label: 'Vitesse moderne', category: 'Séries' }]);
      }
      if (url.startsWith('https://www.bedetheque.com/serie/index/s/')) return new Response(ONE_SHOT_PAGE);
      return new Response(albumPage());
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    const found = await searchBedetheque({ text: 'Vitesse moderne', volume: null }, http);
    expect(calls.at(-1)).toBe('https://www.bedetheque.com/BD-Vitesse-moderne-19759.html');
    expect(found).toHaveLength(1);
  });
});

/** The same one-shot with its album detail, as the site serves the album page (the series page). */
const ONE_SHOT_ALBUM_PAGE = `${ONE_SHOT_PAGE}
  <article class="bdt-edition bdt-edition--detail" id="ed-19759" itemscope>
    <h3><a itemprop="url" href="https://www.bedetheque.com/BD-Vitesse-moderne-19759.html"><span itemprop="name"><span class="bdt-numa"></span>Vitesse moderne</span></a></h3>
    <img itemprop="image" src="https://www.bedetheque.com/cache/thb_couv/vitessemoderne.JPG" alt="">
    <dl class="bdt-sheet">
      <dt>Scénario</dt><dd><a href="/auteur-193-BD-Blutch.html"><span itemprop="author">Blutch</span></a></dd>
      <dt>Dessin</dt><dd><a href="/auteur-193-BD-Blutch.html"><span itemprop="illustrator">Blutch</span></a></dd>
      <dt>Couleurs</dt><dd><a href="/auteur-610-BD-Ruby.html"><span itemprop="illustrator">Ruby</span></a></dd>
      <dt>Dépôt légal</dt><dd>09/2002 <meta itemprop="datePublished" content="2002-09-01"></dd>
    </dl>
  </article>`;

describe('a one-shot series page with only the album detail', () => {
  const html = `<article class="bdt bdt-dense bdt-page-serie"><section class="bdt-section-head"><h2>Détail des albums de la série</h2></section>
<article class="bdt-edition bdt-edition--detail" id="ed-71270" itemscope itemtype="https://schema.org/Book">
<a name="71270"></a>
<div class="bdt-edition-head"><h3>
<a itemprop="url" href="https://www.bedetheque.com/BD-Tanka-71270.html" title="Voir la fiche album de Tanka"><span itemprop="name"><span class="bdt-numa"></span>Tanka</span></a>
</h3></div></article></article>`;

  it('reads the album from the detail heading', () => {
    expect(parseSeriesAlbums(html)).toEqual([
      { url: 'https://www.bedetheque.com/BD-Tanka-71270.html', number: '', title: 'Tanka', releaseDate: null, kind: 'album' },
    ]);
  });

  it('is picked as the one-shot, with or without volume 1', () => {
    const albums = parseSeriesAlbums(html);
    expect(pickAlbum(albums, null)).toBe(albums[0]);
    expect(pickAlbum(albums, '1')).toBe(albums[0]);
  });
});

describe('a one-shot album page served as its series page', () => {
  it('is read from the album detail', () => {
    const album = parseBedethequeAlbum(ONE_SHOT_ALBUM_PAGE, 'https://www.bedetheque.com/BD-Vitesse-moderne-19759.html');
    expect(album).toMatchObject({
      sourceId: '19759',
      title: 'Vitesse moderne',
      series: 'Vitesse moderne',
      volume: null,
      releaseDate: '2002-09',
      coverUrl: 'https://www.bedetheque.com/cache/thb_couv/vitessemoderne.JPG',
    });
    expect(album.credits).toEqual([
      { firstName: '', lastName: 'Blutch', role: 'writer' },
      { firstName: '', lastName: 'Blutch', role: 'artist' },
      { firstName: '', lastName: 'Ruby', role: 'colorist' },
    ]);
  });
});

describe('pickAlbum', () => {
  const albums = parseSeriesAlbums(SERIES_PAGE);

  it('finds a volume by its number, leading zeros ignored', () => {
    expect(pickAlbum(albums, '2')?.title).toBe('Arctic-Nation');
    expect(pickAlbum(albums, '02')?.title).toBe('Arctic-Nation');
    expect(pickAlbum(albums, '10')?.title).toBe('Dix');
  });

  it('finds the special issues and the omnibuses by their own number', () => {
    expect(pickAlbum(albums, 'hs1')?.kind).toBe('hs');
    expect(pickAlbum(albums, 'INT1')).toBeNull();
    expect(pickAlbum(albums, 'INT01')?.kind).toBe('int');
  });

  it('finds nothing for an unknown volume', () => {
    expect(pickAlbum(albums, '99')).toBeNull();
  });

  it('takes the only album of a one-shot, but not one of many without a volume', () => {
    expect(pickAlbum(albums.slice(0, 1), null)?.number).toBe('1');
    expect(pickAlbum([{ ...albums[0], number: '', kind: 'album' }, albums[3]], '')?.title).toBe(albums[0].title);
    expect(pickAlbum(albums, null)).toBeNull();
  });
});

describe('searchBedetheque', () => {
  /** Answers each of the three pages; the calls are recorded in order. */
  function site(search: unknown = SEARCH_BLACKSAD, series = SERIES_PAGE) {
    const calls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://www.bdgest.com/ajax/tout')) return Response.json(search);
      if (url.startsWith('https://www.bedetheque.com/serie/index/s/')) return new Response(series, { status: 200 });
      return new Response(albumPage(), { status: 200 });
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    return { calls, http };
  }

  it('finds the series, then the volume, then reads that album: three requests', async () => {
    const { calls, http } = site();
    const found = await searchBedetheque({ text: 'blacksad', volume: '2' }, http);
    expect(calls).toEqual([
      'https://www.bdgest.com/ajax/tout?term=blacksad',
      'https://www.bedetheque.com/serie/index/s/500',
      'https://www.bedetheque.com/BD-Blacksad-Tome-2-Arctic-Nation-24600.html',
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].credits.length).toBeGreaterThan(0);
  });

  it('logs the requests and the choices made', async () => {
    const lines: string[] = [];
    setLookupLogSink((line) => lines.push(line));
    const { http } = site();
    await searchBedetheque({ text: 'blacksad', volume: '2' }, http);
    const log = lines.join('\n');
    expect(log).toContain('[lookup:bedetheque] search "blacksad" (volume: 2)');
    expect(log).toContain('GET https://www.bdgest.com/ajax/tout?term=blacksad: 200');
    expect(log).toContain('picked S500');
    expect(log).toMatch(/series S500: \d+ albums; picked "2"/);
  });

  it('logs when no series matches', async () => {
    const lines: string[] = [];
    setLookupLogSink((line) => lines.push(line));
    const { http } = site([]);
    expect(await searchBedetheque({ text: "X-Men (L'Intégrale)", volume: null }, http)).toEqual([]);
    expect(lines.join('\n')).toContain('search box: 0 series [];');
  });

  it('offers the album of each homonymous series', async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://www.bdgest.com/ajax/tout')) {
        return Response.json([
          { id: 'S9070', label: 'Tutti Frutti (Stakhano)', category: 'Série' },
          { id: 'S2542', label: 'Tutti Frutti (Trantkat)', category: 'Série' },
        ]);
      }
      if (url.startsWith('https://www.bedetheque.com/serie/index/s/')) return new Response(SERIES_PAGE, { status: 200 });
      return new Response(albumPage(), { status: 200 });
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    const found = await searchBedetheque({ text: 'Tutti Frutti', volume: '1' }, http);
    expect(calls.filter((url) => url.includes('/serie/index/s/'))).toEqual([
      'https://www.bedetheque.com/serie/index/s/9070',
      'https://www.bedetheque.com/serie/index/s/2542',
    ]);
    expect(found).toHaveLength(2);
  });

  it("asks again with the folded text, accents and curly apostrophe removed, when the typed one finds nothing", async () => {
    const terms: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.bdgest.com') {
        const term = url.searchParams.get('term') ?? '';
        terms.push(term);
        // The box only knows the plain spelling, and answers an empty body for anything else.
        return term === "A Bord De L'Etoile Matutine"
          ? Response.json([{ id: 'S20559', label: "A bord de l'Etoile Matutine", category: 'Série' }])
          : new Response('', { status: 200 });
      }
      if (url.pathname.startsWith('/serie/index/s/')) return new Response(SERIES_PAGE, { status: 200 });
      return new Response(albumPage(), { status: 200 });
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    const found = await searchBedetheque({ text: 'À Bord De L’Étoile Matutine', volume: null }, http);
    expect(terms).toEqual(['À Bord De L’Étoile Matutine', "A Bord De L'Etoile Matutine"]);
    expect(found.length).toBeGreaterThan(0);
  });

  it('falls back to the longest word, matching the series against the whole text', async () => {
    const terms: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.bdgest.com') {
        const term = url.searchParams.get('term') ?? '';
        terms.push(term);
        return term === 'matutine'
          ? Response.json([{ id: 'S20559', label: "A bord de l'Etoile Matutine", category: 'Série' }])
          : new Response('', { status: 200 });
      }
      if (url.pathname.startsWith('/serie/index/s/')) return new Response(SERIES_PAGE, { status: 200 });
      return new Response(albumPage(), { status: 200 });
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    const found = await searchBedetheque({ text: "À bord de l'Étoile Matutine", volume: null }, http);
    expect(terms.at(-1)).toBe('matutine');
    expect(found.length).toBeGreaterThan(0);
  });

  it('counts an empty answer as no series, not as an error', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 200 }));
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    expect(await searchBedetheque({ text: 'À Gauche Toute !', volume: null }, http)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('reports the failure when the site cannot be reached', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    await expect(searchBedetheque({ text: 'À Gauche Toute !', volume: null }, http)).rejects.toThrow();
  });

  it('finds a hyphenated name through its longest token when the whole text finds nothing', async () => {
    const terms: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.bdgest.com') {
        const term = url.searchParams.get('term') ?? '';
        terms.push(term);
        return term === 'Grand-Riviere'
          ? Response.json([
              { id: 'S63189', label: "Rivière à l'envers (La)", category: 'Série' },
              { id: 'S569', label: 'AD Grand-Rivière', category: 'Série' },
            ])
          : new Response('', { status: 200 });
      }
      if (url.pathname.startsWith('/serie/index/s/569')) return new Response(SERIES_PAGE, { status: 200 });
      return new Response(albumPage(), { status: 200 });
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    const found = await searchBedetheque({ text: 'A.D Grand-Rivière', volume: null }, http);
    expect(terms).toEqual(['A.D Grand-Rivière', 'A.D Grand-Riviere', 'AD Grand-Riviere', 'Grand-Riviere']);
    expect(found.length).toBeGreaterThan(0);
  });

  it("never sends a parenthesis to the search box, and finds a series by the site's qualifier", async () => {
    const terms: string[] = [];
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.bdgest.com') {
        const term = url.searchParams.get('term') ?? '';
        terms.push(term);
        return term === 'Ajax'
          ? Response.json([
              { id: 'S1', label: 'Ajax', category: 'Série' },
              { id: 'S569', label: 'Ajax (5e Série)', category: 'Série' },
            ])
          : new Response('', { status: 200 });
      }
      expect(url.pathname).toContain('/serie/index/s/569');
      return new Response(SERIES_PAGE, { status: 200 });
    });
    const http: HttpOptions = { fetch: fetch as typeof globalThis.fetch, userAgent: 'Tankobon/test', timeoutMs: 1000 };
    const found = await searchBedetheque({ text: 'Ajax (5e Série)', volume: null }, http);
    expect(terms).toEqual(['Ajax']);
    expect(found.length).toBeGreaterThan(0);
  });

  it('reads a series page once for several volumes', async () => {
    const { calls, http } = site();
    await searchBedetheque({ text: 'Blacksad', volume: '1' }, http);
    await searchBedetheque({ text: 'Blacksad', volume: '2' }, http);
    expect(calls.filter((url) => url.includes('/serie/index/s/'))).toHaveLength(1);
  });

  it('offers the albums of the series when the volume is not there, without reading any album', async () => {
    const { calls, http } = site();
    const found = await searchBedetheque({ text: 'Blacksad', volume: '99' }, http);
    expect(calls).toHaveLength(2);
    expect(found.map((candidate) => candidate.volume)).toEqual(['1', '2', '10', 'HS', 'HS1', 'INT01']);
    expect(found[0]).toMatchObject({
      source: 'bedetheque',
      sourceId: '15161',
      coverUrl: 'https://www.bedetheque.com/media/Couvertures/Couv_15161.jpg',
      series: 'Blacksad',
      title: 'Quelque part entre les ombres',
      releaseDate: '2000-11',
      credits: [],
    });
  });

  it('offers the albums when no volume is asked and the series has several', async () => {
    const { http } = site();
    expect(await searchBedetheque({ text: 'Blacksad', volume: null }, http)).toHaveLength(6);
  });

  it('finds nothing, and asks only the search box, when no series matches or the text is too short', async () => {
    const { calls, http } = site();
    expect(await searchBedetheque({ text: 'Corto Maltese', volume: null }, http)).toEqual([]);
    expect(await searchBedetheque({ text: 'Di', volume: null }, http)).toEqual([]);
    // The typed text, then its longest word; a text shorter than the box's minimum isn't sent at all.
    expect(calls).toEqual([
      'https://www.bdgest.com/ajax/tout?term=Corto%20Maltese',
      'https://www.bdgest.com/ajax/tout?term=Maltese',
    ]);
  });

  it('does not keep a series page that failed to load', async () => {
    const missing = site();
    const failing: HttpOptions = {
      ...missing.http,
      fetch: (async (input: string | URL | Request) =>
        String(input).includes('/serie/index/s/')
          ? new Response('Not found', { status: 404 })
          : missing.http.fetch(input)) as typeof globalThis.fetch,
    };
    await expect(searchBedetheque({ text: 'blacksad', volume: '1' }, failing)).rejects.toThrow(
      "Bédéthèque : cette page n'existe pas.",
    );
    const working = site();
    expect(await searchBedetheque({ text: 'blacksad', volume: '1' }, working.http)).toHaveLength(1);
    expect(working.calls.filter((url) => url.includes('/serie/index/s/'))).toHaveLength(1);
  });
});

describe('searchBedetheque: a light touch on the site', () => {
  const albumHtml = albumPage();
  function site(calls: string[] = []) {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith('https://www.bdgest.com/ajax/tout')) return Response.json(SEARCH_BLACKSAD);
      if (url.includes('/serie/index/s/')) return new Response(SERIES_PAGE, { status: 200 });
      return new Response(albumHtml, { status: 200 });
    });
    return { calls, fetch };
  }
  const options = (fetch: ReturnType<typeof site>['fetch'], signal?: AbortSignal): HttpOptions => ({
    fetch: fetch as unknown as typeof globalThis.fetch,
    userAgent: 'Tankobon/test',
    timeoutMs: 1000,
    signal,
  });

  it('asks nothing again for the same search within a few minutes', async () => {
    const { calls, fetch } = site();
    await searchBedetheque({ text: 'Blacksad', volume: '1' }, options(fetch));
    await searchBedetheque({ text: ' blacksad ', volume: '1' }, options(fetch));
    expect(calls).toHaveLength(3);
  });

  it('reads the series box and the album pages only once each across volumes', async () => {
    const { calls, fetch } = site();
    await searchBedetheque({ text: 'Blacksad', volume: '1' }, options(fetch));
    await searchBedetheque({ text: 'Blacksad', volume: '2' }, options(fetch));
    expect(calls.filter((url) => url.includes('/ajax/tout'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/serie/index/s/'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/BD-'))).toHaveLength(2);
  });

  it('reads an album page once, whether it was found by a search or picked from the list', async () => {
    const { calls, fetch } = site();
    const [album] = await searchBedetheque({ text: 'Blacksad', volume: '1' }, options(fetch));
    await fetchBedethequeAlbum(album.sourceUrl as string, options(fetch));
    expect(calls.filter((url) => url.includes('/BD-'))).toHaveLength(1);
  });

  it('spaces the requests it sends to the site', async () => {
    resetBedethequeState(60_000);
    const { calls, fetch } = site();
    const controller = new AbortController();
    const search = searchBedetheque({ text: 'Blacksad', volume: '1' }, options(fetch, controller.signal));
    // The first request goes at once; the second waits for its slot, a minute away.
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    controller.abort();
    await expect(search).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('stops without sending anything more when the lookup is aborted', async () => {
    const { calls, fetch } = site();
    const controller = new AbortController();
    controller.abort();
    await expect(searchBedetheque({ text: 'Blacksad', volume: '1' }, options(fetch, controller.signal))).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('does not serve an aborted request to the next search', async () => {
    const { calls, fetch } = site();
    const controller = new AbortController();
    controller.abort();
    await expect(searchBedetheque({ text: 'Blacksad', volume: '1' }, options(fetch, controller.signal))).rejects.toThrow();
    const found = await searchBedetheque({ text: 'Blacksad', volume: '1' }, options(fetch));
    expect(found).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });
});
