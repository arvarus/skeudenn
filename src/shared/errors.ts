/**
 * Turning a caught value into the text a user or another process is shown.
 * @module
 */

/**
 * The text of a caught value: an `Error`'s message, anything else turned into a string. Used
 * where a failure is reported to the user or across a process boundary.
 */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
