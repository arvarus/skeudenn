// Copies the packaged app (`npm run package`) to a directory with a plain ASCII name, and points
// `SKEUDENN_E2E_APP` at it for the tests (see app.ts).
//
// The package is named after the product ("Skeudenn-linux-x64"). On Linux an earlier build of the
// app exited at once, silently, when it ran from a path holding a decomposed non-ASCII character
// (the former product name had one); the copy is kept as a precaution: the same files start fine
// from an ASCII path (the deb installs to /usr/lib/skeudenn).
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT_DIR = path.resolve(__dirname, '../out');

export default function globalSetup(): () => void {
  const folder = readdirSync(OUT_DIR).find((name) => name.endsWith(`-${process.platform}-${process.arch}`));
  if (!folder) throw new Error(`No packaged app in ${OUT_DIR}: run "npm run package" first.`);
  const root = mkdtempSync(path.join(os.tmpdir(), 'skeudenn-e2e-app-'));
  const copy = path.join(root, 'app');
  cpSync(path.join(OUT_DIR, folder), copy, { recursive: true, verbatimSymlinks: true });
  process.env.SKEUDENN_E2E_APP = copy;
  return () => rmSync(root, { recursive: true, force: true });
}
