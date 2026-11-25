import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { boundedStream } from './bounded-stream';

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe('boundedStream', () => {
  it('passes up to the limit through unchanged', async () => {
    const source = Readable.from([Buffer.alloc(4, 1), Buffer.alloc(6, 2)]);
    expect((await collect(boundedStream(source, 10, () => new Error('too large')))).length).toBe(10);
  });

  it('fails past the limit and destroys the source', async () => {
    const source = Readable.from([Buffer.alloc(6), Buffer.alloc(6), Buffer.alloc(6)]);
    await expect(collect(boundedStream(source, 10, () => new Error('too large')))).rejects.toThrow('too large');
    expect(source.destroyed).toBe(true);
  });

  it('forwards an error of the source', async () => {
    const source = new Readable({ read() { this.destroy(new Error('broken')); } });
    await expect(collect(boundedStream(source, 10, () => new Error('too large')))).rejects.toThrow('broken');
  });
});
