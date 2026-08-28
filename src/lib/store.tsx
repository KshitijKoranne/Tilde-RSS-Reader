import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as db from './db'
import { extractArticle } from './extract'
import { makeFeed, refreshFeed, resolveFeed, toArticles } from './feeds'
import { writeGlance } from './glance'
import { downloadOpml, parseOpml } from './opml'
import { DEFAULT_SETTINGS, type Article, type Feed, type Settings, type View } from './types'

const REFRESH_CONCURRENCY = 4
const AUTO_REFRESH_MS = 15 * 60 * 1000

export interface Toast {
  message: string
  tone: 'info' | 'error'
}

interface TildeStore {
  ready: boolean
  feeds: Feed[]
  articles: Article[]
  settings: Settings

  view: View
  feedId: string | null
  query: string
  selectedId: string | null
  showAdd: boolean
  zen: boolean
  refreshing: boolean
  busy: boolean
  toast: Toast | null

  /** Articles for the current view, in the order the list shows them. */
  visible: Article[]
  selected: Article | null
  unreadCount: number
  savedCount: number
  unreadByFeed: Map<string, number>

  go(view: View, feedId?: string | null): void
  step(delta: number): void
  open(id: string): void
  setQuery(query: string): void

  setRead(id: string, read: boolean): void
  toggleStar(id: string): void
  markAllRead(): void
  /** Fetches the linked page and stores its readable part. Throws on failure
   *  so the caller can show the reason where the reader is looking. */
  loadFullText(id: string): Promise<void>

  addFeed(input: string): Promise<void>
  removeFeed(id: string): Promise<void>
  refreshAll(): Promise<void>
  importOpml(text: string): Promise<void>
  exportOpml(): void

  update(patch: Partial<Settings>): void
  setShowAdd(show: boolean): void
  setZen(zen: boolean): void
  notify(message: string, tone?: Toast['tone']): void
}

const StoreContext = createContext<TildeStore | null>(null)

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** Runs tasks with a cap, so refreshing twenty feeds does not open twenty
 *  sockets at once. Never rejects — each result carries its own outcome. */
