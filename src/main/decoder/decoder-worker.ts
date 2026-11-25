/**
 * Entry point of the decoder process, an Electron `utilityProcess` (ADR 0012): everything that
 * parses an untrusted comic file runs here, so a crash or a runaway allocation stops this process
 * instead of the app. Bundled on its own as `decoder-worker.cjs` (`vite.decoder.config.mts`).
 * @module
 */
import type { MessagePortMain } from 'electron';

import { applyLanguage } from '../../shared/i18n';
import { errorText } from '../../shared/errors';
import { createDecoderHandlers, type DecoderHandlers } from './decoder-handlers';
import type { DecoderInbound, DecoderRequest, DecoderResponse } from './protocol';

let handlers: (DecoderHandlers & { setSidecarCovers(enabled: boolean): void }) | undefined;

async function run(request: DecoderRequest): Promise<DecoderResponse> {
  try {
    if (!handlers) {
      throw new Error('Decoder not initialised');
    }
    const handler = handlers[request.method] as (...args: unknown[]) => Promise<unknown>;
    return { type: 'response', id: request.id, ok: true, result: await handler(...request.args) };
  } catch (error) {
    return {
      type: 'response',
      id: request.id,
      ok: false,
      message: errorText(error),
    };
  }
}

function serve(port: MessagePortMain): void {
  port.on('message', ({ data }) => {
    const message = data as DecoderInbound;
    if (message.type === 'init') {
      applyLanguage(message.language);
      handlers = createDecoderHandlers(message.thumbnailsDirectory, message.sidecarCovers);
    } else if (message.type === 'language') {
      applyLanguage(message.language);
    } else if (message.type === 'sidecarCovers') {
      handlers?.setSidecarCovers(message.enabled);
    } else {
      void run(message).then((response) => port.postMessage(response));
    }
  });
  port.start();
}

// The main process hands over the port to talk through right after forking.
process.parentPort.once('message', ({ ports }) => serve(ports[0]));
