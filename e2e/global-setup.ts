// Copies the packaged app (`npm run package`) to a directory with a plain ASCII name, and points
// `TANKOBON_E2E_APP` at it for the tests (see app.ts).
//
// The package is named after the product ("Skeudenn-linux-x64"). On Linux the packaged app
// exits at once, silently, when it runs from a path holding that decomposed "ō" (the former product name, Tankōbon; the copy is kept as a precaution): the same files
// start fine from an ASCII path (the deb installs to /usr/lib/tankobon).
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT_DIR = path.resolve(__dirname, '../out');

export default function globalSetup(): () => void {
  const folder = readdirSync(OUT_DIR).find((name) => name.endsWith(`-${process.platform}-${process.arch}`));
  if (!folder) throw new Error(`No packaged app in ${OUT_DIR}: run "npm run package" first.`);
  const root = mkdtempSync(path.join(os.tmpdir(), 'tankobon-e2e-app-'));
  const copy = path.join(root, 'app');
  cpSync(path.join(OUT_DIR, folder), copy, { recursive: true, verbatimSymlinks: true });
  process.env.TANKOBON_E2E_APP = copy;
  return () => rmSync(root, { recursive: true, force: true });
}
