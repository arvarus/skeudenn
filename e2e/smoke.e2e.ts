// Smoke tests of the packaged app: it starts, a book opens and its progress is saved, in both
// reader modes and from a reading list. They cover what Vitest can't (no DOM there): the
// components, and the build gotchas that only break the packaged app (docs/architecture.md).
import { expect, test, type Page } from '@playwright/test';

import { launchApp, type RunningApp, type Seed } from './app';

let app: RunningApp | undefined;

async function start(seed: Seed): Promise<Page> {
  app = await launchApp(seed);
  // The app starts on the home page; most tests begin in the library.
  await app.page.getByRole('link', { name: 'Library' }).click();
  return app.page;
}

test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** The saved reading progress (0-based page) of a book, as the library page would show it. */
function savedPage(page: Page, title: string): Promise<number | undefined> {
  return page.evaluate(async (wanted) => {
    const entries = await window.tankobon.library.list();
    return entries.find((entry) => entry.title === wanted)?.currentPage;
  }, title);
}

test('starts and exposes the preload bridge', async () => {
  const page = await start({ books: [{ title: 'Alpha', pageCount: 3 }] });
  await expect(page).toHaveTitle('Skeudenn');
  expect(await page.evaluate(() => typeof window.tankobon)).toBe('object');
  await expect(page.getByRole('button', { name: 'Open Alpha' })).toBeVisible();
});

test('opens a CBZ in single-page mode and saves the progress', async () => {
  const page = await start({ books: [{ title: 'Alpha', pageCount: 4 }] });
  await page.getByRole('button', { name: 'Open Alpha' }).click();

  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible();
  await expect(page.getByText('1 / 4')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('img', { name: 'Page 2' })).toBeVisible();
  await expect.poll(() => savedPage(page, 'Alpha')).toBe(1);
});

test('continuous mode follows the scroll and saves the progress', async () => {
  const page = await start({
    books: [{ title: 'Alpha', pageCount: 4 }],
    settings: { readingMode: 'continuous' },
  });
  await page.getByRole('button', { name: 'Open Alpha' }).click();
  await expect(page.getByText('1 / 4')).toBeVisible();

  // Pages load as they come near, and change height when they do: keep scrolling to the bottom
  // until the last page is the one crossing the middle of the window, and its progress is saved.
  // By its role, not its Tailwind classes, which change with the layout.
  const scroller = page.getByRole('region', { name: 'Pages' });
  await expect(async () => {
    await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(page.getByText('4 / 4')).toBeVisible({ timeout: 500 });
    expect(await savedPage(page, 'Alpha')).toBe(3);
  }).toPass();
});

test('continuous mode resumes on the saved page', async () => {
  const page = await start({
    books: [{ title: 'Alpha', pageCount: 4, currentPage: 2 }],
    settings: { readingMode: 'continuous' },
  });
  await page.getByRole('button', { name: 'Open Alpha' }).click();

  await expect(page.getByText('3 / 4')).toBeVisible();
  // Page 1 must never have been reported over the saved progress.
  await page.waitForTimeout(1000);
  expect(await savedPage(page, 'Alpha')).toBe(2);
});

test('a reading list offers its next book on the last page', async () => {
  const page = await start({
    books: [
      { title: 'Alpha', pageCount: 3 },
      { title: 'Beta', pageCount: 3 },
    ],
    lists: [{ name: 'Saga', books: ['Alpha', 'Beta'] }],
  });
  await page.getByRole('link', { name: 'Reading lists' }).first().click();
  await page.getByRole('link', { name: 'Saga' }).first().click();
  // The list's next book is its first unfinished one.
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('img', { name: 'Page 3' })).toBeVisible();

  await page.getByRole('button', { name: 'Next: Beta' }).click();
  await expect(page.getByTitle('Beta', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Page 1' })).toBeVisible();
  await expect.poll(() => savedPage(page, 'Alpha')).toBe(2);
});

test('a reading list has its own display mode', async () => {
  const page = await start({
    books: [{ title: 'Alpha', pageCount: 3 }],
    lists: [{ name: 'Saga', books: ['Alpha'] }],
  });
  await page.getByRole('link', { name: 'Reading lists' }).first().click();
  await page.getByRole('link', { name: 'Saga' }).first().click();
  // Full by default: the cover, the rating and the tag field, as in the library.
  await expect(page.getByRole('button', { name: 'Open Alpha' })).toBeVisible();
  await expect(page.getByPlaceholder('+ tag')).toBeVisible();

  await page.getByRole('button', { name: /^Compact/ }).click();
  await expect(page.getByRole('button', { name: 'Open Alpha' })).toBeHidden();
  await expect(page.getByPlaceholder('+ tag')).toBeHidden();
  const views = await page.evaluate(async () => {
    const settings = await window.tankobon.settings.getAll();
    return [settings.readingListView, settings.libraryView];
  });
  expect(views).toEqual(['compact', 'full']);
});
