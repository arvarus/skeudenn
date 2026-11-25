/**
 * The renderer's single copy of the data the main process owns: library, reading lists and
 * settings (pure, no DOM, so it is unit-tested). Views read it through hooks
 * (`useSyncExternalStore`) and never fetch these themselves; the main process's `data:changed`
 * push keeps it current, whoever made the write.
 * @module
 */
import type { UnlockedAchievement } from '@/shared/achievements';
import type { DataChange, LibraryChange } from '@/shared/data-changes';
import type { LibraryEntry } from '@/shared/library';
import type { ReadingList } from '@/shared/reading-list';
import { DEFAULT_SETTINGS, toPublicSettings, type PublicSettings } from '@/shared/settings';
import type { UsersState } from '@/shared/users';

/** The slices of the store, each with its own subscribers: a progress update doesn't wake the settings' readers. */
export type DataSlice = 'library' | 'readingLists' | 'settings' | 'achievements' | 'users';

/** The part of `window.tankobon` the store reads from; a fake in tests. */
export interface DataSource {
  /** The library. */
  library: {
    /** Every entry, most recently opened first. */
    list(): Promise<LibraryEntry[]>;
  };
  /** The reading lists. */
  readingLists: {
    /** Every list, in the user's order. */
    list(): Promise<ReadingList[]>;
  };
  /** The achievements earned. */
  achievements: {
    /** Every achievement earned, the earliest first. */
    list(): Promise<UnlockedAchievement[]>;
  };
  /** The settings. */
  settings: {
    /** Every setting. */
    getAll(): Promise<PublicSettings>;
  };
  /** The users of the app. */
  users: {
    /** Every user and the active one's id. */
    list(): Promise<UsersState>;
  };
  /** The main process's change notifications. */
  data: {
    /** Subscribes to `data:changed`; returns the unsubscribe function. */
    onChanged(listener: (change: DataChange) => void): () => void;
  };
}

/**
 * Applies a {@link LibraryChange} that names entries to the library, keeping it ordered by
 * `lastOpenedAt`, most recent first, like `library:list`. An entry already there is replaced in
 * place unless its `lastOpenedAt` changed (the book was just opened), in which case it moves to
 * where that date puts it; a new one goes where its date puts it too. Returns `entries` itself
 * when nothing changed.
 */
export function applyLibraryChange(entries: LibraryEntry[], change: LibraryChange): LibraryEntry[] {
  let result = entries;
  if (change.removed?.length) {
    const removed = new Set(change.removed);
    result = result.filter((entry) => !removed.has(entry.id));
  }
  for (const entry of change.upserted ?? []) {
    const index = result.findIndex((existing) => existing.id === entry.id);
    if (index !== -1 && result[index].lastOpenedAt === entry.lastOpenedAt) {
      result = result === entries ? [...result] : result;
      result[index] = entry;
      continue;
    }
    const without = index === -1 ? result : result.filter((_, i) => i !== index);
    // ISO timestamps sort as text.
    const at = without.findIndex((existing) => existing.lastOpenedAt <= entry.lastOpenedAt);
    result = [...without.slice(0, at === -1 ? without.length : at), entry, ...without.slice(at === -1 ? without.length : at)];
  }
  return result;
}

/** A `library:list` under way (see `DataStore.libraryLoad`). */
interface LibraryLoad {
  /** The user epoch it was asked in. */
  epoch: number;
  /** The targeted changes received since it was asked, in arrival order. */
  buffer: LibraryChange[];
  /** An untargeted change or another reload was asked meanwhile: the answer is dropped and the list asked again. */
  stale: boolean;
  /** Settles once the library is loaded (or the load is dropped or failed). */
  done: Promise<void>;
}

/**
 * Holds the data and notifies subscribers per slice. `null` library or reading lists mean "not
 * loaded yet"; the settings are {@link DEFAULT_SETTINGS} until loaded (see {@link DataStore.ready}).
 */
