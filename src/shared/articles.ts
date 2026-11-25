/**
 * Leading articles ("Le vent du nord", "The Walking Dead") for the library organization: with the
 * option on, a name is filed under its first real word and the article goes to the end
 * ("Vent du nord (Le)"). Pure, shared by the main process (placing the files) and the settings page.
 * @module
 */

/** The articles offered the first time (`AppSettings.libraryArticles`), in French and English. */
export const DEFAULT_ARTICLES: readonly string[] = ['le', 'la', 'les', "l'", 'un', 'une', 'des', "d'", 'the', 'a', 'an'];

/** Most articles the list may hold. */
export const MAX_ARTICLES = 50;
/** Longest article, in characters. */
export const MAX_ARTICLE_LENGTH = 12;

/** Letters, then letters, spaces, hyphens and apostrophes: `le`, `l'`, `de la`. */
const ARTICLE_PATTERN = /^\p{L}[\p{L}'’ -]*$/u;

/** Whether `value` is a usable article: 1 to {@link MAX_ARTICLE_LENGTH} characters, no leading or trailing space. */
export function isArticle(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_ARTICLE_LENGTH &&
    value === value.trim() &&
    ARTICLE_PATTERN.test(value)
  );
}

/** Whether `value` is a list of at most {@link MAX_ARTICLES} usable articles. */
export function isArticleList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_ARTICLES && value.every(isArticle);
}

/** Case and apostrophe style don't matter when comparing an article with the start of a name. */
const fold = (text: string) => text.toLowerCase().replaceAll('’', "'");

/**
 * `name` with its leading article moved to the end in parentheses, the remaining first letter upper-cased:
 * `Le vent du nord` → `Vent du nord (Le)`, `L'été` → `Été (L')`. The article is written as it was in the name.
 * An article ending with an apostrophe (`l'`, `d'`) is attached to the next word; any other one must be followed
 * by a space. The longest matching article wins. A name that is only an article, or that starts with none of
 * `articles`, is returned unchanged.
 */
export function moveArticleToEnd(name: string, articles: readonly string[]): string {
  const trimmed = name.trim();
  const folded = fold(trimmed);
  const byLength = [...articles].filter((article) => article !== '').sort((a, b) => b.length - a.length);
  for (const article of byLength) {
    const wanted = fold(article);
    if (!folded.startsWith(wanted)) continue;
    const attached = wanted.endsWith("'");
    const rest = trimmed.slice(article.length);
    if (!attached && !/^\s/.test(rest)) continue;
    const word = rest.trim();
    if (word === '') continue;
    const written = trimmed.slice(0, article.length);
    return `${word[0].toUpperCase()}${word.slice(1)} (${written})`;
  }
  return trimmed;
}

/** The list as the settings page shows it: the articles separated by commas. */
export function formatArticleList(articles: readonly string[]): string {
  return articles.join(', ');
}

/**
 * Reads what the user typed (articles separated by commas): spaces around each are dropped, empty ones and
 * duplicates (ignoring case) removed. Returns null when an article is unusable or there are too many.
 */
export function parseArticleList(text: string): string[] | null {
  const seen = new Set<string>();
  const articles: string[] = [];
  for (const part of text.split(',')) {
    const article = part.trim();
    if (article === '' || seen.has(fold(article))) continue;
    seen.add(fold(article));
    articles.push(article);
  }
  return isArticleList(articles) ? articles : null;
}
