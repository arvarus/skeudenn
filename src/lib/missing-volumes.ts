/**
 * The volumes missing from a series, found from the numbers the library holds (pure, no DOM).
 * @module
 */

/**
 * The highest volume number taken into account. A series has no volume above it, and a volume above
 * it (a year typed as a volume, `999999999`) is ignored, so a wrong value can neither report
 * thousands of gaps nor make the library page enumerate millions of numbers.
 */
export const MAX_TRACKED_VOLUME = 1000;

/** How many ranges {@link formatMissingVolumes} spells out before cutting the list. */
export const MAX_SHOWN_RANGES = 5;

/**
 * The whole number a volume text stands for (`"07"` is 7), or `null` for anything else (`"12.1"`,
 * `"HS"`, `"1/2"`, empty), for 0 and for a number above {@link MAX_TRACKED_VOLUME}.
 */
export function volumeNumber(volume: string | null): number | null {
  if (volume === null) return null;
  const text = volume.trim();
  if (!/^\d{1,6}$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= MAX_TRACKED_VOLUME ? value : null;
}

/**
 * The whole numbers missing between 1 and the highest one held, in ascending order. `volumes` are
 * those of one series: only whole numbers count (`"07"` is 7; `"12.1"`, `"HS"` and `null` are neither
 * gaps nor fillers), a volume held in several files counts once, and a series with fewer than two
 * numbered volumes has no gap. The count starts at 1, not at the lowest volume held, so a series
 * started at 3 lacks 1 and 2. Volumes above {@link MAX_TRACKED_VOLUME} are ignored.
 */
export function missingVolumes(volumes: readonly (string | null)[]): number[] {
  const held = new Set<number>();
  for (const volume of volumes) {
    const value = volumeNumber(volume);
    if (value !== null) held.add(value);
  }
  if (held.size < 2) return [];
  const highest = Math.max(...held);
  const missing: number[] = [];
  for (let n = 1; n < highest; n++) {
    if (!held.has(n)) missing.push(n);
  }
  return missing;
}

/** A list of missing volumes as text. */
export interface MissingVolumesText {
  /** The first ranges, as shown in the heading: `2–5, 9, 12`. */
  shown: string;
  /** How many missing volumes `shown` leaves out (0 when the list is complete). */
  hidden: number;
  /** Every range, for the tooltip. */
  full: string;
}

/** `start–end`, or the single number. */
function rangeText(range: [number, number]): string {
  return range[0] === range[1] ? String(range[0]) : `${range[0]}–${range[1]}`;
}

/**
 * Spells out ascending missing volumes, consecutive numbers shortened to a range (`2–5, 9`). At most
 * `maxRanges` ranges are in `shown`, the volumes of the others being counted in `hidden`; `full` has
 * them all.
 */
export function formatMissingVolumes(missing: readonly number[], maxRanges: number = MAX_SHOWN_RANGES): MissingVolumesText {
  const ranges: [number, number][] = [];
  for (const n of missing) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === n - 1) last[1] = n;
    else ranges.push([n, n]);
  }
  const kept = ranges.slice(0, Math.max(1, maxRanges));
  const hidden = ranges.slice(kept.length).reduce((sum, [start, end]) => sum + (end - start + 1), 0);
  return {
    shown: kept.map(rangeText).join(', '),
    hidden,
    full: ranges.map(rangeText).join(', '),
  };
}