export class DataStore {
  private library: LibraryEntry[] | null = null;
  private readingLists: ReadingList[] | null = null;
  private achievements: UnlockedAchievement[] | null = null;
  private users: UsersState | null = null;
  private settings: PublicSettings = toPublicSettings(DEFAULT_SETTINGS);
  private readonly listeners: Record<DataSlice, Set<() => void>> = {
    library: new Set(),
    readingLists: new Set(),
    settings: new Set(),
    achievements: new Set(),
    users: new Set(),
  };
  /**
   * Writes this renderer made that the main process hasn't answered yet, by key (`entry:<id>`,
   * `setting:<key>`). The `data:changed` echo of such a write is ignored: it carries the value as
   * of the write, which a later optimistic change (a slider being dragged, stars clicked in a
   * row) has already replaced.
   */
  private readonly pending = new Map<string, number>();
  private started = false;
  /** Counts the switches of user: an answer that was requested before one belongs to the previous user and is dropped. */
  private epoch = 0;
  /**
   * The `library:list` under way, if any. Its answer is a snapshot of the moment the main process served it,
   * which can predate a change whose event reached the renderer before the answer: the targeted changes
   * received meanwhile are kept in `buffer`, in arrival order, and replayed on the snapshot. Replaying one the
   * snapshot already holds is harmless, since each carries the whole entries as of its write and the later
   * ones follow. `stale` is set by an untargeted change (or another reload request) meanwhile: the snapshot
   * is then dropped and the list asked again.
   */
  private libraryLoad: LibraryLoad | null = null;

  constructor(private readonly source: DataSource) {}

  /** Resolves once the settings are loaded, so the first render can already use the language. */
  ready: Promise<void> = Promise.resolve();

  /** Loads everything and starts listening to `data:changed`. Calling it again does nothing. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.source.data.onChanged((change) => this.apply(change));
    this.ready = this.reloadSettings().catch(() => undefined);
    void this.reloadLibrary();
    void this.reloadReadingLists();
    void this.reloadAchievements();
    void this.reloadUsers();
  }

  /** The library, most recently opened first; `null` until loaded. The array is replaced, never mutated. */
  getLibrary = (): LibraryEntry[] | null => this.library;
  /** The reading lists in the user's order; `null` until loaded. */
  getReadingLists = (): ReadingList[] | null => this.readingLists;
  /** The achievements earned, the earliest first; `null` until loaded. */
  getAchievements = (): UnlockedAchievement[] | null => this.achievements;
  /** The settings. */
  getSettings = (): PublicSettings => this.settings;
  /** The users and the active one; `null` until loaded. */
  getUsers = (): UsersState | null => this.users;

  /** Calls `listener` after each change of `slice`; returns the unsubscribe function. */
  subscribe(slice: DataSlice, listener: () => void): () => void {
    this.listeners[slice].add(listener);
    return () => this.listeners[slice].delete(listener);
  }

  private emit(slice: DataSlice): void {
    for (const listener of [...this.listeners[slice]]) listener();
  }

  /**
   * Fetches the whole library again. A call while a load is under way doesn't start another one: it marks
   * that load stale (it asks the list again once answered) and resolves with it.
   */
  reloadLibrary(): Promise<void> {
    if (this.libraryLoad) {
      this.libraryLoad.stale = true;
      return this.libraryLoad.done;
    }
    const load: LibraryLoad = { epoch: this.epoch, buffer: [], stale: false, done: Promise.resolve() };
    this.libraryLoad = load;
    load.done = this.runLibraryLoad(load);
    return load.done;
  }

  private async runLibraryLoad(load: LibraryLoad): Promise<void> {
    try {
      for (;;) {
        load.stale = false;
        load.buffer = [];
        const loaded = await this.source.library.list();
        if (load.epoch !== this.epoch) return;
        // An untargeted change (a scan, an import) arrived while the list was on its way: it may not hold it.
        if (load.stale) continue;
        this.library = load.buffer.reduce(applyLibraryChange, loaded);
        this.emit('library');
        return;
      }
    } finally {
      if (this.libraryLoad === load) this.libraryLoad = null;
    }
  }

  /** Fetches the reading lists again. */
  async reloadReadingLists(): Promise<void> {
    const epoch = this.epoch;
    const loaded = await this.source.readingLists.list();
    if (epoch !== this.epoch) return;
    this.readingLists = loaded;
    this.emit('readingLists');
  }

  /** Fetches the earned achievements again. */
  async reloadAchievements(): Promise<void> {
    const epoch = this.epoch;
    const loaded = await this.source.achievements.list();
    if (epoch !== this.epoch) return;
    this.achievements = loaded;
    this.emit('achievements');
  }

