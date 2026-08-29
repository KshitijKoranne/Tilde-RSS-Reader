/* Everything Tilde keeps, and the only file that talks to IndexedDB.
 *
 * The archive is the point of the app — an article you read last year is still
 * there — so it only ever grows, and the storage has to be arranged for that
 * rather than for the first fortnight. Three rules follow from it:
 *
 *   Article records are small and are all held in memory. Their text is not:
 *   bodies live in their own table and are read one at a time, when opened.
 *
 *   Search reads an index, never the archive. Every article's text is reduced
 *   to its terms once, when it is stored, so a search costs the length of the
 *   answer instead of the length of everything ever kept.
 *
 *   Nothing is deleted unless the reader asked for it. Retention is off by
 *   default, and even switched on it never touches a saved article.
 */

import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'
import { htmlToText } from './sanitize'
import { indexTerms, addDoc, intersect, prefixRange, removeDocs, union, type ParsedQuery } from './search'
import { DEFAULT_SETTINGS, type Article, type ArticleBody, type Feed, type Settings } from './types'

const DB_VERSION = 3

/** One term of the index and every article it appears in, sorted. */
interface Term {
  term: string
  docs: number[]
}

interface TildeDB extends DBSchema {
  feeds: {
    key: string
    value: Feed
  }
  articles: {
    key: string
    value: Article
    indexes: { 'by-feed': string; 'by-date': number }
  }
  bodies: {
    key: string
    value: ArticleBody
  }
  terms: {
    key: string
    value: Term
  }
  meta: {
    key: string
    value: unknown
  }
}

/** Every store, for the transactions that have to touch an article's whole self. */
const ALL_ARTICLE_STORES = ['articles', 'bodies', 'terms'] as const
type ArticleTx = IDBPTransaction<TildeDB, typeof ALL_ARTICLE_STORES, 'readwrite'>

let dbPromise: Promise<IDBPDatabase<TildeDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<TildeDB>('tilde', DB_VERSION, {
      async upgrade(database, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          database.createObjectStore('feeds', { keyPath: 'id' })
          const articles = database.createObjectStore('articles', { keyPath: 'id' })
          articles.createIndex('by-feed', 'feedId')
          articles.createIndex('by-date', 'publishedAt')
          database.createObjectStore('meta')
        }
        if (oldVersion < 3) {
          database.createObjectStore('bodies', { keyPath: 'id' })
          database.createObjectStore('terms', { keyPath: 'term' })
          await migrateToSplitBodies(tx as unknown as ArticleTx)
        }
      },
    })
  }
  return dbPromise
}

/* v3 moved article text out of the article record and built the term index.
 *
 * This runs once, inside the upgrade, so no part of the app can read a half
 * migrated archive. Feeds gain their group field here too — an absent group is
 * the top level, which is exactly where every existing source belongs.
 *
 * It also subsumes the v2 backfill it replaced: v1 stored only contentHtml, so
 * an article that arrives here without text has its text derived from markup,
 * which is what that step did and all it did. */
async function migrateToSplitBodies(tx: ArticleTx): Promise<void> {
  const feeds = (tx as unknown as IDBPTransaction<TildeDB, ['feeds'], 'readwrite'>).objectStore('feeds')
  let feedCursor = await feeds.openCursor()
  while (feedCursor) {
    if (feedCursor.value.group === undefined) {
      await feedCursor.update({ ...feedCursor.value, group: '' })
    }
    feedCursor = await feedCursor.continue()
  }

  const bodies = tx.objectStore('bodies')
  const postings = new Map<string, number[]>()
  let seq = 1

  let cursor = await tx.objectStore('articles').openCursor()
  while (cursor) {
    const stored = cursor.value as Article & { contentHtml?: string; contentText?: string }
    const html = stored.contentHtml ?? ''
    const text = stored.contentText ?? (html ? htmlToText(html) : '')

    if (html || text) await bodies.put({ id: stored.id, html, text })
    for (const term of indexTerms(`${stored.title} ${text}`)) {
      postings.set(term, addDoc(postings.get(term) ?? [], seq))
    }

    const { contentHtml: _html, contentText: _text, ...rest } = stored
    await cursor.update({ ...rest, seq, bodyChars: text.length })
    seq += 1
    cursor = await cursor.continue()
  }

  const terms = tx.objectStore('terms')
  for (const [term, docs] of postings) await terms.put({ term, docs })
}

