import { describe, expect, it } from 'vitest'
import { parseQuery } from './search'

/* The v2 shape, as it exists on the machine of anyone who has been reading
 * with Tilde until now: feeds with no group, and article records carrying
 * their own text. This file builds one by hand and then lets db.ts open it,
 * which is the only way to find out whether the upgrade holds.
 *
 * It runs in its own file because vitest gives each file a fresh module
 * registry — db.ts must not have opened the database before this point. */
function buildV2Database(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('tilde', 2)

    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('feeds', { keyPath: 'id' })
      const articles = database.createObjectStore('articles', { keyPath: 'id' })
      articles.createIndex('by-feed', 'feedId')
      articles.createIndex('by-date', 'publishedAt')
      database.createObjectStore('meta')
    }

    request.onsuccess = () => {
      const database = request.result
      const tx = database.transaction(['feeds', 'articles'], 'readwrite')

      tx.objectStore('feeds').put({
        id: 'https://example.test/feed',
        url: 'https://example.test/feed',
        siteUrl: 'https://example.test/',
        title: 'Example',
        addedAt: 1,
        lastFetchedAt: 1,
        lastError: '',
      })

      const articles = tx.objectStore('articles')
      articles.put({
        id: 'a',
        feedId: 'https://example.test/feed',
        feedTitle: 'Example',
        guid: 'a',
        title: 'The borrow checker',
        link: 'https://example.test/a',
        author: 'Ada',
        publishedAt: 2_000,
        excerpt: 'About lifetimes',
        contentHtml: '<p>Ownership and lifetimes explained.</p>',
        contentText: 'Ownership and lifetimes explained.',
        read: true,
        starred: false,
        fetchedAt: 2_000,
      })
      // Stored back when v1 was current: markup, and no contentText at all.
      articles.put({
        id: 'b',
        feedId: 'https://example.test/feed',
        feedTitle: 'Example',
        guid: 'b',
        title: 'Older entry',
        link: 'https://example.test/b',
        author: '',
        publishedAt: 1_000,
        excerpt: '',
        contentHtml: '<p>Written before contentText existed.</p>',
        read: false,
        starred: true,
        fetchedAt: 1_000,
      })

      tx.oncomplete = () => {
        database.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }

    request.onerror = () => reject(request.error)
  })
}

describe('upgrading an archive written by the previous version', () => {
  it('carries everything across without losing an article', async () => {
    await buildV2Database()
    const db = await import('./db')

    const feeds = await db.loadFeeds()
    const articles = await db.loadArticles()

    expect(feeds).toHaveLength(1)
    expect(articles.map((a) => a.id)).toEqual(['a', 'b'])

    // Feeds gain a group, and the top level is where they all belong.
    expect(feeds[0].group).toBe('')

    // Read and saved state survive; nothing is silently marked or unmarked.
    expect(articles.find((a) => a.id === 'a')?.read).toBe(true)
    expect(articles.find((a) => a.id === 'b')?.starred).toBe(true)

    // The text moves out of the record and into its own table.
    expect(articles[0]).not.toHaveProperty('contentHtml')
    expect((await db.loadBody('a'))?.html).toContain('Ownership')
    expect(articles.find((a) => a.id === 'a')?.bodyChars).toBe(
      'Ownership and lifetimes explained.'.length,
    )

    // An article stored before contentText existed has its text derived, which
    // is what the upgrade this one replaced used to do on its own.
    expect((await db.loadBody('b'))?.text).toBe('Written before contentText existed.')

    // Every article is given a number, and no two share one.
    const numbers = articles.map((a) => a.seq)
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(numbers.every((n) => n > 0)).toBe(true)

    // And the archive is searchable the moment the upgrade finishes, without
    // anyone having to refresh a feed first.
    const found = await db.searchIndex(parseQuery('lifetimes '))
    expect(found).toEqual([articles.find((a) => a.id === 'a')!.seq])
    expect(await db.searchIndex(parseQuery('borrow '))).toEqual([
      articles.find((a) => a.id === 'a')!.seq,
    ])
  })
})
