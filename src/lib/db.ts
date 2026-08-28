import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { htmlToText } from './sanitize'
import { DEFAULT_SETTINGS, type Article, type Feed, type Settings } from './types'

const DB_VERSION = 2

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
  meta: {
    key: string
    value: unknown
  }
}

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
        if (oldVersion === 1) {
          // v2 added contentText. Backfill it so search stops matching markup
          // on articles that were stored before the field existed.
          let cursor = await tx.objectStore('articles').openCursor()
          while (cursor) {
            const article = cursor.value as Article
            if (article.contentText === undefined) {
              await cursor.update({ ...article, contentText: htmlToText(article.contentHtml) })
            }
            cursor = await cursor.continue()
          }
        }
      },
    })
  }
  return dbPromise
}

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
  const tx = database.transaction(['feeds', 'articles'], 'readwrite')
  const ids = await tx.objectStore('articles').index('by-feed').getAllKeys(feedId)
  await Promise.all([
    tx.objectStore('feeds').delete(feedId),
    ...ids.map((id) => tx.objectStore('articles').delete(id)),
    tx.done,
  ])
}

export async function loadArticles(): Promise<Article[]> {
  const all = await (await db()).getAll('articles')
  return all.sort((a, b) => b.publishedAt - a.publishedAt)
}

export async function saveArticles(articles: Article[]): Promise<void> {
  if (!articles.length) return
  const tx = (await db()).transaction('articles', 'readwrite')
  await Promise.all([...articles.map((a) => tx.store.put(a)), tx.done])
}

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

/** Drops the article body of every stored article — used when the user turns
 *  the local full-text archive off, so the promise in Settings is honoured. */
export async function dropArchivedBodies(): Promise<void> {
  const database = await db()
  const tx = database.transaction('articles', 'readwrite')
  let cursor = await tx.store.openCursor()
  const writes: Promise<unknown>[] = []
  while (cursor) {
    if (cursor.value.contentHtml || cursor.value.contentText) {
      writes.push(cursor.update({ ...cursor.value, contentHtml: '', contentText: '' }))
    }
    cursor = await cursor.continue()
  }
  await Promise.all([...writes, tx.done])
}
