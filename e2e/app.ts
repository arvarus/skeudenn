// Launches the packaged app (`npm run package`) against a throw-away user data directory, seeded
// through the app's own repositories, and hands the window to Playwright.
//
// Playwright's `_electron.launch()` can't be used: it needs `--inspect`, which the packaged app
// refuses (the `EnableNodeCliInspectArguments` fuse is off, see forge.config.ts). The executable
// is started with Chromium's `--remote-debugging-port` instead, and Playwright attaches over CDP.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium, type Browser, type Page } from '@playwright/test';

import { LibraryRepository } from '../src/main/db/library-repository';
import { ReadingListRepository } from '../src/main/db/reading-list-repository';
import { migrate } from '../src/main/db/schema';
import { SettingsRepository } from '../src/main/db/settings-repository';
import type { CreditInput } from '../src/shared/library';
import type { AppSettings } from '../src/shared/settings';
import { buildCbz } from './cbz';

/** A book to put in the library before the app starts. */
export interface SeedBook {
  title: string;
  pageCount: number;
  /** Page the book was left on (0-based). */
  currentPage?: number;
  /** People credited on the book. */
  credits?: CreditInput[];
}

/** What the app starts with. */
export interface Seed {
  books: SeedBook[];
  settings?: Partial<AppSettings>;
  /** Reading lists, as titles of `books`, in reading order. */
  lists?: { name: string; books: string[] }[];
}

/** A running app: the window, and the library entries as seeded (title → path). */
export interface RunningApp {
  page: Page;
  paths: Map<string, string>;
  close(): Promise<void>;
}

/** The executable of the copy of the packaged app made by `global-setup.ts`. */
function executablePath(): string {
  const root = process.env.SKEUDENN_E2E_APP;
  if (!root) throw new Error('SKEUDENN_E2E_APP is not set: run the tests through `npm run test:e2e`.');
  if (process.platform === 'linux') return path.join(root, 'skeudenn');
  const product = readdirSync(root).find((name) => name.endsWith(process.platform === 'win32' ? '.exe' : '.app'));
  if (!product) throw new Error(`No executable in ${root}`);
  return process.platform === 'win32' ? path.join(root, product) : path.join(root, product, 'Contents/MacOS', path.basename(product, '.app'));
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** Writes the CBZ files and the database of a fresh user data directory. */
function seedUserData(userData: string, booksDir: string, seed: Seed): Map<string, string> {
  mkdirSync(userData, { recursive: true });
  mkdirSync(booksDir, { recursive: true });
  const db = new DatabaseSync(path.join(userData, 'skeudenn.db'));
  migrate(db);
  const library = new LibraryRepository(db);
  const lists = new ReadingListRepository(db);
  const settings = new SettingsRepository(db);

  // English, whatever the locale of the machine running the tests.
  settings.set('language', 'en');
  for (const [key, value] of Object.entries(seed.settings ?? {})) settings.set(key as keyof AppSettings, value);

  const ids = new Map<string, string>();
  const paths = new Map<string, string>();
  for (const book of seed.books) {
    const file = path.join(booksDir, `${book.title}.cbz`);
    writeFileSync(file, buildCbz(book.pageCount));
    const entry = library.touch(file, book.title, book.pageCount, book.pageCount, 0);
    if (book.currentPage) library.updateProgress(entry.id, book.currentPage);
    if (book.credits) library.updateMetadata(entry.id, { credits: book.credits });
    ids.set(book.title, entry.id);
    paths.set(book.title, file);
  }
  for (const list of seed.lists ?? []) {
    const created = lists.create(list.name);
    if (created.status !== 'ok') throw new Error(`Could not create the list ${list.name}`);
    for (const title of list.books) lists.addEntry(created.list.id, ids.get(title)!);
  }
  db.close();
  return paths;
}

async function connect(port: number, child: ChildProcess, output: () => string): Promise<{ browser: Browser; page: Page }> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`The app exited with code ${child.exitCode}:\n${output()}`);
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const context = browser.contexts()[0];
      const page = context.pages()[0] ?? (await context.waitForEvent('page'));
      return { browser, page };
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/** Kills the app and waits for it to be gone, so its files can be deleted. */
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
}

/** Seeds a user data directory, starts the packaged app on it and waits for its window. */
export async function launchApp(seed: Seed): Promise<RunningApp> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'skeudenn-e2e-'));
  const userData = path.join(root, 'user-data');
  const paths = seedUserData(userData, path.join(root, 'books'), seed);

  const port = await freePort();
  const child = spawn(
    executablePath(),
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userData}`,
      // The Chromium sandbox helper of an unpacked Electron isn't setuid-root (CI, containers).
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-4000)));
  try {
    const { browser, page } = await connect(port, child, () => stderr);
    await page.waitForLoadState('domcontentloaded');
    return {
      page,
      paths,
      close: async () => {
        await browser.close().catch(() => undefined);
        await stop(child);
        rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      },
    };
  } catch (error) {
    await stop(child);
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    throw error;
  }
}
