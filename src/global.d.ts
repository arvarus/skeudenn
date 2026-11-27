import type { SkeudennApi } from './preload';

declare global {
  interface Window {
    skeudenn: SkeudennApi;
  }
}

export {};
