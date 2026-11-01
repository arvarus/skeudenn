import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type DefaultTheme } from 'vitepress';

// Written by TypeDoc (`npm run docs:api`, typedoc-vitepress-theme). Missing until the reference has
// been generated, which `docs:dev`/`docs:build` always do first.
const typedocSidebarPath = fileURLToPath(new URL('../reference/api/typedoc-sidebar.json', import.meta.url));
const typedocSidebar: DefaultTheme.SidebarItem[] = existsSync(typedocSidebarPath)
  ? JSON.parse(readFileSync(typedocSidebarPath, 'utf-8'))
  : [];

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Skeudenn',
  description: 'Digital comics, BD and manga library manager and reader.',
  lang: 'en-US',
  // Published on GitHub Pages at https://arvarus.github.io/tankobon/.
  base: '/tankobon/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/features' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Reference', link: '/reference/api/' },
    ],
    sidebar: [
      { text: 'Guide', items: [{ text: 'Features', link: '/guide/features' }] },
      {
        text: 'Contributors',
        items: [
          { text: 'Development', link: '/development' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Decision records', link: '/decisions/' },
        ],
      },
      {
        text: 'Reference (generated)',
        items: [
          { text: 'IPC channels', link: '/reference/ipc' },
          { text: 'Database schema', link: '/reference/schema' },
          { text: 'TypeScript API', link: '/reference/api/', collapsed: true, items: typedocSidebar },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/arvarus/tankobon' }],
    editLink: {
      pattern: 'https://github.com/arvarus/tankobon/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