  /**
   * Fetches the users again. When the active user is not the one the store holds the data of, that
   * data (library progress, lists, achievements, settings) is dropped at once, so no view shows or
   * counts another user's, and loaded again.
   */
  async reloadUsers(): Promise<void> {
    const state = await this.source.users.list();
    const switched = this.users !== null && this.users.activeId !== state.activeId;
    this.users = state;
    if (switched) {
      this.epoch += 1;
      // A load under way is the previous user's: its answer and the changes it set aside are dropped.
      this.libraryLoad = null;
      this.library = null;
      this.readingLists = null;
      this.achievements = null;
      this.emit('library');
      this.emit('readingLists');
      this.emit('achievements');
      void this.reloadLibrary();
      void this.reloadReadingLists();
      void this.reloadAchievements();
      await this.reloadSettings().catch(() => undefined);
    }
    this.emit('users');
  }

  /** Fetches the settings again. */
  async reloadSettings(): Promise<void> {
    const epoch = this.epoch;
    const loaded = await this.source.settings.getAll();
    if (epoch !== this.epoch) return;
    this.settings = loaded;
    this.emit('settings');
  }

  /** Applies a `data:changed` event from the main process. */
  apply(change: DataChange): void {
    switch (change.scope) {
      case 'library': {
        if (!change.upserted && !change.removed) {
          void this.reloadLibrary();
          return;
        }
        // The echo of a write still pending is dropped now, not when replayed: the optimistic value wins.
        const upserted = change.upserted?.filter((entry) => !this.pending.has(`entry:${entry.id}`));
        const targeted: LibraryChange = { ...change, upserted };
        // A load under way replays it on its snapshot, which may predate it.
        this.libraryLoad?.buffer.push(targeted);
        if (!this.library) return; // The load under way brings the final state.
        this.library = applyLibraryChange(this.library, targeted);
        this.emit('library');
        return;
      }
      case 'readingLists':
        void this.reloadReadingLists();
        return;
      case 'users':
        void this.reloadUsers();
        return;
      case 'achievements': {
        if (!this.achievements) return; // The first load will bring the final state.
        const known = new Set(this.achievements.map((achievement) => achievement.id));
        const added = change.unlocked.filter((achievement) => !known.has(achievement.id));
        if (added.length === 0) return;
        this.achievements = [...this.achievements, ...added];
        this.emit('achievements');
        return;
      }
      case 'settings': {
        if (!change.values) {
          void this.reloadSettings();
          return;
        }
        const values = Object.fromEntries(
          Object.entries(change.values).filter(([key]) => !this.pending.has(`setting:${key}`)),
        );
        if (Object.keys(values).length === 0) return;
        this.settings = { ...this.settings, ...values };
        this.emit('settings');
        return;
      }
    }
  }

  /** Runs `write` with `key` marked pending (see `pending`), whatever its outcome. */
  private async guarded<T>(key: string, write: () => Promise<T>): Promise<T> {
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
    try {
      return await write();
    } finally {
      const left = (this.pending.get(key) ?? 1) - 1;
      if (left > 0) this.pending.set(key, left);
      else this.pending.delete(key);
    }
  }

  /**
   * Shows `patch` on an entry at once, then runs `persist`; the main process's echo confirms it. If
   * `persist` rejects, the library is reloaded (the optimistic value is dropped) and the error rethrown.
   */
  async patchEntry(id: string, patch: Partial<LibraryEntry>, persist: () => Promise<unknown>): Promise<void> {
    if (this.library) {
      this.library = this.library.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry));
      this.emit('library');
    }
    try {
      await this.guarded(`entry:${id}`, persist);
    } catch (error) {
      // Refused or failed: the store must show what the database holds, not the value that never made it there.
      await this.reloadLibrary().catch(() => undefined);
      throw error;
    }
  }

  /** Replaces an entry with a newer state of itself, e.g. what a metadata dialog just saved. */
  upsertEntry(entry: LibraryEntry): void {
    this.apply({ scope: 'library', upserted: [entry] });
  }

  /** Shows a setting's new value at once, then runs `persist`; if it rejects, the settings are reloaded and the error rethrown. */
  async updateSetting<K extends keyof PublicSettings>(
    key: K,
    value: PublicSettings[K],
    persist: () => Promise<unknown>,
  ): Promise<void> {
    this.settings = { ...this.settings, [key]: value };
    this.emit('settings');
    try {
      await this.guarded(`setting:${key}`, persist);
    } catch (error) {
      await this.reloadSettings().catch(() => undefined);
      throw error;
    }
  }
}
