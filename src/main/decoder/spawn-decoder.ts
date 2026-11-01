/**
 * Starts the decoder process as an Electron `utilityProcess` joined to the main process by a `MessagePort`.
 * @module
 */
import { MessageChannelMain, utilityProcess } from 'electron';
import path from 'node:path';

import type { DecoderChannel } from './decoder-client';
import type { DecoderResponse } from './protocol';

/** Forks `decoder-worker.cjs` (next to the main bundle) and returns the main side of its port. */
export function spawnDecoderProcess(): DecoderChannel {
  const child = utilityProcess.fork(path.join(__dirname, 'decoder-worker.cjs'), [], {
    serviceName: 'Skeudenn decoder',
  });
  const { port1, port2 } = new MessageChannelMain();
  child.postMessage(null, [port2]);
  port1.start();
  return {
    post: (message) => port1.postMessage(message),
    onResponse: (listener) => port1.on('message', ({ data }) => listener(data as DecoderResponse)),
    onExit: (listener) => {
      child.once('exit', listener);
    },
    kill: () => {
      child.kill();
    },
  };
}
