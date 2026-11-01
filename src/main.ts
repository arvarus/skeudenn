import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import started from 'electron-squirrel-startup';

import { applyAppMenu } from './main/app-menu';
import { DecoderClient } from './main/decoder/decoder-client';
import { spawnDecoderProcess } from './main/decoder/spawn-decoder';
import { AchievementRepository } from './main/db/achievement-repository';
import { isBackupDue } from './main/db/backup-service';
import { openDatabase } from './main/db/database';
import { LibraryFolderRepository } from './main/db/library-folder-repository';
import { PathRoots, fileRootsStore } from './main/db/path-roots';
import { LibraryRepository } from './main/db/library-repository';
import { ReadingListRepository } from './main/db/reading-list-repository';
import { StatsRepository } from './main/db/stats-repository';
import { SettingsRepository } from './main/db/settings-repository';
import { UserRepository } from './main/db/user-repository';
import { broadcastDataChange } from './main/ipc/data-changes';
import { setAppUrl } from './main/ipc/trusted-sender';
import { registerAchievementsIpc } from './main/ipc/achievements';
import { announceLaunchFile, registerAppIpc } from './main/ipc/app';
import { registerComicIpc } from './main/ipc/comic';
import { LaunchFiles } from './main/ipc/launch-files';
import { PickedFiles } from './main/ipc/picked-files';
import { createBackupMaker, createBackupRunner } from './main/db/backup-runner';
import { registerDatabaseIpc, runBackup } from './main/ipc/database';
import { registerDataIpc } from './main/ipc/data';
import { broadcastImageScanProgress, registerLibraryIpc } from './main/ipc/library';
import { registerMetadataIpc } from './main/ipc/metadata';
import { registerReadingListIpc } from './main/ipc/reading-lists';
import { registerStatsIpc } from './main/ipc/stats';
import { registerSettingsIpc } from './main/ipc/settings';
import { registerUserIpc } from './main/ipc/users';
import { applyMainLanguage, onMainLanguageApplied } from './main/language';
import { comicPathFromArgv } from './main/launch-files';
import { isPermissionAllowed } from './main/permissions';
import { isOnlineOnly } from './main/services/cloud-files';
import { createImageStatsScanner } from './main/services/image-stats-scanner';
import { createCbrConverter } from './main/services/cbr-conversion';
import { createFolderCleaner } from './main/services/folder-cleanup';
import { createLibraryCleaner } from './main/services/library-cleanup';
import { createLibraryOrganizer, createResynchronizer } from './main/services/library-organization';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Electron derives `userData` from the product name, which changed with the rename to Skeudenn:
// keep the folder the database, the roots file and the thumbnails already live in.
app.setPath('userData', path.join(app.getPath('appData'), 'Tankōbon'));

// One instance at a time: a second one would open the same database file and its decoder process on
// the same library. Launching the app again brings the running window forward instead.
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) {
  app.quit();
}

// macOS hands the file of a double click over `open-file`, possibly before the app is ready (a cold
// start): those paths wait here until `offerLaunchFile` exists.
let offerLaunchFile: ((filePath: string) => void) | null = null;
const earlyLaunchFiles: string[] = [];
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (offerLaunchFile) offerLaunchFile(filePath);
  else earlyLaunchFiles.push(filePath);
});

// Development mode (`npm run dev`, see forge.config.ts): only there are DevTools opened.
const isDevMode = !app.isPackaged && process.env.TANKOBON_DEV === '1';