async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await run(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [view, setView] = useState<View>('inbox')
  const [feedId, setFeedId] = useState<string | null>(null)
  const [query, setQueryState] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [zen, setZen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)

  /* Articles marked read while you are still looking at them. Without this the
   * row would vanish mid-sentence, since the inbox only lists unread items.
   * Cleared whenever the list itself changes. */
  const [sticky, setSticky] = useState<Set<string>>(() => new Set())

  const toastTimer = useRef<number | undefined>(undefined)
  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    window.clearTimeout(toastTimer.current)
    setToast({ message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 6000 : 3500)
  }, [])

  // Latest state for callbacks that must not re-create on every keystroke.
  const latest = useRef({ feeds, articles, settings })
  latest.current = { feeds, articles, settings }

  /* Unsubscribing mid-refresh used to resurrect the feed: the in-flight fetch
   * would finish and write the feed and its articles straight back to disk.
   * This ref is updated synchronously by removeFeed, so ingest can drop
   * results that arrive for a source the user has already let go of. */
  const removed = useRef<Set<string>>(new Set())

  /* ── persistence ─────────────────────────────────────────────────────── */

  const persistArticles = useCallback((changed: Article[]) => {
    void db.saveArticles(changed).catch(() => notify('Could not save to this device.', 'error'))
  }, [notify])

  /* State updaters stay pure — the write to disk happens beside setState, not
   * inside it, so a double-invoked updater cannot double-write. */
  const mutateArticle = useCallback(
    (id: string, change: (article: Article) => Article) => {
      const current = latest.current.articles.find((a) => a.id === id)
      if (!current) return
      const updated = change(current)
      if (updated === current) return
      setArticles((list) => list.map((a) => (a.id === id ? updated : a)))
      persistArticles([updated])
    },
    [persistArticles],
  )

  /* ── feed refreshing ─────────────────────────────────────────────────── */

  const ingest = useCallback(
    async (targets: Feed[]) => {
      if (!targets.length) return
      const existing = new Map(latest.current.articles.map((a) => [a.id, a]))
      const keepArchive = latest.current.settings.keepArchive

      const outcomes = await pool(targets, REFRESH_CONCURRENCY, async (feed) => {
        try {
          const parsed = await refreshFeed(feed)
          // A refresh never renames a source you already see in the rail. The
          // remote title only fills in when there is nothing better, so an OPML
          // row imported without a title gets one and nothing else changes.
          const named = feed.title && feed.title !== feed.url
          const title = named ? feed.title : parsed.title || feed.title || feed.url
          const updated = {
            ...feed,
            title,
            siteUrl: parsed.siteUrl || feed.siteUrl,
            lastFetchedAt: Date.now(),
            lastError: '',
          }
          return { feed: updated, fresh: toArticles(updated, parsed, { keepArchive, existing }) }
        } catch (error) {
          return {
            feed: { ...feed, lastFetchedAt: Date.now(), lastError: messageOf(error, 'Could not reach this source.') },
            fresh: [] as Article[],
          }
        }
      })

      const nextFeeds = outcomes.map((o) => o.feed).filter((f) => !removed.current.has(f.id))
      const fresh = outcomes
        .flatMap((o) => o.fresh)
        .filter((a) => !removed.current.has(a.feedId))
      if (!nextFeeds.length && !fresh.length) return

      setFeeds((current) => {
        const byId = new Map(nextFeeds.map((f) => [f.id, f]))
        return current.map((f) => byId.get(f.id) ?? f).sort((a, b) => a.title.localeCompare(b.title))
      })
      setArticles((current) => {
        const byId = new Map(current.map((a) => [a.id, a]))
        for (const article of fresh) byId.set(article.id, article)
        return [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt)
      })

      await db.saveFeeds(nextFeeds)
      await db.saveArticles(fresh)

      const failed = nextFeeds.filter((f) => f.lastError)
      if (failed.length) {
        notify(
          failed.length === 1
            ? `${failed[0].title}: ${failed[0].lastError}`
            : `${failed.length} sources could not be reached.`,
          'error',
        )
      }
    },
    [notify],
  )

  const refreshAll = useCallback(async () => {
    if (!latest.current.feeds.length) return
    setRefreshing(true)
    try {
      await ingest(latest.current.feeds)
    } finally {
      setRefreshing(false)
    }
  }, [ingest])

  /* ── boot ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const [storedFeeds, storedArticles, storedSettings] = await Promise.all([
        db.loadFeeds(),
        db.loadArticles(),
        db.loadSettings(),
      ])
      if (cancelled) return

      // Nothing is subscribed on your behalf. An empty install stays empty
      // until you pick something — the reader offers suggestions instead.
      setSettings(storedSettings)
      setArticles(storedArticles)
      setFeeds(storedFeeds)
      if (!storedFeeds.length) setView('welcome')
      latest.current = { feeds: storedFeeds, articles: storedArticles, settings: storedSettings }
      setReady(true)

      if (storedFeeds.length) {
        setRefreshing(true)
        try {
          await ingest(storedFeeds)
        } finally {
          if (!cancelled) setRefreshing(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [ingest])

  useEffect(() => {
    const timer = window.setInterval(() => void refreshAll(), AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refreshAll])

  /* ── derived list ────────────────────────────────────────────────────── */

  const visible = useMemo(() => {
    if (view === 'saved') return articles.filter((a) => a.starred)
    if (view === 'search') {
      const needle = query.trim().toLowerCase()
      if (!needle) return []
      // contentText, never contentHtml — searching the markup would match tag
      // names and href values, and would miss any phrase split by a tag.
      return articles.filter((a) =>
        `${a.title} ${a.feedTitle} ${a.author} ${a.excerpt} ${a.contentText ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
    }
    return articles.filter(
      (a) => (!a.read || sticky.has(a.id)) && (!feedId || a.feedId === feedId),
    )
  }, [articles, view, query, feedId, sticky])

  const selected = useMemo(
    () => visible.find((a) => a.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  )

  const unreadCount = useMemo(() => articles.reduce((n, a) => n + (a.read ? 0 : 1), 0), [articles])

  // Leave a crumb the landing page can read synchronously on the next visit.
  useEffect(() => {
    if (!ready) return
    writeGlance({ feeds: feeds.length, unread: unreadCount })
  }, [ready, feeds.length, unreadCount])

  const savedCount = useMemo(() => articles.reduce((n, a) => n + (a.starred ? 1 : 0), 0), [articles])
  const unreadByFeed = useMemo(() => {
    const counts = new Map<string, number>()
    for (const article of articles) {
      if (article.read) continue
      counts.set(article.feedId, (counts.get(article.feedId) ?? 0) + 1)
    }
    return counts
  }, [articles])

  /* ── actions ─────────────────────────────────────────────────────────── */

  const go = useCallback((nextView: View, nextFeedId: string | null = null) => {
    setView(nextView)
    setFeedId(nextFeedId)
    setSelectedId(null)
    setSticky(new Set())
    setZen(false)
  }, [])

  const setQuery = useCallback((next: string) => {
    setQueryState(next)
    setSelectedId(null)
  }, [])

  const setRead = useCallback(
    (id: string, read: boolean) => {
      if (read) setSticky((current) => new Set(current).add(id))
      mutateArticle(id, (a) => (a.read === read ? a : { ...a, read }))
    },
    [mutateArticle],
  )

  const open = useCallback(
    (id: string) => {
      setSelectedId(id)
      setRead(id, true)
    },
    [setRead],
  )

  const step = useCallback(
    (delta: number) => {
      setSelectedId((current) => {
        const list = visible
        if (!list.length) return null
        const index = list.findIndex((a) => a.id === (current ?? list[0]?.id))
        const next = Math.min(list.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))
        return list[next]?.id ?? current
      })
    },
    [visible],
  )

  const toggleStar = useCallback(
    (id: string) => mutateArticle(id, (a) => ({ ...a, starred: !a.starred })),
    [mutateArticle],
  )

  /* Feeds that carry only a link — Hacker News is the obvious one — leave the
   * reader with nothing to read. This goes and gets the article itself, on
   * request and never on its own. */
  const loadFullText = useCallback(
    async (id: string) => {
      const article = latest.current.articles.find((a) => a.id === id)
      if (!article?.link) throw new Error('This article has no link to follow.')

      const { html, text } = await extractArticle(article.link)

      // The archive setting governs what is kept on disk, so honour it here
      // too: with it off, the text is shown now and not written down.
      if (latest.current.settings.keepArchive) {
        mutateArticle(id, (a) => ({ ...a, contentHtml: html, contentText: text }))
      } else {
        setArticles((list) =>
          list.map((a) => (a.id === id ? { ...a, contentHtml: html, contentText: text } : a)),
        )
      }
    },
    [mutateArticle],
  )

  const markAllRead = useCallback(() => {
    const ids = new Set(visible.map((a) => a.id))
    if (!ids.size) return
    const changed = latest.current.articles
      .filter((a) => ids.has(a.id) && !a.read)
      .map((a) => ({ ...a, read: true }))
    if (!changed.length) return

    const byId = new Map(changed.map((a) => [a.id, a]))
    setArticles((current) => current.map((a) => byId.get(a.id) ?? a))
    persistArticles(changed)
    setSticky(new Set())
    setSelectedId(null)
  }, [visible, persistArticles])

  const addFeed = useCallback(
    async (input: string) => {
      setBusy(true)
      try {
        const { url, parsed } = await resolveFeed(input)
        if (latest.current.feeds.some((f) => f.id === url)) {
          notify(`You already follow ${parsed.title || url}.`)
          return
        }
        removed.current.delete(url)
        const feed = makeFeed(url, parsed)
        const fresh = toArticles(feed, parsed, {
          keepArchive: latest.current.settings.keepArchive,
          existing: new Map(),
        })

        setFeeds((current) => [...current, feed].sort((a, b) => a.title.localeCompare(b.title)))
        setArticles((current) =>
          [...fresh, ...current].sort((a, b) => b.publishedAt - a.publishedAt),
        )
        await db.saveFeed(feed)
        await db.saveArticles(fresh)
        notify(`Following ${feed.title}.`)
      } finally {
        setBusy(false)
      }
    },
    [notify],
  )

  const removeFeed = useCallback(
    async (id: string) => {
      const feed = latest.current.feeds.find((f) => f.id === id)
      removed.current.add(id)
      setFeeds((current) => current.filter((f) => f.id !== id))
      setArticles((current) => current.filter((a) => a.feedId !== id))
      setFeedId((current) => (current === id ? null : current))
      // Dropping the last source lands you back where you started, rather than
      // on an empty list with no way to find the suggestions again.
      if (latest.current.feeds.length <= 1) setView('welcome')
      await db.deleteFeed(id)
      notify(`Unsubscribed from ${feed?.title ?? 'that source'}.`)
    },
    [notify],
  )

  const importOpml = useCallback(
    async (text: string) => {
      setBusy(true)
      try {
        const entries = parseOpml(text)
        const known = new Set(latest.current.feeds.map((f) => f.id))
        const incoming = entries.filter((e) => !known.has(e.url))
        if (!incoming.length) {
          notify('Every feed in that file is already here.')
          return
        }

        incoming.forEach((entry) => removed.current.delete(entry.url))
        const added: Feed[] = incoming.map((entry) => ({
          id: entry.url,
          url: entry.url,
          siteUrl: '',
          title: entry.title || entry.url,
          addedAt: Date.now(),
          lastFetchedAt: 0,
          lastError: '',
        }))

        setFeeds((current) => [...current, ...added].sort((a, b) => a.title.localeCompare(b.title)))
        await db.saveFeeds(added)
        latest.current = { ...latest.current, feeds: [...latest.current.feeds, ...added] }
        notify(`Imported ${added.length} ${added.length === 1 ? 'feed' : 'feeds'}. Fetching…`)
        await ingest(added)
      } finally {
        setBusy(false)
      }
    },
    [ingest, notify],
  )

  const exportOpml = useCallback(() => {
    if (!latest.current.feeds.length) {
      notify('There are no feeds to export yet.')
      return
    }
    void downloadOpml(latest.current.feeds).catch(() => notify('Could not save that file.'))
  }, [notify])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      void db.saveSettings(next)
      // Honour the archive switch immediately rather than at the next refresh.
      if (patch.keepArchive === false && current.keepArchive) {
        void db.dropArchivedBodies()
        setArticles((list) => list.map((a) => (a.contentHtml ? { ...a, contentHtml: '' } : a)))
      }
      return next
    })
  }, [])

  const value: TildeStore = {
    ready, feeds, articles, settings,
    view, feedId, query, selectedId, showAdd, zen, refreshing, busy, toast,
    visible, selected, unreadCount, savedCount, unreadByFeed,
    go, step, open, setQuery,
    setRead, toggleStar, markAllRead, loadFullText,
    addFeed, removeFeed, refreshAll, importOpml, exportOpml,
    update, setShowAdd, setZen, notify,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): TildeStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}
