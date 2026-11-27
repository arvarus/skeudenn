/**
 * Settings types shared between the main process and the renderer (via preload).
 * @module
 */
import { DEFAULT_ARTICLES, isArticleList } from './articles';
import { isFileNameTemplate, isVolumePrefix } from './file-name-template';
import { isSupportedLanguage, type LanguageSetting } from './i18n';

/** Modes of the library organization (see {@link AppSettings.libraryOrganization}). */
export type LibraryOrganization = 'off' | 'ask' | 'always';

/**
 * A level of the organized folder's tree (see {@link AppSettings.libraryStructure}): one folder per
 * first letter of the next level, per release year, per author, per series or per album (the title).
 */
export type LibraryLevel = 'letter' | 'year' | 'author' | 'series' | 'album';

/** Every {@link LibraryLevel}, in the order the settings page offers them. */
export const LIBRARY_LEVELS: readonly LibraryLevel[] = ['letter', 'year', 'author', 'series', 'album'];

/** Most levels a {@link AppSettings.libraryStructure} may have. */
export const MAX_LIBRARY_LEVELS = 3;

/**
 * Whether `value` is a usable tree for the organized folder: at most {@link MAX_LIBRARY_LEVELS}
 * distinct levels, `letter` and `year` only as the first one, and `letter` followed by another level
 * (it is named after that level's first character). The empty list is the default layout, one
 * subfolder per comic.
 */
export function isLibraryStructure(value: unknown): value is LibraryLevel[] {
  if (!Array.isArray(value) || value.length > MAX_LIBRARY_LEVELS) return false;
  if (!value.every((level) => (LIBRARY_LEVELS as readonly unknown[]).includes(level))) return false;
  if (new Set(value).size !== value.length) return false;
  if (value.slice(1).some((level) => level === 'letter' || level === 'year')) return false;
  return value[0] !== 'letter' || value.length >= 2;
}

/** Every order of the library list (`AppSettings.librarySort`), in the order the toolbar offers them. */
export const LIBRARY_SORTS = [
  'lastOpened',
  'addedDesc',
  'addedAsc',
  'releaseDesc',
  'releaseAsc',
  'titleAsc',
  'titleDesc',
] as const;

/** How the library list is ordered when it isn't grouped by series. */
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/**
 * How much each book row shows, in the library (`AppSettings.libraryView`) and on a reading list's
 * page (`AppSettings.readingListView`) and an author's page (`AppSettings.authorBooksView`): `full` (cover, details, credits, file information, rating,
 * tags), `medium` (cover, title, series and volume, progress, rating) or `compact` (title, volume
 * and series only).
 */
export type BookRowView = 'full' | 'medium' | 'compact';

/**
 * The library's display modes: the {@link BookRowView} rows, or `grid`, covers side by side with the
 * series, title and volume under each. A reading list keeps to rows, so only `AppSettings.libraryView`
 * can be `grid`.
 */
export type LibraryView = BookRowView | 'grid';

/** Every block of the home page, in the order they show by default. */
export const HOME_SECTIONS = ['continueReading', 'recentlyAdded', 'favorites', 'suggestions', 'secondChance'] as const;

/** A block of the home page (`settings:home.sections.<id>` is its label). */
export type HomeSection = (typeof HOME_SECTIONS)[number];

/** The fewest books a home block can be set to show. */
export const HOME_SECTION_MIN_COUNT = 3;

/** The most books a home block can be set to show. */
export const HOME_SECTION_MAX_COUNT = 30;

/** How many books a home block shows until the user sets it. */
export const HOME_SECTION_DEFAULT_COUNT = 5;

/** How a home block lays its books out: one row scrolled with arrows, or lines wrapping to the width. */
export const HOME_SECTION_LAYOUTS = ['row', 'wrap'] as const;

/** A layout of {@link HOME_SECTION_LAYOUTS}. */
export type HomeSectionLayout = (typeof HOME_SECTION_LAYOUTS)[number];

