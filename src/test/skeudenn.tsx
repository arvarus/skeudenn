// A test helper, not a test: Vitest only runs `*.test.*` files.
/**
 * Test harness for the components and hooks that talk to `window.skeudenn`. It installs a fake of
 * the preload's API, typed by {@link SkeudennApi}: a test fakes only the methods it needs, and
 * calling any other one rejects with a message naming it, so a test never silently talks to nothing.
 * Import it before the code under test (`src/lib/app-data.ts` keeps a reference to `window.skeudenn`
 * when it is first imported).
 * @module
 */
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import type { SkeudennApi } from '@/preload';
import { applyLanguage, i18n } from '@/shared/i18n';

/** The methods a test fakes: any subset of each namespace of {@link SkeudennApi}. */
export type FakeSkeudenn = { [N in keyof SkeudennApi]?: Partial<SkeudennApi[N]> };

const NAMESPACES = [
  'app',
  'comic',
  'library',
  'readingLists',
  'stats',
  'settings',
  'data',
  'database',
  'metadata',
  'achievements',
  'users',
] as const satisfies readonly (keyof SkeudennApi)[];

/** One namespace: the faked methods, and for the others a rejection naming the method (a listener subscription gets a no-op unsubscribe). */
function namespace(name: string, methods: object | undefined): object {
  return new Proxy(methods ?? {}, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
      // `await`ing the namespace itself must not look like a thenable.
      if (typeof property === 'symbol' || property === 'then') return undefined;
      if (property.startsWith('on')) return () => () => undefined;
      return () => Promise.reject(new Error(`window.skeudenn.${name}.${property} is not faked by this test`));
    },
  });
}

/**
 * The one object behind `window.skeudenn`, kept for the whole test file: modules that captured it
 * (the data store) keep seeing the current fake.
 */
const skeudenn = {} as SkeudennApi;

/** Replaces the fake API: the given methods, and nothing else (the previous test's fakes are gone). */
export function installSkeudenn(fake: FakeSkeudenn = {}): void {
  for (const name of NAMESPACES) {
    (skeudenn as unknown as Record<string, object>)[name] = namespace(name, fake[name]);
  }
  Object.assign(window, { skeudenn });
}

installSkeudenn();

/**
 * Renders `ui` in French (the language the tests assert on) with `fake` installed as
 * `window.skeudenn`. Pair it with `cleanup` from Testing Library in an `afterEach`.
 */
export function renderWithSkeudenn(ui: ReactElement, fake: FakeSkeudenn = {}): RenderResult {
  installSkeudenn(fake);
  applyLanguage('fr');
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}