// The window icon (taskbar and title bar on Linux; Windows and macOS take the executable's own).
// Packaged, the PNG is copied next to the app by `extraResource` (forge.config.ts).
const windowIcon = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(app.getAppPath(), 'assets', 'icon.png');

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Skeudenn',
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The window only ever shows the app itself: no navigation away from it (a dropped file or a
  // clicked link would replace the UI, and a page loaded there could reach `window.tankobon`),
  // and no new window. Links go through `app:open-link` instead.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });
  // A redirect is a navigation too: the app's page never legitimately redirects.
  mainWindow.webContents.on('will-redirect', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (isDevMode) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
};

app.whenReady().then(() => {
  if (!isFirstInstance) return;
  // Electron grants every permission request by default: only what the page uses is (see permissions.ts).
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) =>
    callback(isPermissionAllowed(permission)),
  );
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => isPermissionAllowed(permission));
  // Only the application's own page may call the IPC handlers.
  setAppUrl(
    MAIN_WINDOW_VITE_DEV_SERVER_URL ??
      pathToFileURL(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)).href,
  );
  const db = openDatabase();
  // Several people share the library; what is personal (ratings, tags, progress, lists, history,
  // achievements, settings) is read and written for the user the app is currently switched to.
  const userRepo = new UserRepository(db);
  const activeUser = () => userRepo.activeId();
  // The books are stored relative to their library folder; where each folder is lives on this machine only.
  const pathRoots = new PathRoots(fileRootsStore(path.join(app.getPath('userData'), 'library-roots.json')));
  const libraryRepo = new LibraryRepository(db, activeUser, pathRoots);
  const folderRepo = new LibraryFolderRepository(db, pathRoots, activeUser);
  // Folders already on this machine (a database from before the roots, or the same layout elsewhere), then
  // the books under them made relative.
  folderRepo.syncRoots();
  libraryRepo.adoptRoots();
  const settingsRepo = new SettingsRepository(db, activeUser);
  const readingListRepo = new ReadingListRepository(db, activeUser);
  const achievementRepo = new AchievementRepository(db, activeUser);
  const statsRepo = new StatsRepository(db, activeUser);
  // Archives and covers are decoded in their own process: a booby-trapped file can only take that one down.
  // The thumbnails are a cache, so they stay in userData even when the database lives elsewhere.
  const decoder = new DecoderClient(spawnDecoderProcess, path.join(app.getPath('userData'), 'thumbnails'));
  onMainLanguageApplied((language) => decoder.setLanguage(language));
  decoder.setSidecarCovers(settingsRepo.getAll().librarySidecarCovers);
  // Before anything can show a dialog or return an error message.
  onMainLanguageApplied(() => applyAppMenu(isDevMode));
  applyMainLanguage(settingsRepo.getAll().language);
  // Leftovers of another database (its location changed) or of a crash between two writes.
  void decoder.pruneThumbnails(libraryRepo.list().map((entry) => entry.path)).catch(() => undefined);

  // Measures the pages of the books (average width and height) in the background, one book at a time.
  const imageScanner = createImageStatsScanner(libraryRepo, {
    measure: (filePath) => decoder.measure(filePath),
    isOnlineOnly,
    onProgress: broadcastImageScanProgress,
    onUpdated: (entries) => broadcastDataChange({ scope: 'library', upserted: entries }),
  });
  // Moves the added books into the organized folder, when the setting asks for it.
  const organizer = createLibraryOrganizer(libraryRepo, settingsRepo, decoder, broadcastDataChange);
  const resynchronizer = createResynchronizer(
    libraryRepo,
    folderRepo,
    settingsRepo,
    decoder,
    broadcastDataChange,
    imageScanner,
    organizer,
    activeUser,
  );
  const cbrConverter = createCbrConverter(libraryRepo, settingsRepo, decoder, broadcastDataChange, organizer.lock);
  registerLibraryIpc({
    repo: libraryRepo,
    folders: folderRepo,
    resynchronizer,
    settingsRepo,
    decoder,
    notify: broadcastDataChange,
    imageScanner,
    organizer,
    cleaner: createLibraryCleaner(libraryRepo, decoder, broadcastDataChange, organizer.lock),
    converter: cbrConverter,
    folderCleaner: createFolderCleaner(settingsRepo, organizer.lock),
    activeUser,
  });
  registerReadingListIpc(readingListRepo, broadcastDataChange);
  registerStatsIpc(statsRepo);
  registerSettingsIpc(settingsRepo, broadcastDataChange, decoder);
  registerUserIpc(userRepo, settingsRepo, broadcastDataChange);
  registerDataIpc(db, libraryRepo, settingsRepo, readingListRepo, decoder, broadcastDataChange, imageScanner);
  // The comics the OS asks to open are opened by token, like those picked in the reader's dialog.
  const pickedFiles = new PickedFiles();
  const launchFiles = new LaunchFiles(pickedFiles, announceLaunchFile);
  registerComicIpc(libraryRepo, settingsRepo, decoder, broadcastDataChange, imageScanner, pickedFiles);
  // The copies of the database are made in a worker thread (backup-worker.cjs, next to this bundle), not here.
  const makeBackup = createBackupMaker(
    createBackupRunner((job) => new Worker(path.join(__dirname, 'backup-worker.cjs'), { workerData: job })),
    db,
  );
  registerDatabaseIpc(makeBackup, settingsRepo, broadcastDataChange);
  registerMetadataIpc(settingsRepo, libraryRepo, decoder, broadcastDataChange);
  registerAchievementsIpc(achievementRepo, broadcastDataChange);
  registerAppIpc(launchFiles);

  app.on('will-quit', () => {
    decoder.dispose();
    db.close();
  });

  app.on('second-instance', (_event, argv, workingDirectory) => {
    const launched = comicPathFromArgv(argv, workingDirectory);
    if (launched) launchFiles.offer(launched);
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  // The file this launch was started with (before the window, whose renderer takes it when it starts).
  const launched = comicPathFromArgv(process.argv, process.cwd());
  if (launched) launchFiles.offer(launched);
  offerLaunchFile = (filePath) => launchFiles.offer(filePath);
  for (const filePath of earlyLaunchFiles.splice(0)) launchFiles.offer(filePath);

  createWindow();

  // Scheduled copies of the database: checked at start-up, then every hour for sessions that stay open.
  const backupIfDue = () => {
    const { backupIntervalDays, lastBackupAt } = settingsRepo.getAll();
    if (isBackupDue(lastBackupAt, backupIntervalDays)) void runBackup(makeBackup, settingsRepo, broadcastDataChange);
  };
  backupIfDue();
  const backupTimer = setInterval(backupIfDue, 60 * 60 * 1000);
  backupTimer.unref();
  app.on('will-quit', () => clearInterval(backupTimer));

  // The automatic emptying of `.deletedByTankobon` (the active user's setting), at start-up then every hour.
  const emptyTrashIfDue = () => {
    const { trashAutoEmpty, trashRetentionDays } = settingsRepo.getAll();
    if (trashAutoEmpty) void cbrConverter.emptyDeletedOlderThan(trashRetentionDays).catch(() => undefined);
  };
  emptyTrashIfDue();
  const trashTimer = setInterval(emptyTrashIfDue, 60 * 60 * 1000);
  trashTimer.unref();
  app.on('will-quit', () => clearInterval(trashTimer));

  // In the background: the library is usable meanwhile, and its views update as the walk goes.
  if (settingsRepo.getAll().resyncOnStartup) {
    void resynchronizer.run();
  }
  // Books left unmeasured by an earlier session (or a database from before the measure existed).
  void imageScanner.kick();
});

// Quit when all windows are closed, except on macOS where apps stay active
// until the user quits explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create a window when the dock icon is clicked and no window is open.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
