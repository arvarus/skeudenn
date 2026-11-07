/**
 * Persistence of the comic library (the `library` table).
 * @module
 */
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  READ_TAG,
  type Credit,
  type CreditInput,
  type CreditRole,
  type LibraryEntry,
  type MetadataUpdate,
} from '../../shared/library';
import { DEFAULT_USER_ID } from '../../shared/users';
import { PeopleRepository } from './people-repository';
import { IDENTITY_PATHS, type PathCodec } from './path-roots';
import { withTransaction } from './transaction';

interface LibraryRow {
  id: string;
  path: string;
  title: string;
  page_count: number;
  current_page: number;
  added_at: string;
  last_opened_at: string;
  file_count: number;
  file_size: number;
  rating: number;
  tags: string;
  title_locked: number;
  series: string | null;
  volume: string | null;
  release_date: string | null;
  language: string | null;
  avg_page_width: number | null;
  avg_page_height: number | null;
}

interface UserBookRow {
  user_id: string;
  current_page: number;
  rating: number;
  tags: string;
  finished_at: string | null;
  last_opened_at: string;
}

interface CreditRow {
  library_id: string;
  person_id: string;
  first_name: string;
  last_name: string;
  role: string;
}

function fromRow(row: LibraryRow, credits: Credit[], filePath: string): LibraryEntry {
  return {
    id: row.id,
    path: filePath,
    title: row.title,
    pageCount: row.page_count,
    currentPage: row.current_page,
    addedAt: row.added_at,
    lastOpenedAt: row.last_opened_at,
    fileCount: row.file_count,
    fileSize: row.file_size,
    rating: row.rating,
    tags: JSON.parse(row.tags) as string[],
    titleLocked: row.title_locked !== 0,
    series: row.series,
    volume: row.volume,
    releaseDate: row.release_date,
    language: row.language,
    avgPageWidth: row.avg_page_width,
    avgPageHeight: row.avg_page_height,
    credits,
  };
}

function creditFromRow(row: CreditRow): Credit {
  return { personId: row.person_id, firstName: row.first_name, lastName: row.last_name, role: row.role as CreditRole };
}

/**
 * The columns of an entry as one user sees it: the library's own, plus that user's progress, rating,
 * tags and last opening (`user_books`; a book they never touched has none: unrated, untagged,
 * page 0, "last opened" when it was added). The one `?` is the user's id.
 */
const ENTRY_SELECT = `
  SELECT l.id, l.path, l.title, l.page_count, l.added_at, l.file_count, l.file_size, l.title_locked,
         l.series, l.volume, l.release_date, l.language, l.avg_page_width, l.avg_page_height,
         MIN(COALESCE(ub.current_page, 0), MAX(l.page_count - 1, 0)) AS current_page,
         COALESCE(ub.rating, 0) AS rating,
         COALESCE(ub.tags, '[]') AS tags,
         COALESCE(ub.last_opened_at, l.added_at) AS last_opened_at
  FROM library l
  LEFT JOIN user_books ub ON ub.library_id = l.id AND ub.user_id = ?`;

const CREDITS_QUERY = `
  SELECT c.library_id, c.person_id, p.first_name, p.last_name, c.role
  FROM credits c JOIN people p ON p.id = c.person_id`;

/** Persists the comic library (one row per known file) to the local database, as the active user sees it. */
export class LibraryRepository {
  private readonly people: PeopleRepository;

  /**
   * `userId` says whose rating, tags and progress the reads and writes are about (the active user, in
   * the app); the books and their metadata are the library's, common to everyone. `paths` converts
   * between the paths the database stores (relative to a library folder, see `PathRoots`) and the
   * absolute ones everything else works with: no method takes or returns a stored path.
   */
  constructor(
    private readonly db: DatabaseSync,
    private readonly userId: () => string = () => DEFAULT_USER_ID,
    private readonly paths: PathCodec = IDENTITY_PATHS,
  ) {
    this.people = new PeopleRepository(db);
  }

