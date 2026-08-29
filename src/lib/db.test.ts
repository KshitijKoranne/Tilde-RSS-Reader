import { beforeEach, describe, expect, it } from 'vitest'
import * as db from './db'
import { parseQuery } from './search'
import type { Article, ArticleBody, Feed } from './types'

/* db.ts holds one connection for the life of the module, so tests empty the
 * stores between them rather than tearing the database down underneath it. */
async function empty(): Promise<void> {
  await db.loadFeeds()
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('tilde')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const names = [...connection.objectStoreNames]
  await new Promise<void>((resolve, reject) => {
    const tx = connection.transaction(names, 'readwrite')
    for (const name of names) tx.objectStore(name).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  connection.close()
}

const feed = (id: string, group = ''): Feed => ({
  id,
  url: id,
  siteUrl: 'https://example.test/',
  title: id,
  addedAt: 0,
  group,
  lastFetchedAt: 0,
  lastError: '',
})

let seq = 0
const article = (id: string, feedId: string, extra: Partial<Article> = {}): Article => ({
  id,
  seq: ++seq,
  feedId,
  feedTitle: feedId,
  guid: id,
  title: id,
  link: `https://example.test/${id}`,
  author: '',
  publishedAt: 1_000,
  excerpt: '',
  bodyChars: 0,
  read: false,
  starred: false,
  fetchedAt: 0,
  ...extra,
})

const body = (id: string, text: string): ArticleBody => ({ id, html: `<p>${text}</p>`, text })

describe('storing and finding articles', () => {
  beforeEach(async () => {
    seq = 0
    await empty()
  })

  it('keeps the body out of the article record', async () => {
    const one = article('a', 'f', { bodyChars: 11 })
    await db.saveIncoming([{ article: one, body: body('a', 'hello world') }])

    const [loaded] = await db.loadArticles()
    expect(loaded).not.toHaveProperty('contentHtml')
    expect(loaded.bodyChars).toBe(11)
    expect((await db.loadBody('a'))?.text).toBe('hello world')
  })

  it('finds an article by a word in its body', async () => {
    await db.saveIncoming([{ article: article('a', 'f'), body: body('a', 'the borrow checker') }])
    expect(await db.searchIndex(parseQuery('borrow '))).toEqual([1])
  })

  it('finds an article by the start of a word still being typed', async () => {
    await db.saveIncoming([{ article: article('a', 'f'), body: body('a', 'the borrow checker') }])
    expect(await db.searchIndex(parseQuery('bor'))).toEqual([1])
  })

  it('requires every word of a query to be present', async () => {
    await db.saveIncoming([
      { article: article('a', 'f'), body: body('a', 'rust and its borrow checker') },
      { article: article('b', 'f'), body: body('b', 'rust never sleeps') },
    ])
    expect(await db.searchIndex(parseQuery('rust borrow '))).toEqual([1])
  })

  it('settles a query containing a word nobody has written', async () => {
    await db.saveIncoming([{ article: article('a', 'f'), body: body('a', 'rust') }])
    expect(await db.searchIndex(parseQuery('rust unobtainium '))).toEqual([])
  })

  it('has nothing to say about a query with no words in it', async () => {
    expect(await db.searchIndex(parseQuery('  '))).toBeNull()
  })

  it('finds an article by a word in its title alone', async () => {
    await db.saveIncoming([
      { article: article('a', 'f', { title: 'Bicycles' }), body: body('a', 'nothing relevant') },
    ])
    expect(await db.searchIndex(parseQuery('bicycles '))).toEqual([1])
  })

  it('indexes nothing for an article stored without a body', async () => {
    await db.saveIncoming([{ article: article('a', 'f', { title: 'Silent' }), body: null }])
    expect(await db.searchIndex(parseQuery('silent '))).toEqual([])
  })

  it('reads back the text of the candidates a phrase check asks for', async () => {
    await db.saveIncoming([
      { article: article('a', 'f'), body: body('a', 'one') },
      { article: article('b', 'f'), body: body('b', 'two') },
    ])
    const texts = await db.loadTexts(['a', 'b', 'missing'])
    expect([...texts.entries()]).toEqual([['a', 'one'], ['b', 'two']])
  })

  it('replaces the text when the full article is fetched, and indexes it', async () => {
    const thin = article('a', 'f', { bodyChars: 3 })
    await db.saveIncoming([{ article: thin, body: body('a', 'stub') }])

    const full = { ...thin, bodyChars: 20 }
    await db.saveBody(full, body('a', 'the whole article at last'))

    expect((await db.loadBody('a'))?.text).toBe('the whole article at last')
    expect(await db.searchIndex(parseQuery('whole '))).toEqual([1])
    expect((await db.loadArticles())[0].bodyChars).toBe(20)
  })
})

describe('letting go', () => {
  beforeEach(async () => {
    seq = 0
    await empty()
  })

  it('takes a feed’s articles, bodies and index entries with it', async () => {
    await db.saveFeed(feed('keep'))
    await db.saveFeed(feed('drop'))
    await db.saveIncoming([
      { article: article('a', 'keep'), body: body('a', 'kept words') },
      { article: article('b', 'drop'), body: body('b', 'doomed words') },
    ])

    await db.deleteFeed('drop')

    expect((await db.loadFeeds()).map((f) => f.id)).toEqual(['keep'])
    expect((await db.loadArticles()).map((a) => a.id)).toEqual(['a'])
    expect(await db.loadBody('b')).toBeNull()
    expect(await db.searchIndex(parseQuery('doomed '))).toEqual([])
    expect(await db.searchIndex(parseQuery('kept '))).toEqual([1])
  })

  it('drops every body when the archive is switched off', async () => {
    await db.saveIncoming([{ article: article('a', 'f', { bodyChars: 5 }), body: body('a', 'words') }])
    await db.dropArchivedBodies()

    expect(await db.loadBody('a')).toBeNull()
    expect((await db.loadArticles())[0].bodyChars).toBe(0)
    expect(await db.searchIndex(parseQuery('words '))).toEqual([])
  })

  describe('retention', () => {
    const OLD = 1_000
    const NEW = 9_000

    beforeEach(async () => {
      await db.saveIncoming([
        { article: article('old-read', 'f', { publishedAt: OLD, read: true }), body: body('old-read', 'alpha') },
        { article: article('old-unread', 'f', { publishedAt: OLD }), body: body('old-unread', 'beta') },
        { article: article('old-saved', 'f', { publishedAt: OLD, read: true, starred: true }), body: body('old-saved', 'gamma') },
        { article: article('new-read', 'f', { publishedAt: NEW, read: true }), body: body('new-read', 'delta') },
      ])
    })

    it('lets go only of what has been read and not saved', async () => {
      expect(await db.pruneArticles(5_000)).toEqual(['old-read'])
      expect((await db.loadArticles()).map((a) => a.id).sort()).toEqual([
        'new-read',
        'old-saved',
        'old-unread',
      ])
    })

    it('takes the text and the index entry with it', async () => {
      await db.pruneArticles(5_000)
      expect(await db.loadBody('old-read')).toBeNull()
      expect(await db.searchIndex(parseQuery('alpha '))).toEqual([])
      expect(await db.searchIndex(parseQuery('gamma '))).toEqual([3])
    })

    it('does nothing at all when retention is off', async () => {
      expect(await db.pruneArticles(0)).toEqual([])
      expect(await db.loadArticles()).toHaveLength(4)
    })
  })
})

describe('settings', () => {
  it('fills in anything a stored settings record predates', async () => {
    await empty()
    await db.saveSettings({ font: 'Archivo' } as never)
    const loaded = await db.loadSettings()
    expect(loaded.font).toBe('Archivo')
    expect(loaded.retention).toBe('Keep everything')
    expect(loaded.collapsedGroups).toEqual([])
  })
})
