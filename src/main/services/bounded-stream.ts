/**
 * Bounding what an archive entry inflates to, whatever size the archive declares for it.
 * @module
 */
import { pipeline, Transform, type Readable } from 'node:stream';

/**
 * `source` passed through a byte counter that fails with `tooLarge()` as soon as more than `limit`
 * bytes went through. The size a ZIP declares for an entry can't be trusted (node-stream-zip skips its
 * own size check on entries with the "data descriptor" flag), so a few kilobytes could otherwise
 * inflate to gigabytes. On the error, the source is destroyed too (no more inflating) and the
 * returned stream emits it, as it does any error of the source.
 */
export function boundedStream(source: Readable, limit: number, tooLarge: () => Error): Readable {
  let total = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      callback(total > limit ? tooLarge() : null, total > limit ? undefined : chunk);
    },
  });
  // The callback only swallows the error for `pipeline`; `counter` still emits it.
  return pipeline(source, counter, () => undefined);
}
