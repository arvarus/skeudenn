/**
 * The home page's blocks and their settings (pure, no DOM).
 * @module
 */
import {
  HOME_SECTION_DEFAULT_COUNT,
  HOME_SECTION_DEFAULT_LAYOUT,
  HOME_SECTION_HIDE_WHEN_EMPTY_DEFAULT,
  HOME_SECTION_MAX_COUNT,
  HOME_SECTION_MIN_COUNT,
  HOME_SECTIONS,
  type HomeSectionSetting,
} from '@/shared/settings';

import { moveItem } from './reading-list';

/** A {@link HomeSectionSetting} with every option filled in. */
export type ResolvedHomeSection = Required<HomeSectionSetting>;

/** `count` brought to a whole number within the allowed range; the default when it isn't a number. */
export function clampHomeCount(count: number): number {
  if (!Number.isFinite(count)) return HOME_SECTION_DEFAULT_COUNT;
  return Math.min(
    HOME_SECTION_MAX_COUNT,
    Math.max(HOME_SECTION_MIN_COUNT, Math.round(count)),
  );
}

/**
 * The stored blocks completed with the ones it doesn't know yet (a block added by a later release),
 * appended in default order and shown, so the result always holds every block exactly once. Options
 * a stored block doesn't carry (settings saved before they existed) get their default.
 */
export function resolveHomeSections(
  stored: readonly HomeSectionSetting[],
): ResolvedHomeSection[] {
  const known = new Set(stored.map((section) => section.id));
  const all: HomeSectionSetting[] = [
    ...stored,
    ...HOME_SECTIONS.filter((id) => !known.has(id)).map((id) => ({
      id,
      visible: true,
    })),
  ];
  return all.map((section) => ({
    id: section.id,
    visible: section.visible,
    count: clampHomeCount(section.count ?? HOME_SECTION_DEFAULT_COUNT),
    hideWhenEmpty:
      section.hideWhenEmpty ?? HOME_SECTION_HIDE_WHEN_EMPTY_DEFAULT[section.id],
    layout: section.layout ?? HOME_SECTION_DEFAULT_LAYOUT,
  }));
}

/** The blocks to draw, in order, with their options: the resolved list without the hidden ones. */
export function visibleHomeSections(
  stored: readonly HomeSectionSetting[],
): ResolvedHomeSection[] {
  return resolveHomeSections(stored).filter((section) => section.visible);
}

/** The resolved list with the block `id`'s options replaced by `patch` (`count` clamped). */
export function setHomeSectionOptions(
  stored: readonly HomeSectionSetting[],
  id: HomeSectionSetting['id'],
  patch: Partial<Pick<HomeSectionSetting, 'count' | 'hideWhenEmpty' | 'layout'>>,
): ResolvedHomeSection[] {
  return resolveHomeSections(stored).map((section) =>
    section.id === id
      ? {
          ...section,
          ...patch,
          count: clampHomeCount(patch.count ?? section.count),
        }
      : section,
  );
}

/** The resolved list with the block at `index` moved by `delta` places; unchanged at either end. */
export function moveHomeSection(
  stored: readonly HomeSectionSetting[],
  index: number,
  delta: -1 | 1,
): HomeSectionSetting[] {
  const sections = resolveHomeSections(stored);
  return moveItem(sections, index, index + delta) ?? sections;
}

/** The resolved list with the block `id` shown or hidden. */
export function setHomeSectionVisible(
  stored: readonly HomeSectionSetting[],
  id: HomeSectionSetting['id'],
  visible: boolean,
): HomeSectionSetting[] {
  return resolveHomeSections(stored).map((section) =>
    section.id === id ? { ...section, visible } : section,
  );
}
