/**
 * Which web permissions the window may be granted. Electron grants every request by default (camera,
 * location, notifications…); the window only shows the app's own page, which needs two: the fullscreen of
 * the reader and copying the "À propos" information.
 * @module
 */

/** The permissions the app's page uses; anything else is refused. */
const ALLOWED_PERMISSIONS: readonly string[] = ['fullscreen', 'clipboard-sanitized-write'];

/** Whether the window may be granted `permission` (a name from Electron's permission request). */
export function isPermissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.includes(permission);
}
