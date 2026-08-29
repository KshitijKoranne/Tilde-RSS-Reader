/* The pure half of full-text search: turning text into terms, and turning what
 * a person typed into something the term index can answer.
 *
 * Tilde's promise is that an article you read a year ago is still findable, so
 * the archive only ever grows. Scanning it end to end on every keystroke works
 * for a month and then quietly stops working, which is the worst way for it to
 * fail. Instead every article's text is reduced to its terms once, when it is
 * stored, and search reads only the terms it was asked about.
 *
 * Nothing here touches the database — db.ts does that, and this file stays
 * plain functions so the matching rules can be tested on their own.
 */

/** Longer than any real term; ends a prefix range at the end of the alphabet. */
const RANGE_END = '￿'

/** Beyond this an article contributes nothing new to the index — the first few
 *  thousand words already carry every term worth searching for. */
const MAX_INDEXED_CHARS = 20_000

/** One-letter terms match nearly everything and cost the most to store. */
const MIN_TERM_LENGTH = 2

/* Accents are folded so that a search for "cafe" finds "café", and the same
 * folding is applied to the query — the index and the question have to agree
 * on what a word looks like or neither will ever match the other. */
export function normalizeText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
}

/** Runs of letters and digits, in order, with everything else as a separator. */
export function tokenize(text: string): string[] {
  return normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? []
}

/** The terms an article is filed under: each one once, and not endlessly many. */
export function indexTerms(text: string): string[] {
  const terms = new Set<string>()
  for (const token of tokenize(text.slice(0, MAX_INDEXED_CHARS))) {
    if (token.length >= MIN_TERM_LENGTH) terms.add(token)
  }
  return [...terms]
}

export interface ParsedQuery {
  /** Terms that must all be present, matched whole. */
  terms: string[]
  /** The word still being typed, matched by its beginning. Empty if none. */
  prefix: string
  /* Set when the query spans more than one word. The index can only say which
   * articles contain all of the words; whether they sit next to each other in
   * that order is a question only the text itself can answer, so a phrase is
   * confirmed against the article afterwards. This is what keeps searching for
   * "the long now" from returning everything containing "the". */
  phrase: string
  /** True when there is nothing here worth asking the index. */
  empty: boolean
}

export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim()
  const tokens = tokenize(trimmed)
  /* A trailing separator means the last word is finished rather than half
   * typed, so this has to look at what was actually typed — trimming first
   * would hide the space that carries the whole distinction. */
  const stillTyping = tokens.length > 0 && /[\p{L}\p{N}]$/u.test(raw)

  const terms = stillTyping ? tokens.slice(0, -1) : tokens
  const prefix = stillTyping ? tokens[tokens.length - 1] : ''
  const normalized = normalizeText(trimmed)

  return {
    terms: terms.filter((t) => t.length >= MIN_TERM_LENGTH),
    prefix,
    phrase: tokens.length > 1 ? normalized : '',
    empty: !trimmed,
  }
}

/** The key range covering every term starting with the given prefix. */
export function prefixRange(prefix: string): [string, string] {
  return [prefix, prefix + RANGE_END]
}

/* Postings lists are kept sorted so they can be intersected in one pass, which
 * is what makes a two-word search cost the length of the shorter list rather
 * than the product of both. */
export function addDoc(docs: number[], seq: number): number[] {
  const at = lowerBound(docs, seq)
  if (docs[at] === seq) return docs
  return [...docs.slice(0, at), seq, ...docs.slice(at)]
}

export function removeDocs(docs: number[], gone: Set<number>): number[] {
  return docs.filter((seq) => !gone.has(seq))
}

function lowerBound(docs: number[], seq: number): number {
  let low = 0
  let high = docs.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (docs[mid] < seq) low = mid + 1
    else high = mid
  }
  return low
}

export function intersect(a: number[], b: number[]): number[] {
  const out: number[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(a[i])
      i += 1
      j += 1
    } else if (a[i] < b[j]) i += 1
    else j += 1
  }
  return out
}

export function union(lists: number[][]): number[] {
  const all = new Set<number>()
  for (const list of lists) for (const seq of list) all.add(seq)
  return [...all].sort((x, y) => x - y)
}

/** Whether an article's own text really contains the phrase that was typed. */
export function matchesPhrase(text: string, phrase: string): boolean {
  return !phrase || normalizeText(text).includes(phrase)
}
