import { watch, type FSWatcher } from 'node:fs';
import { cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { requestAppRestart } from '@electron-forge/core-utils/restart';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// `@napi-rs/canvas` (native binary) and `pdfjs-dist` (its JS + `standard_fonts`/`cmaps` data —
// see pdf-archive.ts) are kept as real npm dependencies rather than bundled by Vite (see
// vite.decoder.config.mts). The Vite plugin's packaging step only copies its own build output plus
// `package.json` — no `node_modules` — so anything left external has to be copied in by hand.
async function copyNodeModule(buildPath: string, name: string): Promise<void> {
  await cp(path.join('node_modules', name), path.join(buildPath, 'node_modules', name), { recursive: true });
}

// `npm run dev`: development mode (see docs/development.md). The Electron app inherits this
// process's environment, so `TANKOBON_DEV` is how src/main.ts knows to open DevTools.
const devMode = process.env.npm_lifecycle_event === 'dev';
if (devMode) {
  process.env.TANKOBON_DEV = '1';
}

// Restarts the app whenever Vite rebuilds the main process, decoder process or backup worker bundle. The Vite plugin's own
// `hotRestart` option is a no-op in Forge 8.0: its watch builds run in a subprocess that never
// receives the option, and couldn't reach the app if it did. This runs in Forge's own process,
// where `requestAppRestart()` is wired to `electron-forge start` (the same as typing `rs`).
// The directory is watched rather than the file, which Rollup may replace on each rebuild.
let mainBundleWatcher: FSWatcher | undefined;
function restartOnMainRebuild(): void {
  if (mainBundleWatcher) return; // postStart runs again after every restart
  let timer: NodeJS.Timeout | undefined;
  mainBundleWatcher = watch(path.resolve('.vite/build'), (_event, filename) => {
    if (filename !== 'main.cjs' && filename !== 'decoder-worker.cjs' && filename !== 'backup-worker.cjs') return;
    // One rebuild fires several events; restart once, after the write has settled.
    clearTimeout(timer);
    timer = setTimeout(() => requestAppRestart(), 300);
  });
  mainBundleWatcher.unref();
}

// What the comic formats are called by the desktop (Linux `.desktop` MIME types, macOS document
// types), so a double click on one in the file explorer can open the app. Windows installers built by
// Squirrel can't register file types: there, "Open with…" does the same.
const COMIC_MIME_TYPES = [
  'application/vnd.comicbook+zip',
  'application/vnd.comicbook-rar',
  'application/x-cbz',
  'application/x-cbr',
  'application/pdf',
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Packager adds the extension of the platform: assets/icon.ico (Windows), assets/icon.icns (macOS).
    icon: 'assets/icon',
    // The PNG is also read at run time, for the window icon on Linux (see src/main.ts).
    extraResource: ['assets/icon.png', 'LICENSE'],
    // Packager names the Linux binary after `productName` ("Skeudenn"), but the deb and rpm makers
    // look for one named after `name`: without this, `make` fails on Linux with "could not find
    // the Electron app binary". Windows and macOS keep their product-named executables.
    executableName: process.platform === 'linux' ? 'tankobon' : undefined,
    // macOS: the file types the app opens (Finder's "Open with" and double click).
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Comic book archive',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          CFBundleTypeExtensions: ['cbz', 'cbr'],
        },
        {
          CFBundleTypeName: 'PDF document',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          CFBundleTypeExtensions: ['pdf'],
        },
      ],
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({ setupIcon: 'assets/icon.ico' }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({ options: { icon: 'assets/icon.png', mimeType: COMIC_MIME_TYPES } }),
    new MakerDeb({ options: { icon: 'assets/icon.png', mimeType: COMIC_MIME_TYPES } }),
  ],
  plugins: [
    // `@napi-rs/canvas` (used for PDF rendering, see pdf-archive.ts) ships a native `.node`
    // binary, which can't be dlopen'd from inside the asar archive — this unpacks any such
    // binaries into `app.asar.unpacked` automatically at package time.
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          // The decoder process (utilityProcess), see docs/decisions/0012: bundled apart from main.cjs.
          entry: 'src/main/decoder/decoder-worker.ts',
          config: 'vite.decoder.config.mts',
          target: 'main',
        },
        {
          // The backup worker thread, see docs/decisions/0024: it copies the database off the main process.
          // `node:sqlite` is external there too, hence the main process's config.
          entry: 'src/main/db/backup-worker.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    postStart: async () => {
      if (devMode) restartOnMainRebuild();
    },
    packageAfterCopy: async (_config, buildPath) => {
      await copyNodeModule(buildPath, 'pdfjs-dist');
      await copyNodeModule(buildPath, '@napi-rs/canvas');
      // Only the platform package matching the machine that ran `npm install` is actually
      // present on disk (the others are npm optionalDependencies for other platforms/arches).
      const napiPackages = await readdir('node_modules/@napi-rs');
      await Promise.all(
        napiPackages
          .filter((name) => name.startsWith('canvas-'))
          .map((name) => copyNodeModule(buildPath, `@napi-rs/${name}`)),
      );
    },
  },
};

export default config;