/** The layout of a home block until the user sets it. */
export const HOME_SECTION_DEFAULT_LAYOUT: HomeSectionLayout = 'row';

/**
 * Whether a block is hidden while it has nothing to show, until the user sets it: the blocks that
 * had no empty state before the option existed keep disappearing, the others keep their message.
 */
export const HOME_SECTION_HIDE_WHEN_EMPTY_DEFAULT: Record<HomeSection, boolean> = {
  continueReading: true,
  recentlyAdded: false,
  favorites: true,
  suggestions: false,
  secondChance: false,
};

/**
 * One block of the home page in {@link AppSettings.homeSections}: whether it is shown, at its place in
 * the list. `count` (between {@link HOME_SECTION_MIN_COUNT} and {@link HOME_SECTION_MAX_COUNT}) and
 * `hideWhenEmpty` and `layout` are absent from settings saved before they existed; `resolveHomeSections()` (renderer)
 * fills them in.
 */
export interface HomeSectionSetting {
  id: HomeSection;
  visible: boolean;
  /** How many books the block offers. */
  count?: number;
  /** Hide the block while it has no book, instead of showing an explanatory message. */
  hideWhenEmpty?: boolean;
  /** One scrolled row of covers, or lines wrapping automatically (default `row`). */
  layout?: HomeSectionLayout;
}

/**
 * Whether `value` is a list of distinct, known {@link HomeSection}s with a `visible` flag each, and
 * optionally a whole `count` within the allowed range and a `hideWhenEmpty` flag. It may hold only
 * some of them: `resolveHomeSections()` (renderer) appends the missing ones.
 */
export function isHomeSections(value: unknown): value is HomeSectionSetting[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<unknown>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return false;
    const { id, visible, count, hideWhenEmpty, layout } = item as Record<string, unknown>;
    if (typeof visible !== 'boolean' || !(HOME_SECTIONS as readonly unknown[]).includes(id) || ids.has(id)) return false;
    if (
      count !== undefined &&
      (typeof count !== 'number' || !Number.isInteger(count) || count < HOME_SECTION_MIN_COUNT || count > HOME_SECTION_MAX_COUNT)
    ) {
      return false;
    }
    if (hideWhenEmpty !== undefined && typeof hideWhenEmpty !== 'boolean') return false;
    if (layout !== undefined && !(HOME_SECTION_LAYOUTS as readonly unknown[]).includes(layout)) return false;
    ids.add(id);
  }
  return true;
}

/** Every {@link ThemeSetting}, in the order the settings page offers them. */
export const THEME_SETTINGS = ['system', 'light', 'dark'] as const;

/** Color scheme of the interface: one forced by the user, or `system` to follow the OS. */
export type ThemeSetting = (typeof THEME_SETTINGS)[number];

/**
 * Preferences, persisted key by key (see `SettingsRepository`): per user in the `user_settings` table,
 * except the {@link SHARED_SETTINGS}, which every user shares in the `settings` table.
 */