/* ── feeds ───────────────────────────────────────────────────────────────── */

export async function loadFeeds(): Promise<Feed[]> {
  const all = await (await db()).getAll('feeds')
  return all.sort((a, b) => a.title.localeCompare(b.title))
}

export async function saveFeed(feed: Feed): Promise<void> {
  await (await db()).put('feeds', feed)
}

export async function saveFeeds(feeds: Feed[]): Promise<void> {
  const tx = (await db()).transaction('feeds', 'readwrite')
  await Promise.all([...feeds.map((f) => tx.store.put(f)), tx.done])
}

export async function deleteFeed(feedId: string): Promise<void> {
  const database = await db()
  const tx = database.transaction(['feeds', 'articles', 'bodies', 'terms'], 'readwrite')
  const store = tx.objectStore('articles')
  const doomed = await store.index('by-feed').getAll(feedId)

  await tx.objectStore('feeds').delete(feedId)
  for (const article of doomed) {
    await store.delete(article.id)
    await tx.objectStore('bodies').delete(article.id)
  }
  await deindex(tx as unknown as ArticleTx, new Set(doomed.map((a) => a.seq)))
  await tx.done
}

/* ── articles ────────────────────────────────────────────────────────────── */

export async function loadArticles(): Promise<Article[]> {
  const all = await (await db()).getAll('articles')
  return all.sort((a, b) => b.publishedAt - a.publishedAt)
}

/** Metadata only — read, starred, and the rest. Never touches a body. */
export async function saveArticles(articles: Article[]): Promise<void> {
  if (!articles.length) return
  const tx = (await db()).transaction('articles', 'readwrite')
  await Promise.all([...articles.map((a) => tx.store.put(a)), tx.done])
}

export interface Incoming {
  article: Article
  /** Null when the archive is switched off: nothing is written down. */
  body: ArticleBody | null
}

/** Writes fresh articles, their text and their index entries as one change. */
export async function saveIncoming(incoming: Incoming[]): Promise<void> {
  if (!incoming.length) return
  const tx = (await db()).transaction(ALL_ARTICLE_STORES, 'readwrite')
  const articles = tx.objectStore('articles')
  const bodies = tx.objectStore('bodies')
  const postings = new Map<string, number[]>()

  for (const { article, body } of incoming) {
    await articles.put(article)
    if (!body) continue
    await bodies.put(body)
    for (const term of indexTerms(`${article.title} ${body.text}`)) {
      postings.set(term, addDoc(postings.get(term) ?? [], article.seq))
    }
  }

  await writePostings(tx as unknown as ArticleTx, postings)
  await tx.done
}

/** The text of one article, read when it is opened rather than at boot. */
export async function loadBody(id: string): Promise<ArticleBody | null> {
  return (await (await db()).get('bodies', id)) ?? null
}

/** Replaces one article's text — what "Read the full article" leaves behind. */
export async function saveBody(article: Article, body: ArticleBody): Promise<void> {
  const tx = (await db()).transaction(ALL_ARTICLE_STORES, 'readwrite')
  await tx.objectStore('articles').put(article)
  await tx.objectStore('bodies').put(body)

  const postings = new Map<string, number[]>()
  for (const term of indexTerms(`${article.title} ${body.text}`)) {
    postings.set(term, addDoc(postings.get(term) ?? [], article.seq))
  }
  await writePostings(tx as unknown as ArticleTx, postings)
  await tx.done
}

/* ── the term index ──────────────────────────────────────────────────────── */

async function writePostings(tx: ArticleTx, postings: Map<string, number[]>): Promise<void> {
  const terms = tx.objectStore('terms')
  for (const [term, docs] of postings) {
    const existing = await terms.get(term)
    if (!existing) {
      await terms.put({ term, docs })
      continue
    }
    let merged = existing.docs
    for (const seq of docs) merged = addDoc(merged, seq)
    await terms.put({ term, docs: merged })
  }
}

