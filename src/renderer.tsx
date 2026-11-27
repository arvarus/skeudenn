// Renderer entry point, loaded by Vite. Runs in a sandboxed browser context:
// no Node.js access here — go through `window.skeudenn` (see preload.ts).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router';
import { I18nextProvider } from 'react-i18next';

import { applyInterfaceLanguage, keepInterfaceLanguageInSync, keepThemeInSync, loadSystemLanguages } from './hooks/use-settings';
import { appData } from './lib/app-data';
import './index.css';
import { routeTree } from './routeTree.gen';
import { i18n } from './shared/i18n';

// Memory history: the renderer is served from a local file in production,
// so there is no meaningful URL to sync with.
const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element in index.html');
}

// A file dropped outside a drop target would make Chromium navigate to it (replacing the UI with
// its PDF viewer, or loading a page). Cancelling the default here leaves the components' own
// handlers (reading lists in the sidebar and on /lists) untouched: they run on the same events.
for (const type of ['dragover', 'drop']) {
  document.addEventListener(type, (event) => event.preventDefault());
}

const root = createRoot(container);
const render = () =>
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </StrictMode>,
  );

// The language is applied before the first render, so the UI never shows up in another one first.
appData.start();
Promise.all([appData.ready, loadSystemLanguages()])
  .then(() => applyInterfaceLanguage(appData.getSettings().language))
  .catch(() => applyInterfaceLanguage('system'))
  .finally(() => {
    keepInterfaceLanguageInSync();
    keepThemeInSync();
    render();
  });
