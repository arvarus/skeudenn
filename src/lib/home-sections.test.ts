import { describe, expect, it } from 'vitest';

import {
  HOME_SECTION_DEFAULT_COUNT,
  HOME_SECTION_DEFAULT_LAYOUT,
  HOME_SECTION_HIDE_WHEN_EMPTY_DEFAULT,
  HOME_SECTIONS,
  isHomeSections,
  type HomeSectionSetting,
} from '@/shared/settings';

import {
  clampHomeCount,
  moveHomeSection,
  setHomeSectionOptions,
  resolveHomeSections,
  setHomeSectionVisible,
  visibleHomeSections,
} from './home-sections';

const all = HOME_SECTIONS.map((id) => ({
  id,
  visible: true,
  count: HOME_SECTION_DEFAULT_COUNT,
  hideWhenEmpty: HOME_SECTION_HIDE_WHEN_EMPTY_DEFAULT[id],
  layout: HOME_SECTION_DEFAULT_LAYOUT,
}));
const ids = (sections: readonly HomeSectionSetting[]) =>
  sections.map((section) => section.id);

describe('home sections', () => {
  it('appends the blocks missing from the stored list, shown, in default order', () => {
    expect(resolveHomeSections([])).toEqual(all);
    const resolved = resolveHomeSections([
      { id: 'secondChance', visible: false },
    ]);
    expect(ids(resolved)).toEqual([
      'secondChance',
      ...HOME_SECTIONS.filter((id) => id !== 'secondChance'),
    ]);
    expect(resolved[0].visible).toBe(false);
  });

  it('lists only the visible blocks', () => {
    expect(visibleHomeSections([]).map((section) => section.id)).toEqual([
      ...HOME_SECTIONS,
    ]);
    expect(
      visibleHomeSections([{ id: 'favorites', visible: false }]),
    ).not.toContainEqual(expect.objectContaining({ id: 'favorites' }));
  });

  it('shows or hides a block', () => {
    const hidden = setHomeSectionVisible([], 'favorites', false);
    expect(hidden.find((section) => section.id === 'favorites')?.visible).toBe(
      false,
    );
    expect(hidden.filter((section) => section.visible)).toHaveLength(
      HOME_SECTIONS.length - 1,
    );
  });

  it('moves a block by one place and leaves the list alone past either end', () => {
    expect(ids(moveHomeSection([], 0, 1)).slice(0, 2)).toEqual([
      HOME_SECTIONS[1],
      HOME_SECTIONS[0],
    ]);
    expect(moveHomeSection([], 0, -1)).toEqual(all);
    expect(moveHomeSection([], HOME_SECTIONS.length - 1, 1)).toEqual(all);
  });

  it('fills the options a stored block lacks and keeps the ones it has', () => {
    const [first] = resolveHomeSections([
      { id: 'favorites', visible: true, count: 12, hideWhenEmpty: false },
    ]);
    expect(first).toMatchObject({ count: 12, hideWhenEmpty: false });
    const [old] = resolveHomeSections([{ id: 'favorites', visible: true }]);
    expect(old).toMatchObject({
      count: HOME_SECTION_DEFAULT_COUNT,
      hideWhenEmpty: true,
      layout: 'row',
    });
    const [wrapped] = resolveHomeSections([
      { id: 'favorites', visible: true, layout: 'wrap' },
    ]);
    expect(wrapped.layout).toBe('wrap');
  });

  it('clamps the count between 3 and 30', () => {
    expect(clampHomeCount(1)).toBe(3);
    expect(clampHomeCount(99)).toBe(30);
    expect(clampHomeCount(7.6)).toBe(8);
    expect(clampHomeCount(Number.NaN)).toBe(HOME_SECTION_DEFAULT_COUNT);
  });

  it("sets one block's options without touching the others", () => {
    const next = setHomeSectionOptions([], 'suggestions', {
      count: 50,
      hideWhenEmpty: true,
    });
    expect(next.find((s) => s.id === 'suggestions')).toMatchObject({
      count: 30,
      hideWhenEmpty: true,
    });
    expect(next.filter((s) => s.id !== 'suggestions')).toEqual(
      all.filter((s) => s.id !== 'suggestions'),
    );
  });

  it('validates the stored list', () => {
    expect(isHomeSections([])).toBe(true);
    expect(isHomeSections(all)).toBe(true);
    expect(isHomeSections([{ id: 'nope', visible: true }])).toBe(false);
    expect(isHomeSections([{ id: 'favorites', visible: 1 }])).toBe(false);
    expect(
      isHomeSections([
        { id: 'favorites', visible: true },
        { id: 'favorites', visible: false },
      ]),
    ).toBe(false);
    expect(isHomeSections('favorites')).toBe(false);
    expect(
      isHomeSections([{ id: 'favorites', visible: true, layout: 'wrap' }]),
    ).toBe(true);
    expect(
      isHomeSections([{ id: 'favorites', visible: true, layout: 'grid' }]),
    ).toBe(false);
    expect(
      isHomeSections([
        { id: 'favorites', visible: true, count: 3, hideWhenEmpty: true },
      ]),
    ).toBe(true);
    for (const count of [2, 31, 5.5, '5']) {
      expect(isHomeSections([{ id: 'favorites', visible: true, count }])).toBe(
        false,
      );
    }
    expect(
      isHomeSections([{ id: 'favorites', visible: true, hideWhenEmpty: 1 }]),
    ).toBe(false);
  });
});