export interface AppSettings {
  /** Interface language: one forced by the user, or `system` to follow the OS (English when it isn't supported). */
  language: LanguageSetting;
  /** Color scheme of the interface (the reader's background has its own setting, {@link AppSettings.readerBackground}). */
  theme: ThemeSetting;
  /** Page-turn direction: left-to-right (BD/comics) or right-to-left (manga). */
  readingDirection: 'ltr' | 'rtl';
  /**
   * Whether opening a book adds it to the library when it isn't there yet. Off, a book that isn't in
   * the library is read anonymously: nothing is saved, and it reopens from its first page.
   */
  addOpenedBooksToLibrary: boolean;
  /** How the library shows its books: how much each row shows, or a grid of covers (see {@link LibraryView}). */
  libraryView: LibraryView;
  /** How much each row of a reading list's page shows, set apart from the library's (see {@link BookRowView}). */
  readingListView: BookRowView;
  /** How much each row of an author's page shows, set apart from the library's and the lists' (see {@link BookRowView}). */
  authorBooksView: BookRowView;
  /** Whether the library list is grouped by series, each series behind a heading that can be folded. */
  libraryGroupBySeries: boolean;
  /**
   * Order of the library list when it isn't grouped by series: `lastOpened` (most recently opened
   * first), by date added, by release date (books without one last) or by title, each both ways.
   */
  librarySort: LibrarySort;
  /**
   * Whether the home page exists: off, the sidebar has no "Accueil" entry and the app starts on the
   * library.
   */
  homeEnabled: boolean;
  /**
   * The home page's blocks in display order, each shown or hidden. A block missing from the list
   * (added by a later release) is appended, shown; see {@link isHomeSections}.
   */
  homeSections: HomeSectionSetting[];
  /** Whether the sidebar is collapsed to an icon-only rail. */
  sidebarCollapsed: boolean;
  /** Mouse/trackpad wheel direction in the reader: scrolling down advances or retreats a page. */
  scrollDirection: 'standard' | 'inverted';
  /**
   * `single`: one page at a time. `continuous`: pages flow one after another in a vertical scroll.
   * `book`: two pages side by side, like an open book (see {@link AppSettings.bookCoverAlone}).
   */
  readingMode: 'single' | 'continuous' | 'book';
  /**
   * Book mode: whether the first page is a spread of its own (a cover), the pages being paired from
   * the second one. Off, pages are paired from the first one, for files that start with a double page.
   */
  bookCoverAlone: boolean;
  /** Gap in pixels between pages in continuous mode (0 = pages touch). */
  pageSpacing: number;
  /** CSS color behind the pages in the reader (any `<input type="color">` value, i.e. `#rrggbb`). */
  readerBackground: string;
  /** Whether metadata lookups query Comic Vine (only when `comicVineApiKey` is set too). */
  comicVineEnabled: boolean;
  /** Personal Comic Vine API key (free, from comicvine.gamespot.com/api); Comic Vine refuses requests without one. */
  comicVineApiKey: string;
  /** Whether metadata lookups query Google Books. */
  googleBooksEnabled: boolean;
  /** Optional Google Books API key; without one, requests share Google's anonymous quota. */
  googleBooksApiKey: string;
  /**
   * Whether the lookup dialog's Bédéthèque box (search of the series on the site) starts ticked.
   * Bédéthèque has no API, so it is off by default; the box is always offered and can be ticked for one search.
   */
  bedethequeSearchByDefault: boolean;
  /** Whether the library is resynchronized with its folders in the background at every start. */
  resyncOnStartup: boolean;
  /**
   * Whether the app starts on a screen where the user picks who is reading. Personal: it is read for
   * the user the app reopens on (the last active one), and the screen's "don't ask again" box turns
   * it off for that user only.
   */
  askUserOnStartup: boolean;
  /**
   * Whether the statistics page exists: off, the sidebar has no "Statistiques" entry and `/stats`
   * redirects to the library. Reading time is still recorded, so nothing is lost when it comes back.
   */
  statsEnabled: boolean;
  /**
   * Whether the achievements exist: off, the sidebar has no "Accomplissements" entry, `/achievements`
   * redirects to the library and nothing is earned or announced. Those already earned are kept, and
   * the ones justified meanwhile are earned when it is turned back on.
   */
  achievementsEnabled: boolean;
  /** Whether the app asks GitHub at every start if a newer release exists, and offers to download it. */
  checkUpdatesOnStartup: boolean;
  /** Days between two automatic copies of the database (1 to {@link MAX_BACKUP_INTERVAL_DAYS}); 0 turns them off. */
  backupIntervalDays: number;
  /** How many copies of the database are kept (1 to {@link MAX_BACKUP_KEEP}); the oldest ones are deleted. */
  backupKeep: number;
  /** Whether what `.deletedBySkeudenn` holds is deleted for good once it is {@link AppSettings.trashRetentionDays} days old (off by default). */
  trashAutoEmpty: boolean;
  /** Days an item stays in `.deletedBySkeudenn` before the automatic emptying deletes it (1 to {@link MAX_TRASH_RETENTION_DAYS}); only used when `trashAutoEmpty` is on. */
  trashRetentionDays: number;
  /** When the last copy of the database was made (ISO 8601); empty when there has been none. */
  lastBackupAt: string;
  /** When the last resynchronization finished (ISO 8601); empty when there has been none. */
  lastResyncAt: string;
  /**
   * Library organization: `off` leaves the files where they are; otherwise the comics added (a file,
   * a folder, a resynchronization) can be moved into `libraryOrganizationFolder`, laid out as
   * `libraryStructure` says: `ask` offers it after each addition, `always` does it without asking. A comic found
   * directly in that folder is always moved, unless `off`.
   */
  libraryOrganization: LibraryOrganization;
  /**
   * Folder the library organization moves the comics into (empty until one is chosen). Set only by
   * the main process, through a folder dialog (`library:pick-organization-folder`): `settings:set` refuses it.
   */
  libraryOrganizationFolder: string;
  /**
   * Tree of the organized folder, from its first level down (see {@link isLibraryStructure}): for
   * example `['letter', 'series']` puts `Tintin T01.cbz` in `T/Tintin/`. Empty (the default), each comic
   * gets its own subfolder named after the file and its library id. Changing it moves nothing by
   * itself: "Organiser toute la bibliothèque…" moves the comics to their new place.
   */
  libraryStructure: LibraryLevel[];
  /**
   * Name given to the files the organization moves, without the extension: text with `{series}`,
   * `{volume}`, `{title}`, `{year}` and `{author}` fields (see `fillFileNameTemplate()`), for example
   * `{series} - T{volume} - {title}`. Empty (the default), a file keeps its original name. Like
   * `libraryStructure`, changing it renames nothing by itself.
   */
  libraryFileName: string;
  /**
   * Text put in front of the volume in the file name (`T`, `Vol. `, `#`…), so `{volume}` gives `T7`
   * (see {@link isVolumePrefix}). Empty (the default), the volume is written as it is. Like the template,
   * changing it renames nothing by itself.
   */
  libraryVolumePrefix: string;
  /** Whether `libraryVolumePrefix` only goes in front of a whole-number volume (`7`, not `HS` nor `12.1`). */
  libraryVolumePrefixNumericOnly: boolean;
  /**
   * Whether the organization files a name under its first real word: a leading article of
   * `libraryArticles` goes to the end (`Le vent du nord` → `Vent du nord (Le)`) in the series and album
   * folders, the `letter` level and the `{series}` and `{title}` fields of the file name. Like the tree, it
   * moves nothing by itself.
   */
  libraryIgnoreArticles: boolean;
  /** The articles `libraryIgnoreArticles` moves, edited by the user (see {@link isArticleList}). */
  libraryArticles: string[];
  /**
   * Whether a book's cover thumbnail is kept beside it (`<name>.cover.webp`), so a shared library
   * folder carries its covers. Off, the covers are extracted and kept in this machine's local cache
   * only; covers already beside the books are still read.
   */
  librarySidecarCovers: boolean;
  /**
   * Whether a `.nfo` file describing the book is written beside it (when a resynchronization finds
   * none and when a lookup is saved). Off, no `.nfo` is created or replaced; existing ones are still read.
   */
  libraryWriteNfo: boolean;
  /**
   * The templates the user read file names with in the lookup dialog (`parseFileName()`, written like
   * `libraryFileName`), most recent first, at most {@link MAX_FILE_NAME_RULES}: offered again next time.
   */
  fileNameRules: string[];
  /**
   * Whether the file name rule block of the lookup dialog is folded (only its title shows): the choice
   * is kept so the user doesn't fold or unfold it at each lookup.
   */
  lookupRuleCollapsed: boolean;
  /**
   * The duplicate groups the user chose to keep as they are ("Tout garder"), as `duplicateGroupKey()`s:
   * the duplicates search doesn't offer them again unless asked. At most {@link MAX_IGNORED_DUPLICATES}.
   */
  ignoredDuplicates: string[];
  /**
   * State of the "Surveiller ces dossiers" box of the confirmation shown by "Ajouter des dossiers…": whether
   * the folders added are remembered as library folders, walked by every resynchronization. Remembered from
   * one addition to the next, checked by default.
   */
  watchAddedFolders: boolean;
  /** Folder last added with "Ajouter des dossiers…" (or the parent they share; empty before the first addition): where the next folder dialog opens. */
  lastScanFolder: string;
}

