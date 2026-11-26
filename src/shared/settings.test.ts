import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  MAX_PAGE_SPACING,
  MAX_SETTING_TEXT,
  SETTING_VALIDATORS,
  isLibraryStructure,
  isSettingKey,
  isValidSetting,
  pickApiKeys,
  toPublicSettings,
} from './settings';

describe('SETTING_VALIDATORS', () => {
  it('accepts the default of every setting', () => {
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
      expect(isValidSetting(key, DEFAULT_SETTINGS[key]), key).toBe(true);
    }
  });

  it('refuses values outside a setting’s domain', () => {
    expect(isValidSetting('readingMode', 'webtoon')).toBe(false);
    expect(isValidSetting('readingDirection', 'up')).toBe(false);
    expect(isValidSetting('theme', 'dark')).toBe(true);
    expect(isValidSetting('theme', 'blue')).toBe(false);
    expect(isValidSetting('pageSpacing', -400)).toBe(false);
    expect(isValidSetting('pageSpacing', MAX_PAGE_SPACING + 1)).toBe(false);
    expect(isValidSetting('pageSpacing', Number.NaN)).toBe(false);
    expect(isValidSetting('readerBackground', 'red')).toBe(false);
    expect(isValidSetting('language', 'klingon')).toBe(false);
    expect(isValidSetting('sidebarCollapsed', 'yes')).toBe(false);
    expect(isValidSetting('libraryView', 'tiles')).toBe(false);
    expect(isValidSetting('readingListView', 'grid')).toBe(false);
    expect(isValidSetting('authorBooksView', 'grid')).toBe(false);
    expect(isValidSetting('librarySort', 'random')).toBe(false);
    expect(isValidSetting('comicVineApiKey', null)).toBe(false);
  });

  it('refuses a key or a folder path of absurd length', () => {
    const huge = 'x'.repeat(MAX_SETTING_TEXT + 1);
    for (const key of ['comicVineApiKey', 'googleBooksApiKey', 'lastScanFolder', 'libraryOrganizationFolder'] as const) {
      expect(isValidSetting(key, huge)).toBe(false);
      expect(isValidSetting(key, 'x'.repeat(MAX_SETTING_TEXT))).toBe(true);
    }
  });

  it('accepts in-range values', () => {
    expect(isValidSetting('readingMode', 'continuous')).toBe(true);
    expect(isValidSetting('libraryView', 'compact')).toBe(true);
    expect(isValidSetting('libraryView', 'grid')).toBe(true);
    expect(isValidSetting('readingListView', 'medium')).toBe(true);
    expect(isValidSetting('authorBooksView', 'compact')).toBe(true);
    expect(isValidSetting('librarySort', 'releaseAsc')).toBe(true);
    expect(isValidSetting('pageSpacing', 0)).toBe(true);
    expect(isValidSetting('readerBackground', '#F4ECD8')).toBe(true);
    expect(isValidSetting('language', 'fr')).toBe(true);
    expect(isValidSetting('language', 'system')).toBe(true);
  });

  it('has one validator per setting', () => {
    expect(Object.keys(SETTING_VALIDATORS).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });
});

describe('isLibraryStructure', () => {
  it('accepts up to three distinct levels', () => {
    expect(isLibraryStructure([])).toBe(true);
    expect(isLibraryStructure(['series'])).toBe(true);
    expect(isLibraryStructure(['letter', 'author', 'series'])).toBe(true);
    expect(isLibraryStructure(['year', 'series', 'album'])).toBe(true);
  });

  it('refuses too many levels, duplicates and unknown levels', () => {
    expect(isLibraryStructure(['author', 'series', 'album', 'year'])).toBe(false);
    expect(isLibraryStructure(['series', 'series'])).toBe(false);
    expect(isLibraryStructure(['publisher'])).toBe(false);
    expect(isLibraryStructure('series')).toBe(false);
  });

  it('keeps letter and year first, and letter followed by another level', () => {
    expect(isLibraryStructure(['series', 'letter'])).toBe(false);
    expect(isLibraryStructure(['author', 'year'])).toBe(false);
    expect(isLibraryStructure(['letter', 'year'])).toBe(false);
    expect(isLibraryStructure(['letter'])).toBe(false);
    expect(isLibraryStructure(['year'])).toBe(true);
  });
});

describe('isSettingKey', () => {
  it('only accepts own setting names', () => {
    expect(isSettingKey('pageSpacing')).toBe(true);
    expect(isSettingKey('nope')).toBe(false);
    expect(isSettingKey('toString')).toBe(false);
    expect(isSettingKey('__proto__')).toBe(false);
    expect(isSettingKey(42)).toBe(false);
  });
});

describe('API keys', () => {
  const settings = { ...DEFAULT_SETTINGS, comicVineApiKey: 'secret', googleBooksApiKey: 'other' };

  it('are left out of the public settings', () => {
    const publicSettings = toPublicSettings(settings);
    expect(publicSettings).not.toHaveProperty('comicVineApiKey');
    expect(publicSettings).not.toHaveProperty('googleBooksApiKey');
    expect(publicSettings.readingMode).toBe('single');
  });

  it('are returned on their own by pickApiKeys', () => {
    expect(pickApiKeys(settings)).toEqual({ comicVineApiKey: 'secret', googleBooksApiKey: 'other' });
  });
});
