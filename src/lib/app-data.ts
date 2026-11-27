/**
 * The renderer's one {@link DataStore}, fed by `window.skeudenn`. Started by `src/renderer.tsx`
 * before the first render; the hooks of `src/hooks/` read it.
 * @module
 */
import { DataStore } from './data-store';

/** The renderer's copy of the library, reading lists and settings. */
export const appData = new DataStore(window.skeudenn);