/**
 * Value of every setting not stored yet. Merged under the stored values on read, so adding a key
 * needs no database migration.
 */
export const DEFAULT_SETTINGS: AppSettings = {
  language: 'system',
  theme: 'system',
  readingDirection: 'ltr',
  addOpenedBooksToLibrary: true,
  libraryView: 'full',
  readingListView: 'full',
  authorBooksView: 'full',
  libraryGroupBySeries: false,
  librarySort: 'lastOpened',
  homeEnabled: true,
  homeSections: HOME_SECTIONS.map((id) => ({ id, visible: true })),
  sidebarCollapsed: false,
  scrollDirection: 'standard',
  readingMode: 'single',
  bookCoverAlone: true,
  pageSpacing: 16,
  readerBackground: '#000000',
  comicVineEnabled: true,
  comicVineApiKey: '',
  googleBooksEnabled: true,
  googleBooksApiKey: '',
  bedethequeSearchByDefault: false,
  resyncOnStartup: false,
  checkUpdatesOnStartup: true,
  askUserOnStartup: false,
  statsEnabled: true,
  achievementsEnabled: true,
  backupIntervalDays: 0,
  backupKeep: 5,
  trashAutoEmpty: false,
  trashRetentionDays: 30,
  lastBackupAt: '',
  lastResyncAt: '',
  watchAddedFolders: true,
  lastScanFolder: '',
  libraryOrganization: 'off',
  libraryOrganizationFolder: '',
  libraryStructure: [],
  libraryFileName: '',
  libraryVolumePrefix: '',
  libraryVolumePrefixNumericOnly: false,
  libraryIgnoreArticles: false,
  libraryArticles: [...DEFAULT_ARTICLES],
  librarySidecarCovers: true,
  libraryWriteNfo: true,
  fileNameRules: [],
  lookupRuleCollapsed: false,
  ignoredDuplicates: [],
};

