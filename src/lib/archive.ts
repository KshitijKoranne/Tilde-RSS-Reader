/* Searching everything you have read.
 *
 * An article is found two ways at once, because its parts are not alike.
 *
 * Title, source, author and summary are short and are already in memory, so
 * they are matched here by plain substring — which is what lets half a word
 * find an article while you are still typing it, and what lets a fragment from
 * the middle of a title match at all.
 *
 * Bodies cannot work that way. Reading a year of articles back on every
 * keystroke is the one thing an archive that only grows must never do, so they
 * are matched through the term index instead: the index says which articles
 * contain the words, and only the few likeliest are read back to confirm that
 * the words sit together in the order they were typed.
 */

import * as db from './db'
import { matchesPhrase, normalizeText, parseQuery } from './search'
import type { Article } from './types'

/* A phrase has to be confirmed against the article's own text, which means
 * reading those articles back. Recent ones are read first and the tail is left
 * alone — nobody scrolls past four hundred matches to find the right one. */
const PHRASE_CANDIDATES = 400

/** Normalised metadata per article, so a keystroke does not re-fold the lot. */
const haystacks = new Map<string, string>()

function haystackOf(article: Article): string {
  const held = haystacks.get(article.id)
  if (held !== undefined) return held
  const made = normalizeText(
    `${article.title} ${article.feedTitle} ${article.author} ${article.excerpt}`,
  )
  haystacks.set(article.id, made)
  return made
}

/** Called when articles are let go, so their metadata goes with them. */
export function forgetHaystacks(ids: Iterable<string>): void {
  for (const id of ids) haystacks.delete(id)
}

/** The ids of every match, newest first. */
export async function searchArchive(articles: Article[], raw: string): Promise<string[]> {
  const query = parseQuery(raw)
  if (query.empty) return []

  const needle = normalizeText(raw.trim())
  const found = new Map<string, Article>()
  for (const article of articles) {
    if (haystackOf(article).includes(needle)) found.set(article.id, article)
  }

  const seqs = await db.searchIndex(query)
  if (seqs?.length) {
    const bySeq = new Map(articles.map((a) => [a.seq, a]))
    let hits = seqs.map((n) => bySeq.get(n)).filter((a): a is Article => Boolean(a))
    hits.sort((a, b) => b.publishedAt - a.publishedAt)

    /* The index knows which articles contain every word, not whether those
     * words sit together. Only the article itself can answer that, so the
     * likeliest candidates are read back and checked. */
    if (query.phrase) {
      const candidates = hits.slice(0, PHRASE_CANDIDATES)
      const texts = await db.loadTexts(candidates.map((a) => a.id))
      hits = candidates.filter((a) => matchesPhrase(texts.get(a.id) ?? '', query.phrase))
    }

    for (const article of hits) found.set(article.id, article)
  }

  return [...found.values()].sort((a, b) => b.publishedAt - a.publishedAt).map((a) => a.id)
}
