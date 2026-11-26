/**
 * Zoom levels of the readers, kept pure so the stepping can be tested.
 * @module
 */

/** `'fit'` scales the content to the available area; a number is a fraction of its actual pixel size. */
export type Zoom = 'fit' | number;

/** The zoom menu's levels, in order. */
export const ZOOM_OPTIONS: readonly Zoom[] = ['fit', 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

/** A width and a height, in pixels. */
export interface Size {
  width: number;
  height: number;
}

/** The factor that makes `natural` fit entirely inside `container`. */
export function fitScale(container: Size, natural: Size): number {
  if (natural.width <= 0 || natural.height <= 0) return 1;
  return Math.min(container.width / natural.width, container.height / natural.height);
}

/**
 * The factor to draw `natural` at: {@link fitScale} for `'fit'` (1 while the container's size isn't
 * known yet), else the zoom itself.
 */
export function zoomScale(zoom: Zoom, container: Size | null, natural: Size): number {
  if (zoom !== 'fit') return zoom;
  return container ? fitScale(container, natural) : 1;
}

/** Two factors closer than this are the same level. */
const SAME_SCALE = 0.0005;

/**
 * The zoom one step up (`direction` 1) or down (-1) from `current`, over the menu's levels. `'fit'`
 * stands where its factor (`fit`, null when unknown: it is then left out) falls among the others, so
 * a step from a zoom that isn't on the menu's levels lands on the nearest one in that direction.
 * Returns `current` at either end.
 */
export function stepZoom(current: Zoom, direction: 1 | -1, fit: number | null): Zoom {
  const levels: { zoom: Zoom; scale: number }[] = [];
  for (const zoom of ZOOM_OPTIONS) {
    if (zoom !== 'fit') levels.push({ zoom, scale: zoom });
  }
  if (fit !== null) levels.push({ zoom: 'fit', scale: fit });
  levels.sort((a, b) => a.scale - b.scale);
  const currentScale = current === 'fit' ? fit : current;
  if (currentScale === null) return current;
  if (direction === 1) return levels.find((level) => level.scale > currentScale + SAME_SCALE)?.zoom ?? current;
  return [...levels].reverse().find((level) => level.scale < currentScale - SAME_SCALE)?.zoom ?? current;
}