/* Forgetting articles means walking the whole index, because a term does not
 * record where it came from. That is the right trade: unsubscribing happens
 * once in a while, searching happens constantly, and only one of the two is
 * allowed to be slow. */
async function deindex(tx: ArticleTx, gone: Set<number>): Promise<void> {
  if (!gone.size) return
  let cursor = await tx.objectStore('terms').openCursor()
  while (cursor) {
    const docs = removeDocs(cursor.value.docs, gone)
    if (docs.length !== cursor.value.docs.length) {
      if (docs.length) await cursor.update({ ...cursor.value, docs })
      else await cursor.delete()
    }
    cursor = await cursor.continue()
  }
}

/** Terms are read only for the words asked about, never for the whole archive. */
export async function searchIndex(query: ParsedQuery, prefixLimit = 400): Promise<number[] | null> {
  if (!query.terms.length && !query.prefix) return null

  const tx = (await db()).transaction('terms', 'readonly')
  const store = tx.objectStore('terms')

  const lists: number[][] = []
  for (const term of query.terms) {
    const found = await store.get(term)
    // One word nobody has ever written settles the whole query.
    if (!found?.docs.length) return []
    lists.push(found.docs)
  }

  if (query.prefix) {
    const [low, high] = prefixRange(query.prefix)
    const matches = await store.getAll(IDBKeyRange.bound(low, high), prefixLimit)
    const merged = union(matches.map((t) => t.docs))
    if (!merged.length) return []
    lists.push(merged)
  }

  await tx.done

  // Narrowest list first: the intersection can only shrink from there.
  lists.sort((a, b) => a.length - b.length)
  return lists.reduce((found, list) => intersect(found, list))
}

/** The text of a handful of candidates, for confirming a phrase. */
export async function loadTexts(ids: string[]): Promise<Map<string, string>> {
  const tx = (await db()).transaction('bodies', 'readonly')
  const texts = new Map<string, string>()
  for (const id of ids) {
    const body = await tx.store.get(id)
    if (body) texts.set(id, body.text)
  }
  await tx.done
  return texts
}

/* ── settings and flags ──────────────────────────────────────────────────── */

export async function loadSettings(): Promise<Settings> {
  const stored = (await (await db()).get('meta', 'settings')) as Partial<Settings> | undefined
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await db()).put('meta', settings, 'settings')
}

export async function getFlag(key: string): Promise<boolean> {
  return Boolean(await (await db()).get('meta', key))
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  await (await db()).put('meta', value, key)
}

/* ── forgetting ──────────────────────────────────────────────────────────── */

/** Drops the text of every stored article — used when the reader turns the
 *  local archive off, so the promise made in Settings is honoured. */
export async function dropArchivedBodies(): Promise<void> {
  const tx = (await db()).transaction(ALL_ARTICLE_STORES, 'readwrite')
  await tx.objectStore('bodies').clear()
  await tx.objectStore('terms').clear()

  let cursor = await tx.objectStore('articles').openCursor()
  while (cursor) {
    if (cursor.value.bodyChars) await cursor.update({ ...cursor.value, bodyChars: 0 })
    cursor = await cursor.continue()
  }
  await tx.done
}

/* Retention. Only articles that have been read, are not saved, and are older
 * than the cutoff are let go — and they go completely, record and text and
 * index entries together, so nothing is left half-remembered. */
export async function pruneArticles(before: number): Promise<string[]> {
  if (!before) return []
  const tx = (await db()).transaction(ALL_ARTICLE_STORES, 'readwrite')
  const articles = tx.objectStore('articles')
  const doomed: Article[] = []

  let cursor = await articles.index('by-date').openCursor(IDBKeyRange.upperBound(before))
  while (cursor) {
    if (cursor.value.read && !cursor.value.starred) doomed.push(cursor.value)
    cursor = await cursor.continue()
  }

  for (const article of doomed) {
    await articles.delete(article.id)
    await tx.objectStore('bodies').delete(article.id)
  }
  await deindex(tx as unknown as ArticleTx, new Set(doomed.map((a) => a.seq)))
  await tx.done

  return doomed.map((a) => a.id)
}
