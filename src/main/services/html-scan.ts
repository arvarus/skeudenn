/**
 * Linear-time helpers for reading the HTML of scraped pages (Bédéthèque, BDfugue, Nautiljon). A page
 * is untrusted and up to `MAX_RESPONSE_BYTES` (5 MB), parsed synchronously in the main process: a
 * single regular expression such as `<h1>([\s\S]*?)<\/h1>` is tried again from every `<h1>` when no
 * `</h1>` follows, which is quadratic, and a broken or hostile page would freeze the app for minutes.
 * These helpers find the same parts in steps, each searched once from where the previous one ended.
 * The patterns given to them must be linear on their own: a tag's attributes are `[^<>]*` (an attempt
 * stops at the next `<`), or `(?:"[^"]*"|[^"<>])*` where a quoted value may hold a raw `<` or `>`.
 * @module
 */

/** One run of {@link scanSequences}: each step's match, and the text between two consecutive steps. */
export interface HtmlSequence {
  /** The match of each step, in order. */
  matches: RegExpExecArray[];
  /** The text between step `i` and step `i + 1`. */
  gaps: string[];
}

function globalCopy(pattern: RegExp): RegExp {
  return new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
}

/**
 * Every run of `steps` found one after the other in `html`: a match of the first step, then the first
 * match of the second step after it, and so on; the next run is looked for after the last step. It
 * finds what the single regular expression `step1([\s\S]*?)step2([\s\S]*?)step3…` (flag `g`) finds,
 * the gaps being its groups, but in linear time: when a step isn't found after a run's first match,
 * it can't be found after a later one either, so the search stops instead of trying every later
 * opening again. `accept` filters the first step's matches (a condition on a tag's attributes): a
 * refused match is skipped and the search goes on from the next character.
 */
export function* scanSequences(
  html: string,
  steps: RegExp[],
  accept?: (opening: RegExpExecArray) => boolean,
): Generator<HtmlSequence> {
  const patterns = steps.map(globalCopy);
  let from = 0;
  while (from <= html.length) {
    patterns[0].lastIndex = from;
    const first = patterns[0].exec(html);
    if (!first) {
      return;
    }
    if (accept && !accept(first)) {
      from = first.index + 1;
      continue;
    }
    const matches = [first];
    const gaps: string[] = [];
    let at = first.index + first[0].length;
    for (const pattern of patterns.slice(1)) {
      pattern.lastIndex = at;
      const next = pattern.exec(html);
      if (!next) {
        return;
      }
      gaps.push(html.slice(at, next.index));
      matches.push(next);
      at = next.index + next[0].length;
    }
    yield { matches, gaps };
    from = at > first.index ? at : first.index + 1;
  }
}

/** The first run of {@link scanSequences}, or null. */
export function firstSequence(
  html: string,
  steps: RegExp[],
  accept?: (opening: RegExpExecArray) => boolean,
): HtmlSequence | null {
  for (const sequence of scanSequences(html, steps, accept)) {
    return sequence;
  }
  return null;
}

/**
 * The content of the first element opened by `open` and closed by `close` (the group of
 * `open([\s\S]*?)close`), or undefined.
 */
export function firstBetween(html: string, open: RegExp, close: RegExp): string | undefined {
  return firstSequence(html, [open, close])?.gaps[0];
}

/**
 * `html` without its tags, as `html.replace(/<[^>]*>/g, '')` gives it, in linear time: that pattern
 * scans to the end of the text from every `<` that no `>` follows. After the last `>` no tag can
 * close, so that tail is kept as it is and the pattern only runs on what precedes it, where every
 * attempt succeeds.
 */
export function stripTags(html: string): string {
  const end = html.lastIndexOf('>') + 1;
  return html.slice(0, end).replace(/<[^>]*>/g, '') + html.slice(end);
}