/** Longest interval, in days, between two automatic copies of the database. */
export const MAX_BACKUP_INTERVAL_DAYS = 31;
/** Most copies of the database that can be kept. */
export const MAX_BACKUP_KEEP = 50;

/** Longest retention of `.deletedBySkeudenn` the automatic emptying accepts, in days. */
export const MAX_TRASH_RETENTION_DAYS = 45;

/**
 * The settings every user shares: they describe the library (where it lives, how it is laid out,
 * how it is kept up to date) and the app's technical side, which the users' common library depends
 * on. All the others (reading, appearance, language, home, library views, metadata sources and
 * their API keys…) belong to each user.
 */
export const SHARED_SETTINGS: readonly (keyof AppSettings)[] = [
  'checkUpdatesOnStartup',
  'backupIntervalDays',
  'backupKeep',
  'lastBackupAt',
  'libraryOrganization',
  'libraryStructure',
  'libraryFileName',
  'libraryVolumePrefix',
  'libraryVolumePrefixNumericOnly',
  'libraryIgnoreArticles',
  'libraryArticles',
  'librarySidecarCovers',
  'libraryWriteNfo',
];

/** Whether `key` is shared by every user (see {@link SHARED_SETTINGS}) rather than set per user. */
export function isSharedSetting(key: keyof AppSettings): boolean {
  return SHARED_SETTINGS.includes(key);
}

