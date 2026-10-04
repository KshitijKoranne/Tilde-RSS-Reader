import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from './db'
import type { FetchedDocument } from './fetcher'
import { StoreProvider, useStore } from './store'

// Stands in for the Mac shell's window, which exists only inside Tauri. The
// badge code never loads it in a browser, so nothing else here is affected.
const setBadgeCount = vi.fn(async (_count?: number) => {})
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setBadgeCount }) }))

/* The reader end to end, minus the network and the interface.
 *
 * fetcher.ts is the one place Tilde talks to the world, and the native build
 * already replaces it through window.__TILDE_NATIVE_FETCH__. These tests use
 * that same seam to serve canned feeds, so everything above it — refreshing,
 * grouping, storing, searching — runs exactly as it does in the app.
 */

const FEED_URL = 'https://example.test/feed.xml'
const OTHER_URL = 'https://other.test/feed.xml'

function feedXml(title: string, items: { id: string; title: string; body: string }[]): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel>
    <title>${title}</title><link>https://example.test/</link>
    ${items
      .map(
        (item) => `<item>
      <title>${item.title}</title>
      <link>https://example.test/${item.id}</link>
      <guid>${item.id}</guid>
      <description><![CDATA[<p>${item.body}</p>]]></description>
    </item>`,
      )
      .join('')}
  </channel></rss>`
}

const documents: Record<string, string> = {
  [FEED_URL]: feedXml('Example', [
    { id: 'one', title: 'The borrow checker', body: 'Ownership and lifetimes, explained slowly.' },
    { id: 'two', title: 'Bicycles', body: 'A long ride through the hills of Kent.' },
  ]),
  [OTHER_URL]: feedXml('Other', [
    { id: 'three', title: 'Sourdough', body: 'Flour, water, salt and a great deal of waiting.' },
  ]),
}

function serveFeeds(): void {
  window.__TILDE_NATIVE_FETCH__ = async (url: string): Promise<FetchedDocument> => {
    const text = documents[url]
    if (!text) throw new Error(`nothing at ${url}`)
    return { text, finalUrl: url, contentType: 'application/rss+xml' }
  }
}

/** Hands the store itself to the test, which is all these need from React. */
let store: ReturnType<typeof useStore>

function Probe() {
  store = useStore()
  return <span data-testid="ready">{String(store.ready)}</span>
}

async function boot() {
  render(
    <StoreProvider>
      <Probe />
    </StoreProvider>,
  )
  await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
}

async function emptyDatabase() {
  // Let db.ts open it first: it owns the schema, and a bare open() here would
  // create an empty database with none of the stores in it.
  await db.loadFeeds()
  const connection = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('tilde')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const names = [...connection.objectStoreNames]
  if (names.length) {
    await new Promise<void>((resolve, reject) => {
      const tx = connection.transaction(names, 'readwrite')
      for (const name of names) tx.objectStore(name).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  connection.close()
}

describe('the reader, end to end', () => {
  // Nothing registers this for us: the suite imports what it uses rather than
  // relying on vitest globals.
  afterEach(cleanup)

  beforeEach(async () => {
    serveFeeds()
    await emptyDatabase()
    await boot()
  })

  it('starts on the picker with nothing subscribed', () => {
    expect(store.feeds).toHaveLength(0)
    expect(store.articles).toHaveLength(0)
    expect(store.view).toBe('welcome')
  })

  it('subscribes, fetches and files a source under its group', async () => {
    await act(async () => void (await store.addFeed(FEED_URL, 'Technology')))

    expect(store.feeds[0].title).toBe('Example')
    expect(store.feeds[0].group).toBe('Technology')
    expect(store.articles).toHaveLength(2)
    expect(store.unreadCount).toBe(2)
    expect(store.groups.map((g) => g.name)).toEqual(['Technology'])
    expect(store.unreadByGroup.get('Technology')).toBe(2)
  })

  it('narrows the inbox to one group', async () => {
    await act(async () => void (await store.addFeed(FEED_URL, 'Technology')))
    await act(async () => void (await store.addFeed(OTHER_URL, 'Food')))

    await act(async () => store.go('inbox', null, 'Food'))
    expect(store.visible.map((a) => a.title)).toEqual(['Sourdough'])

    await act(async () => store.go('inbox', null, 'Technology'))
    expect(store.visible.map((a) => a.title).sort()).toEqual(['Bicycles', 'The borrow checker'])
  })

  it('moves a source between groups, and out of one', async () => {
    await act(async () => void (await store.addFeed(FEED_URL, 'Technology')))

    await act(async () => void (await store.setFeedGroup(FEED_URL, 'Programming')))
    expect(store.groups.map((g) => g.name)).toEqual(['Programming'])

    await act(async () => void (await store.setFeedGroup(FEED_URL, '')))
    expect(store.groups.map((g) => g.name)).toEqual([''])
  })

  it('folds a group shut and remembers that it did', async () => {
    await act(async () => void (await store.addFeed(FEED_URL, 'Technology')))
    await act(async () => store.toggleGroup('Technology'))
    expect(store.settings.collapsedGroups).toEqual(['Technology'])

    await act(async () => store.toggleGroup('Technology'))
    expect(store.settings.collapsedGroups).toEqual([])
  })

  it('keeps no article text in memory', async () => {
    await act(async () => void (await store.addFeed(FEED_URL, '')))
    // The whole point of the split: the list can be held all at once because
    // no record on it carries an article's text.
    for (const article of store.articles) {
      expect(article).not.toHaveProperty('contentHtml')
      expect(article).not.toHaveProperty('contentText')
      expect(article.bodyChars).toBeGreaterThan(0)
    }
  })

  describe('searching', () => {
    beforeEach(async () => {
      await act(async () => void (await store.addFeed(FEED_URL, 'Technology')))
      await act(async () => void (await store.addFeed(OTHER_URL, 'Food')))
    })

    const search = async (query: string) => {
      await act(async () => {
        store.go('search')
        store.setQuery(query)
      })
      await waitFor(() => expect(store.searching).toBe(false), { timeout: 2_000 })
      return store.visible.map((a) => a.title)
    }

    it('finds an article by a word only its body contains', async () => {
      expect(await search('lifetimes')).toEqual(['The borrow checker'])
    })

    it('finds an article by its title while the word is still being typed', async () => {
      expect(await search('bicy')).toEqual(['Bicycles'])
    })

    it('finds an article across every source at once', async () => {
      expect(await search('flour')).toEqual(['Sourdough'])
    })

    it('needs a phrase to actually be a phrase', async () => {
      expect(await search('salt and a great deal')).toEqual(['Sourdough'])
      expect(await search('salt and bicycles')).toEqual([])
    })

    it('finds nothing for a word nobody wrote', async () => {
      expect(await search('unobtainium')).toEqual([])
    })

    it('shows nothing at all for an empty query', async () => {
      expect(await search('   ')).toEqual([])
    })
  })

  describe('unsubscribing', () => {
    it('takes the articles with it and leaves the other source alone', async () => {
      await act(async () => void (await store.addFeed(FEED_URL, 'Technology')))
      await act(async () => void (await store.addFeed(OTHER_URL, 'Food')))

      await act(async () => void (await store.removeFeed(FEED_URL)))

      expect(store.feeds.map((f) => f.title)).toEqual(['Other'])
      expect(store.articles.map((a) => a.title)).toEqual(['Sourdough'])
      expect(store.groups.map((g) => g.name)).toEqual(['Food'])
    })
  })

  describe('the options that are off until asked for', () => {
    beforeEach(async () => {
      await act(async () => void (await store.addFeed(FEED_URL, '')))
      await act(async () => store.go('inbox'))
    })

    it('start switched off', () => {
      expect(store.settings.undoMarkAllRead).toBe(false)
      expect(store.settings.showAllHints).toBe(false)
      expect(store.settings.refreshOnFocus).toBe(false)
      expect(store.settings.dockBadge).toBe(false)
    })

    describe('undo for Mark all read', () => {
      it('offers nothing while the option is off', async () => {
        await act(async () => store.markAllRead())
        expect(store.unreadCount).toBe(0)
        // Only the "Following Example." left over from subscribing.
        expect(store.toast?.action).toBeUndefined()
        expect(store.toast?.message).not.toMatch(/^Marked/)
      })

      it('brings the articles back, here and on disk', async () => {
        await act(async () => store.update({ undoMarkAllRead: true }))
        await act(async () => store.markAllRead())
        expect(store.unreadCount).toBe(0)
        expect(store.toast?.message).toBe('Marked 2 articles read.')

        await act(async () => store.toast?.action?.run())
        expect(store.unreadCount).toBe(2)
        expect(store.toast).toBeNull()
        expect((await db.loadArticles()).every((a) => !a.read)).toBe(true)
      })

      it('leaves alone an article already marked unread since', async () => {
        await act(async () => store.update({ undoMarkAllRead: true }))
        await act(async () => store.markAllRead())
        const undo = store.toast?.action?.run
        const first = store.articles[0]
        await act(async () => store.setRead(first.id, false))

        await act(async () => undo?.())
        expect(store.unreadCount).toBe(2)
      })

      it('does not bring back an article whose source was unsubscribed', async () => {
        await act(async () => void (await store.addFeed(OTHER_URL, '')))
        await act(async () => store.update({ undoMarkAllRead: true }))
        await act(async () => store.markAllRead())
        const undo = store.toast?.action?.run

        await act(async () => void (await store.removeFeed(OTHER_URL)))
        await act(async () => undo?.())

        expect(store.articles.map((a) => a.title).sort()).toEqual(['Bicycles', 'The borrow checker'])
        expect((await db.loadArticles()).map((a) => a.title).sort()).toEqual([
          'Bicycles',
          'The borrow checker',
        ])
        expect(store.unreadCount).toBe(2)
      })
    })

    describe('refreshing when you come back', () => {
      let fetches = 0
      let clock = Date.now()

      beforeEach(() => {
        fetches = 0
        clock = Date.now()
        const serve = window.__TILDE_NATIVE_FETCH__!
        window.__TILDE_NATIVE_FETCH__ = (url) => {
          fetches += 1
          return serve(url)
        }
        vi.spyOn(Date, 'now').mockImplementation(() => clock)
      })
      afterEach(() => vi.restoreAllMocks())

      const comeBack = async (minutesAway: number) => {
        clock += minutesAway * 60_000
        await act(async () => void window.dispatchEvent(new Event('focus')))
        await act(async () => void (await new Promise((r) => setTimeout(r, 20))))
      }

      it('does nothing while the option is off', async () => {
        await comeBack(30)
        expect(fetches).toBe(0)
      })

      it('refreshes after a long time away', async () => {
        await act(async () => store.update({ refreshOnFocus: true }))
        await comeBack(6)
        expect(fetches).toBe(1)
      })

      it('does not refresh again for a quick return', async () => {
        await act(async () => store.update({ refreshOnFocus: true }))
        await comeBack(6)
        await comeBack(1)
        expect(fetches).toBe(1)
      })

      it('skips a return after only a moment away', async () => {
        await act(async () => store.update({ refreshOnFocus: true }))
        await comeBack(2)
        expect(fetches).toBe(0)
      })
    })

    describe('the Dock badge', () => {
      beforeEach(() => {
        setBadgeCount.mockClear()
        ;(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}
      })
      afterEach(() => {
        delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
      })

      it('is never touched while the option is off', async () => {
        await act(async () => store.setRead(store.articles[0].id, true))
        expect(setBadgeCount).not.toHaveBeenCalled()
      })

      it('shows the unread count, follows it, and clears when turned off', async () => {
        await act(async () => store.update({ dockBadge: true }))
        await waitFor(() => expect(setBadgeCount).toHaveBeenLastCalledWith(2))

        await act(async () => store.setRead(store.articles[0].id, true))
        await waitFor(() => expect(setBadgeCount).toHaveBeenLastCalledWith(1))

        await act(async () => store.update({ dockBadge: false }))
        await waitFor(() => expect(setBadgeCount).toHaveBeenLastCalledWith(undefined))
      })

      it('shows no badge at all when everything is read', async () => {
        await act(async () => store.update({ dockBadge: true }))
        await act(async () => store.markAllRead())
        await waitFor(() => expect(setBadgeCount).toHaveBeenLastCalledWith(undefined))
      })
    })
  })
})
