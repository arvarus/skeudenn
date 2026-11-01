/**
 * Looks up the latest published release of the app, to tell the user when a newer one exists.
 * @module
 */
import { isNewerVersion, type UpdateCheckResult } from '../../shared/app';
import { getJson, type HttpOptions } from './http-json';

/** GitHub's API endpoint for the repository's latest release (never a draft or a pre-release). */
export const LATEST_RELEASE_URL = 'https://api.github.com/repos/arvarus/skeudenn/releases/latest';

/**
 * Compares `currentVersion` with the tag of the latest GitHub release. Network failures come back
 * as an `error` result (translated), not as a throw.
 */
export async function checkForUpdate(currentVersion: string, options: HttpOptions): Promise<UpdateCheckResult> {
  try {
    const body = await getJson(LATEST_RELEASE_URL, options, 'GitHub');
    const tag = typeof body === 'object' && body !== null ? (body as { tag_name?: unknown }).tag_name : undefined;
    if (typeof tag === 'string' && isNewerVersion(currentVersion, tag)) {
      return { status: 'available', version: tag.replace(/^v/, '') };
    }
    return { status: 'up-to-date' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