/** A reader background preset; its label is the `settings:appearance.backgrounds.<name>` translation. */
export interface ReaderBackgroundPreset {
  value: string;
  name: 'black' | 'darkGrey' | 'grey' | 'sepia' | 'white';
}

/** Presets offered in the settings page; the color picker accepts anything else. */
export const READER_BACKGROUND_PRESETS: ReaderBackgroundPreset[] = [
  { value: '#000000', name: 'black' },
  { value: '#262626', name: 'darkGrey' },
  { value: '#808080', name: 'grey' },
  { value: '#f4ecd8', name: 'sepia' },
  { value: '#ffffff', name: 'white' },
];

/** Largest `pageSpacing` accepted, in pixels. */
export const MAX_PAGE_SPACING = 1000;

/** One type guard per key of {@link AppSettings}. */
export type SettingValidators = { [K in keyof AppSettings]: (value: unknown) => value is AppSettings[K] };

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
/** How many groups {@link AppSettings.ignoredDuplicates} keeps (the oldest are dropped first). */
export const MAX_IGNORED_DUPLICATES = 2000;
/** How many file name rules {@link AppSettings.fileNameRules} keeps. */
export const MAX_FILE_NAME_RULES = 10;

const isString = (value: unknown): value is string => typeof value === 'string';
/** Longest API key or folder path a setting keeps, in characters: stored and read back on every start. */
export const MAX_SETTING_TEXT = 4096;
const isShortString = (value: unknown): value is string => isString(value) && value.length <= MAX_SETTING_TEXT;
const isBookRowView = (value: unknown): value is BookRowView =>
  value === 'full' || value === 'medium' || value === 'compact';
const isLibraryView = (value: unknown): value is LibraryView => value === 'grid' || isBookRowView(value);

/**
 * One type guard per setting, the single definition of what a stored value may be. The main process
 * checks every `settings:set` call and every imported settings object against it, so neither a
 * compromised renderer nor a hand-edited export can store `readingMode: "webtoon"` or
 * `pageSpacing: -400`. A new setting needs an entry here (the type forces it).
 */