  /** Gives the active user a `user_books` row for the book, unless they have one; false when the book isn't in the library. */
  private ensureUserBook(id: string): boolean {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO user_books (user_id, library_id, last_opened_at)
         SELECT ?, id, added_at FROM library WHERE id = ?`,
      )
      .run(this.userId(), id);
    return this.hasId(id);
  }

  private hasId(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM library WHERE id = ?').get(id) !== undefined;
  }

  /** Every entry, most recently opened first. */
  list(): LibraryEntry[] {
    const rows = this.db
      .prepare(`${ENTRY_SELECT} ORDER BY last_opened_at DESC`)
      .all(this.userId()) as unknown as LibraryRow[];
    const credits = new Map<string, Credit[]>();
    const creditRows = this.db
      .prepare(`${CREDITS_QUERY} ORDER BY c.library_id, c.position`)
      .all() as unknown as CreditRow[];
    for (const row of creditRows) {
      const list = credits.get(row.library_id) ?? [];
      list.push(creditFromRow(row));
      credits.set(row.library_id, list);
    }
    return rows.map((row) => fromRow(row, credits.get(row.id) ?? [], this.paths.decode(row.path)));
  }

  /** One entry by id, or null if it isn't (or no longer) in the library. */
  get(id: string): LibraryEntry | null {
    const row = this.db.prepare(`${ENTRY_SELECT} WHERE l.id = ?`).get(this.userId(), id) as LibraryRow | undefined;
    return row ? fromRow(row, this.creditsOf(id), this.paths.decode(row.path)) : null;
  }

  private creditsOf(id: string): Credit[] {
    const rows = this.db
      .prepare(`${CREDITS_QUERY} WHERE c.library_id = ? ORDER BY c.position`)
      .all(id) as unknown as CreditRow[];
    return rows.map(creditFromRow);
  }

  /**
   * Registers a comic as just opened: creates it on first open, else refreshes its metadata.
   * Never touches `rating`/`tags` nor the looked-up metadata (series, credits…), which are only
   * ever set by the user, and keeps a locked title instead of the file-name-derived `title`.
   */
  touch(filePath: string, title: string, pageCount: number, fileCount: number, fileSize: number): LibraryEntry {
    return withTransaction(this.db, () => {
      const now = new Date().toISOString();
      const existing = this.db.prepare('SELECT id, title, title_locked FROM library WHERE path = ?').get(this.paths.encode(filePath)) as
        | { id: string; title: string; title_locked: number }
        | undefined;
      let id: string;

      if (existing) {
        id = existing.id;
        const newTitle = existing.title_locked !== 0 ? existing.title : title;
        this.db
          .prepare('UPDATE library SET title = ?, page_count = ?, file_count = ?, file_size = ? WHERE id = ?')
          .run(newTitle, pageCount, fileCount, fileSize, id);
      } else {
        id = randomUUID();
        // The personal columns of `library` are no longer read (see migration 7): they keep their defaults.
        this.db
          .prepare(
            `INSERT INTO library (id, path, title, page_count, added_at, last_opened_at, file_count, file_size)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, this.paths.encode(filePath), title, pageCount, now, now, fileCount, fileSize);
      }
      // The opening is the active user's: it bumps their last opening and clamps their page if the page count shrank.
      this.ensureUserBook(id);
      this.db
        .prepare(
          `UPDATE user_books SET last_opened_at = ?, current_page = MIN(current_page, MAX(? - 1, 0))
           WHERE user_id = ? AND library_id = ?`,
        )
        .run(now, pageCount, this.userId(), id);
      return this.get(id) as LibraryEntry;
    });
  }

  /** Whether a file is already in the library, so a folder scan can skip it without opening it. */
  hasPath(filePath: string): boolean {
    return this.db.prepare('SELECT 1 FROM library WHERE path = ?').get(this.paths.encode(filePath)) !== undefined;
  }

  /** The entries whose stored path isn't the one `encode()` gives for their file. */
  private misplacedRows(): { id: string; path: string; canonical: string; added_at: string }[] {
    const rows = this.db.prepare('SELECT id, path, added_at FROM library').all() as unknown as {
      id: string;
      path: string;
      added_at: string;
    }[];
    return rows
      .map((row) => ({ ...row, canonical: this.paths.encode(this.paths.decode(row.path)) }))
      .filter((row) => row.canonical !== row.path);
  }

  /** Whether {@link adoptRoots} would merge entries, which is worth a copy of the database first. */
  hasEntriesToMerge(): boolean {
    const taken = this.db.prepare('SELECT 1 FROM library WHERE path = ?');
    const targets = new Set<string>();
    return this.misplacedRows().some((row) => {
      if (targets.has(row.canonical) || taken.get(row.canonical) !== undefined) return true;
      targets.add(row.canonical);
      return false;
    });
  }

  /**
   * Gives every entry the stored path of its file, after a folder was added or found again on this
   * machine: the paths of a database from before the roots, or of books added on their own, become
   * relative; a book stored under another folder at the same place, or under a parent of a newer folder,
   * moves to the right one. Nothing moves on disk. Two entries that turn out to be the same file are merged
   * into the older one (see `mergeEntries()`). Returns how many entries changed.
   */
  adoptRoots(): number {
    return withTransaction(this.db, () => {
      const find = this.db.prepare('SELECT id, added_at FROM library WHERE path = ?');
      const update = this.db.prepare('UPDATE library SET path = ? WHERE id = ?');
      const rows = this.misplacedRows();
      for (const row of rows) {
        const other = find.get(row.canonical) as { id: string; added_at: string } | undefined;
        if (other === undefined) {
          update.run(row.canonical, row.id);
        } else if (row.added_at <= other.added_at) {
          this.mergeEntries(row.id, other.id);
          update.run(row.canonical, row.id);
        } else {
          this.mergeEntries(other.id, row.id);
        }
      }
      return rows.length;
    });
  }

  /**
   * Folds entry `drop` into entry `keep`, both being the same file. `keep`'s values win; what it lacks
   * comes from `drop` (metadata, credits, a title the user locked), and nothing personal is lost: every
   * user's progress, rating, tags and dates are combined, the reading sessions and places in the lists move.
   */
  private mergeEntries(keep: string, drop: string): void {
    this.db
      .prepare(
        `UPDATE library AS k SET
           title = CASE WHEN k.title_locked = 0 AND d.title_locked <> 0 THEN d.title ELSE k.title END,
           title_locked = MAX(k.title_locked, d.title_locked),
           series = COALESCE(k.series, d.series),
           volume = COALESCE(k.volume, d.volume),
           release_date = COALESCE(k.release_date, d.release_date),
           language = COALESCE(k.language, d.language),
           avg_page_width = COALESCE(k.avg_page_width, d.avg_page_width),
           avg_page_height = COALESCE(k.avg_page_height, d.avg_page_height)
         FROM library AS d WHERE k.id = ? AND d.id = ?`,
      )
      .run(keep, drop);
    if (this.creditsOf(keep).length === 0) {
      this.db.prepare('UPDATE credits SET library_id = ? WHERE library_id = ?').run(keep, drop);
    }
    this.mergeUserBooks(keep, drop);
    this.db.prepare('UPDATE OR IGNORE reading_list_items SET library_id = ? WHERE library_id = ?').run(keep, drop);
    this.db.prepare('UPDATE reading_sessions SET library_id = ? WHERE library_id = ?').run(keep, drop);
    this.remove(drop);
  }

  /** Combines each user's row of the two entries of {@link mergeEntries} into `keep`'s. */
  private mergeUserBooks(keep: string, drop: string): void {
    const read = this.db.prepare(
      'SELECT user_id, current_page, rating, tags, finished_at, last_opened_at FROM user_books WHERE library_id = ?',
    );
    const kept = new Map((read.all(keep) as unknown as UserBookRow[]).map((row) => [row.user_id, row]));
    for (const dropped of read.all(drop) as unknown as UserBookRow[]) {
      const own = kept.get(dropped.user_id);
      if (own === undefined) {
        this.db
          .prepare('UPDATE user_books SET library_id = ? WHERE library_id = ? AND user_id = ?')
          .run(keep, drop, dropped.user_id);
        continue;
      }
      const finished = [own.finished_at, dropped.finished_at].filter((date) => date !== null).sort();
      const tags = new Set([...(JSON.parse(own.tags) as string[]), ...(JSON.parse(dropped.tags) as string[])]);
      this.db
        .prepare(
          `UPDATE user_books SET current_page = ?, rating = ?, tags = ?, finished_at = ?, last_opened_at = ?
           WHERE library_id = ? AND user_id = ?`,
        )
        .run(
          Math.max(own.current_page, dropped.current_page),
          own.rating !== 0 ? own.rating : dropped.rating,
          JSON.stringify([...tags]),
          finished[0] ?? null,
          own.last_opened_at > dropped.last_opened_at ? own.last_opened_at : dropped.last_opened_at,
          keep,
          own.user_id,
        );
    }
  }

  /** Id of the entry whose file is `filePath`, or null when that file isn't in the library. */
  idOfPath(filePath: string): string | null {
    const row = this.db.prepare('SELECT id FROM library WHERE path = ?').get(this.paths.encode(filePath)) as { id: string } | undefined;
    return row?.id ?? null;
  }

  /**
   * Points an entry at its file's new location, after the library organization moved it; everything
   * else (progress, rating, tags, metadata, reading-list places) stays. Returns false when the entry
   * is gone or another entry already has that path (paths are unique).
   */
  updatePath(id: string, filePath: string): boolean {
    if (this.hasPath(filePath)) return false;
    return Number(this.db.prepare('UPDATE library SET path = ? WHERE id = ?').run(this.paths.encode(filePath), id).changes) > 0;
  }

  /**
   * Adds a comic discovered by a folder scan. Unlike `touch`, an entry that already exists is left
   * completely alone — a scan is not a read, so it must not bump `last_opened_at` or refresh
   * metadata behind the user's back. New rows get `last_opened_at = added_at`, which is what puts
   * a freshly scanned batch at the top of the library list.
   */
  register(
    filePath: string,
    title: string,
    pageCount: number,
    fileCount: number,
    fileSize: number,
  ): 'created' | 'existing' {
    if (this.hasPath(filePath)) {
      return 'existing';
    }
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO library
           (id, path, title, page_count, added_at, last_opened_at, file_count, file_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), this.paths.encode(filePath), title, pageCount, now, now, fileCount, fileSize);
    return 'created';
  }

  /**
   * Writes a whole entry, matching an existing one by its file path (paths are unique, ids are
   * not stable across machines) — used by the JSON import to restore a snapshot on top of the
   * current library. Unlike `touch`, this does overwrite `rating`/`tags` and the looked-up
   * metadata, credits included: they're part of what the user is restoring.
   */
  upsert(entry: LibraryEntry): 'created' | 'updated' {
    return withTransaction(this.db, () => this.writeEntry(entry));
  }

  private writeEntry(entry: LibraryEntry): 'created' | 'updated' {
    const existing = this.db.prepare('SELECT id FROM library WHERE path = ?').get(this.paths.encode(entry.path)) as
      | { id: string }
      | undefined;

    if (existing) {
      this.db
        .prepare(
          `UPDATE library
           SET title = ?, page_count = ?, added_at = ?, file_count = ?, file_size = ?,
               title_locked = ?, series = ?, volume = ?, release_date = ?, language = ?,
               avg_page_width = ?, avg_page_height = ?
           WHERE id = ?`,
        )
        .run(
          entry.title,
          entry.pageCount,
          entry.addedAt,
          entry.fileCount,
          entry.fileSize,
          entry.titleLocked ? 1 : 0,
          entry.series,
          entry.volume,
          entry.releaseDate,
          entry.language,
          entry.avgPageWidth,
          entry.avgPageHeight,
          existing.id,
        );
      this.setCredits(existing.id, entry.credits);
      this.writeUserBook(existing.id, entry);
      return 'updated';
    }

    // A fresh id when the snapshot's one is already taken by a different file.
    const id = this.idIsTaken(entry.id) ? randomUUID() : entry.id;
    this.db
      .prepare(
        `INSERT INTO library
           (id, path, title, page_count, added_at, last_opened_at, file_count, file_size,
            title_locked, series, volume, release_date, language, avg_page_width, avg_page_height)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        this.paths.encode(entry.path),
        entry.title,
        entry.pageCount,
        entry.addedAt,
        entry.addedAt,
        entry.fileCount,
        entry.fileSize,
        entry.titleLocked ? 1 : 0,
        entry.series,
        entry.volume,
        entry.releaseDate,
        entry.language,
        entry.avgPageWidth,
        entry.avgPageHeight,
      );
    this.setCredits(id, entry.credits);
    this.writeUserBook(id, entry);
    return 'created';
  }

  /** Writes the active user's part of an imported entry: progress, rating, tags and last opening. */
  private writeUserBook(id: string, entry: LibraryEntry): void {
    this.db
      .prepare(
        `INSERT INTO user_books (user_id, library_id, current_page, rating, tags, last_opened_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, library_id) DO UPDATE SET
           current_page = excluded.current_page, rating = excluded.rating, tags = excluded.tags,
           last_opened_at = excluded.last_opened_at`,
      )
      .run(this.userId(), id, entry.currentPage, entry.rating, JSON.stringify(entry.tags), entry.lastOpenedAt);
  }

  private idIsTaken(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM library WHERE id = ?').get(id) !== undefined;
  }

  /**
   * Path of the most recently opened comic, if any. Used to reopen the file dialog in the
   * directory the user last picked a book from, rather than the OS default.
   */
  lastOpenedPath(): string | null {
    const row = this.db
      .prepare(`SELECT path FROM (${ENTRY_SELECT}) ORDER BY last_opened_at DESC LIMIT 1`)
      .get(this.userId()) as { path: string } | undefined;
    return row ? this.paths.decode(row.path) : null;
  }

  /**
   * Saves the last page read (0-based) for resuming later. Reaching the last page also records
   * the book's first completion date (`finished_at`), for the reading statistics.
   */
  updateProgress(id: string, currentPage: number): void {
    if (!this.ensureUserBook(id)) return;
    // Never past the last page, whatever the caller sent: `resumePage` would point at nothing.
    this.db
      .prepare(
        `UPDATE user_books
         SET current_page = MAX(0, MIN(?, (SELECT page_count FROM library WHERE id = ?) - 1))
         WHERE user_id = ? AND library_id = ?`,
      )
      .run(currentPage, id, this.userId(), id);
    this.db
      .prepare(
        `UPDATE user_books SET finished_at = ?
         WHERE user_id = ? AND library_id = ? AND finished_at IS NULL
           AND (SELECT page_count FROM library WHERE id = ?) > 0
           AND current_page >= (SELECT page_count FROM library WHERE id = ?) - 1`,
      )
      .run(new Date().toISOString(), this.userId(), id, id, id);
  }

  /** Sets the user rating: 0 (unrated) to 5. The value is stored as given, not clamped. */
  updateRating(id: string, rating: number): void {
    if (!this.ensureUserBook(id)) return;
    this.db.prepare('UPDATE user_books SET rating = ? WHERE user_id = ? AND library_id = ?').run(rating, this.userId(), id);
  }

  /** Stores the average page size measured by the background scan; returns the updated entry, or null if the id is unknown. */
  updateImageStats(id: string, width: number, height: number): LibraryEntry | null {
    this.db.prepare('UPDATE library SET avg_page_width = ?, avg_page_height = ? WHERE id = ?').run(width, height, id);
    return this.get(id);
  }

  /** Stores the archive's entry count and size on disk, after the file was rewritten; returns the updated entry, or null if the id is unknown. */
  updateFileStats(id: string, fileCount: number, fileSize: number): LibraryEntry | null {
    this.db.prepare('UPDATE library SET file_count = ?, file_size = ? WHERE id = ?').run(fileCount, fileSize, id);
    return this.get(id);
  }

  /** The entries the background scan has yet to measure (id and path), most recently opened first. */
  unmeasured(): { id: string; path: string }[] {
    const rows = this.db
      .prepare('SELECT id, path FROM library WHERE avg_page_width IS NULL ORDER BY added_at DESC')
      .all() as unknown as { id: string; path: string }[];
    return rows.map((row) => ({ id: row.id, path: this.paths.decode(row.path) }));
  }

  /** Replaces the entry's tags. Tagging a book `Lu` also records its first completion date, like reaching its last page. */
  updateTags(id: string, tags: string[]): void {
    if (!this.ensureUserBook(id)) return;
    this.db
      .prepare('UPDATE user_books SET tags = ? WHERE user_id = ? AND library_id = ?')
      .run(JSON.stringify(tags), this.userId(), id);
    if (tags.includes(READ_TAG)) {
      this.db
        .prepare(
          'UPDATE user_books SET finished_at = ? WHERE user_id = ? AND library_id = ? AND finished_at IS NULL',
        )
        .run(new Date().toISOString(), this.userId(), id);
    }
  }

  /**
   * Writes the metadata fields present in `update` (typically the ones the user accepted from a
   * lookup) and leaves the others alone. A new title is locked, so reopening the file doesn't
   * put the file name back. Returns the updated entry, or null if the id is unknown.
   */
  updateMetadata(id: string, update: MetadataUpdate): LibraryEntry | null {
    return withTransaction(this.db, () => this.writeMetadata(id, update));
  }

  /**
   * Writes the same `update` on every given entry, in one transaction (all or none). Returns the
   * updated entries; unknown ids are skipped.
   */
  updateMetadataMany(ids: readonly string[], update: MetadataUpdate): LibraryEntry[] {
    return withTransaction(this.db, () =>
      [...new Set(ids)].flatMap((id) => {
        const updated = this.writeMetadata(id, update);
        return updated ? [updated] : [];
      }),
    );
  }

  private writeMetadata(id: string, update: MetadataUpdate): LibraryEntry | null {
    if (!this.get(id)) {
      return null;
    }
    const columns: Record<string, string | number | null> = {};
    if (update.title !== undefined) {
      columns.title = update.title;
      columns.title_locked = 1;
    }
    if (update.series !== undefined) columns.series = update.series;
    if (update.volume !== undefined) columns.volume = update.volume;
    if (update.releaseDate !== undefined) columns.release_date = update.releaseDate;
    if (update.language !== undefined) columns.language = update.language;

    const names = Object.keys(columns);
    if (names.length > 0) {
      this.db
        .prepare(`UPDATE library SET ${names.map((name) => `${name} = ?`).join(', ')} WHERE id = ?`)
        .run(...Object.values(columns), id);
    }
    if (update.credits !== undefined) {
      this.setCredits(id, update.credits);
    }
    return this.get(id);
  }

  /**
   * Replaces an entry's credits, in the given order. People are matched by name (or created);
   * the same person in the same role twice is kept once. People no longer credited anywhere are
   * kept, for the future author pages.
   */
  private setCredits(id: string, credits: CreditInput[]): void {
    withTransaction(this.db, () => {
      this.db.prepare('DELETE FROM credits WHERE library_id = ?').run(id);
      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO credits (library_id, person_id, role, position) VALUES (?, ?, ?, ?)',
      );
      credits.forEach((credit, position) => {
        if (credit.lastName.trim() === '') return;
        const person = this.people.findOrCreate(credit);
        insert.run(id, person.id, credit.role, position);
      });
    });
  }

  /**
   * Removes the entry (its credits, and its place in the reading lists) from the library; the
   * file on disk is left untouched.
   */
  remove(id: string): void {
    withTransaction(this.db, () => {
      this.db.prepare('DELETE FROM credits WHERE library_id = ?').run(id);
      this.db.prepare('DELETE FROM reading_list_items WHERE library_id = ?').run(id);
      this.db.prepare('DELETE FROM user_books WHERE library_id = ?').run(id);
      this.db.prepare('DELETE FROM library WHERE id = ?').run(id);
    });
  }

  /**
   * Empties the library: every entry, its credits and its place in the reading lists, plus the
   * people (who only exist through credits). The files on disk are left untouched. Returns the
   * number of entries removed.
   */
  clear(): number {
    const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM library').get() as { count: number };
    // One transaction: a failure midway must not leave a library without its credits.
    withTransaction(this.db, () =>
      this.db.exec(`
        DELETE FROM reading_list_items;
        DELETE FROM credits;
        DELETE FROM people;
        DELETE FROM user_books;
        DELETE FROM library;
        DELETE FROM reading_sessions;
      `),
    );
    return count;
  }
}
