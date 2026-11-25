import js from '@eslint/js';
import globals from 'globals';
import { config, configs as tsConfigs } from 'typescript-eslint';
import { flatConfigs as importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';

export default config(
  { ignores: ['.vite/', 'out/', 'dist/', 'src/routeTree.gen.ts', 'docs/.vitepress/cache/', 'docs/.vitepress/dist/', 'docs/reference/'] },
  js.configs.recommended,
  ...tsConfigs.recommended,
  importX.recommended,
  importX.typescript,
  importX.electron,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver()],
    },
  },
  {
    // Single quotes, except where a string holds one (`avoidEscape`); template
    // literals stay allowed. JSX attributes are `jsx-quotes`' business, left
    // unenforced. The core rule is deprecated (formatting rules move to
    // @stylistic/eslint-plugin) but kept until ESLint 11.
    rules: { quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }] },
  },
  {
    // Renderer: React rules only apply to the UI code.
    files: ['src/**/*.tsx'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['src/**/*.tsx'],
    ...refresh.configs.vite,
  },
  {
    // Route files export `Route` next to a non-exported component and shadcn
    // components export their `*Variants` helpers: fast refresh still works.
    files: ['src/routes/**/*.tsx', 'src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