export const SETTING_VALIDATORS: SettingValidators = {
  language: (value): value is LanguageSetting => value === 'system' || (isString(value) && isSupportedLanguage(value)),
  theme: (value): value is ThemeSetting => (THEME_SETTINGS as readonly unknown[]).includes(value),
  readingDirection: (value): value is AppSettings['readingDirection'] => value === 'ltr' || value === 'rtl',
  addOpenedBooksToLibrary: isBoolean,
  libraryView: isLibraryView,
  readingListView: isBookRowView,
  authorBooksView: isBookRowView,
  libraryGroupBySeries: isBoolean,
  librarySort: (value): value is AppSettings['librarySort'] =>
    isString(value) && (LIBRARY_SORTS as readonly string[]).includes(value),
  homeEnabled: isBoolean,
  homeSections: isHomeSections,
  sidebarCollapsed: isBoolean,
  scrollDirection: (value): value is AppSettings['scrollDirection'] => value === 'standard' || value === 'inverted',
  readingMode: (value): value is AppSettings['readingMode'] =>
    value === 'single' || value === 'continuous' || value === 'book',
  bookCoverAlone: isBoolean,
  pageSpacing: (value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_PAGE_SPACING,
  readerBackground: (value): value is string => isString(value) && /^#[0-9a-fA-F]{6}$/.test(value),
  comicVineEnabled: isBoolean,
  comicVineApiKey: isShortString,
  googleBooksEnabled: isBoolean,
  googleBooksApiKey: isShortString,
  bedethequeSearchByDefault: isBoolean,
  resyncOnStartup: isBoolean,
  checkUpdatesOnStartup: isBoolean,
  askUserOnStartup: isBoolean,
  statsEnabled: isBoolean,
  achievementsEnabled: isBoolean,
  backupIntervalDays: (value): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_BACKUP_INTERVAL_DAYS,
  backupKeep: (value): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_BACKUP_KEEP,
  trashAutoEmpty: isBoolean,
  trashRetentionDays: (value): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TRASH_RETENTION_DAYS,
  lastBackupAt: (value): value is string => isString(value) && (value === '' || !Number.isNaN(Date.parse(value))),
  lastResyncAt: (value): value is string => isString(value) && (value === '' || !Number.isNaN(Date.parse(value))),
  watchAddedFolders: isBoolean,
  lastScanFolder: isShortString,
  libraryOrganization: (value): value is LibraryOrganization => value === 'off' || value === 'ask' || value === 'always',
  libraryOrganizationFolder: isShortString,
  libraryStructure: isLibraryStructure,
  libraryFileName: isFileNameTemplate,
  libraryVolumePrefix: isVolumePrefix,
  libraryVolumePrefixNumericOnly: isBoolean,
  libraryIgnoreArticles: isBoolean,
  libraryArticles: isArticleList,
  librarySidecarCovers: isBoolean,
  libraryWriteNfo: isBoolean,
  fileNameRules: (value): value is string[] =>
    Array.isArray(value) && value.length <= MAX_FILE_NAME_RULES && value.every((rule) => isFileNameTemplate(rule) && rule !== ''),
  lookupRuleCollapsed: isBoolean,
  ignoredDuplicates: (value): value is string[] =>
    Array.isArray(value) && value.length <= MAX_IGNORED_DUPLICATES && value.every(isString),
};

/**
 * Settings only the main process writes: `settings:set` refuses them and the JSON import keeps their
 * local value. The organized folder is one, since the app moves files into it: the renderer never
 * names a path (it goes through a folder dialog). So is `lastScanFolder`, which the folder dialog
 * `stat`s: a network path there would make Windows send the user's credentials to that host.
 */
export const MAIN_PROCESS_SETTINGS: readonly (keyof AppSettings)[] = [
  'libraryOrganizationFolder',
  'lastBackupAt',
  'lastScanFolder',
];

/** Whether `key` names a setting of {@link AppSettings}. */
export function isSettingKey(key: unknown): key is keyof AppSettings {
  return typeof key === 'string' && Object.hasOwn(SETTING_VALIDATORS, key);
}

/** Whether `value` is acceptable for the setting `key` (see {@link SETTING_VALIDATORS}). */
export function isValidSetting<K extends keyof AppSettings>(key: K, value: unknown): value is AppSettings[K] {
  return SETTING_VALIDATORS[key](value);
}

/** The settings holding a secret: never sent to the views that don't need them (see {@link PublicSettings}). */
export const API_KEY_SETTINGS = ['comicVineApiKey', 'googleBooksApiKey'] as const;

/** Key of a secret setting. */
export type ApiKeySetting = (typeof API_KEY_SETTINGS)[number];

/** Whether `key` is one of the {@link API_KEY_SETTINGS}. */
export function isApiKeySetting(key: keyof AppSettings): key is ApiKeySetting {
  return (API_KEY_SETTINGS as readonly string[]).includes(key);
}

/** What `settings:get-all` returns: every setting except the API keys. */
export type PublicSettings = Omit<AppSettings, ApiKeySetting>;

/** The API keys, as returned by the dedicated `settings:get-api-keys` channel. */
export type ApiKeys = Pick<AppSettings, ApiKeySetting>;

/** `settings` without its API keys. */
export function toPublicSettings(settings: AppSettings): PublicSettings {
  const publicSettings: Partial<AppSettings> = { ...settings };
  for (const key of API_KEY_SETTINGS) delete publicSettings[key];
  return publicSettings as PublicSettings;
}

/** The API keys of `settings`. */
export function pickApiKeys(settings: AppSettings): ApiKeys {
  return { comicVineApiKey: settings.comicVineApiKey, googleBooksApiKey: settings.googleBooksApiKey };
}
