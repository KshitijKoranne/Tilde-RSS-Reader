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
import { forgetHaystacks, searchArchive } from './archive'
import { forgetBodies, rememberBody } from './bodies'
import * as db from './db'
import { extractArticle } from './extract'
import { groupFeeds, makeFeed, refreshFeeds, resolveFeed, toArticles, type FeedGroup } from './feeds'
import { writeGlance } from './glance'
import { downloadOpml, parseOpml } from './opml'
import {
  DEFAULT_SETTINGS,
  RETENTION_DAYS,
  type Article,
  type Feed,
  type Settings,
  type View,
} from './types'

const AUTO_REFRESH_MS = 15 * 60 * 1000

/* Search waits this long after the last keystroke. Long enough that typing a
 * word costs one search rather than five, short enough to feel like none. */
const SEARCH_DEBOUNCE_MS = 120

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
  /** feedId and groupName are the two ways to narrow the inbox and are
   *  mutually exclusive; go() is the only thing that sets either. */
  feedId: string | null
  groupName: string | null
  query: string
  selectedId: string | null
  showAdd: boolean
  zen: boolean
  refreshing: boolean
  /** True while the archive is being searched, which is not instant on a big one. */
  searching: boolean
  busy: boolean
  toast: Toast | null

  /** Articles for the current view, in the order the list shows them. */
  visible: Article[]
  selected: Article | null
  unreadCount: number
  savedCount: number
  unreadByFeed: Map<string, number>
  /** The rail's shape: named groups, then whatever belongs to no group. */
  groups: FeedGroup[]
  unreadByGroup: Map<string, number>

  go(view: View, feedId?: string | null, groupName?: string | null): void
  step(delta: number): void
  open(id: string): void
  setQuery(query: string): void

  setRead(id: string, read: boolean): void
  toggleStar(id: string): void
  markAllRead(): void
  /** Fetches the linked page and stores its readable part. Throws on failure
   *  so the caller can show the reason where the reader is looking. */
  loadFullText(id: string): Promise<void>

  addFeed(input: string, group?: string): Promise<void>
  removeFeed(id: string): Promise<void>
  /** Moves a source to a group, or out of one when given an empty name. */
  setFeedGroup(id: string, group: string): Promise<void>
  toggleGroup(name: string): void
  refreshAll(): Promise<void>
  importOpml(text: string): Promise<void>
  exportOpml(): void

  update(patch: Partial<Settings>): void
  setShowAdd(show: boolean): void
  setZen(zen: boolean): void
  notify(message: string, tone?: Toast['tone']): void
}

const StoreContext = createContext<TildeStore | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [view, setView] = useState<View>('inbox')
  const [feedId, setFeedId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState<string | null>(null)
  const [query, setQueryState] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [zen, setZen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchIds, setSearchIds] = useState<string[]>([])
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

  /* The search index refers to articles by a small number rather than by their
   * id, so something has to hand those out. The highest one on disk is the only
   * state it needs — no counter to keep in step, and nothing to go wrong if a
   * write is lost. */
  const seq = useRef(1)
  const nextSeq = useCallback(() => seq.current++, [])

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

      const outcomes = await refreshFeeds(targets, { keepArchive, existing, nextSeq })

      /* Anything the reader unsubscribed from while this was in flight is
       * dropped here rather than written back: without it, letting a source go
       * mid-refresh would resurrect it and its articles a moment later. */
      const nextFeeds = outcomes.map((o) => o.feed).filter((f) => !removed.current.has(f.id))
      const incoming = outcomes
        .flatMap((o) => o.fresh)
        .filter((i) => !removed.current.has(i.article.feedId))
      const fresh = incoming.map((i) => i.article)
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
      await db.saveIncoming(incoming)

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
    [notify, nextSeq],
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

  /* ── forgetting ──────────────────────────────────────────────────────── */

  /* Retention. Off unless it was asked for, and even then it only lets go of
   * articles that have been read and not saved — the archive you were promised
   * stays an archive. */
  const prune = useCallback(async (retention: Settings['retention']) => {
    const days = RETENTION_DAYS[retention]
    if (!days) return
    const gone = await db.pruneArticles(Date.now() - days * 86_400_000)
    if (!gone.length) return

    const dropped = new Set(gone)
    forgetHaystacks(gone)
    setArticles((list) => list.filter((a) => !dropped.has(a.id)))
  }, [])

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
      // Carry on numbering from the highest article on disk, so a new one can
      // never be given a number the index already means something else by.
      seq.current = storedArticles.reduce((n, a) => Math.max(n, a.seq ?? 0), 0) + 1
      setReady(true)

      if (storedFeeds.length) {
        setRefreshing(true)
        try {
          await ingest(storedFeeds)
        } finally {
          if (!cancelled) setRefreshing(false)
        }
      }

      // Once, after the reader already has something to look at.
      if (!cancelled) await prune(storedSettings.retention)
    })()

    return () => {
      cancelled = true
    }
  }, [ingest, prune])

  useEffect(() => {
    const timer = window.setInterval(() => void refreshAll(), AUTO_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [refreshAll])

  /* ── search ──────────────────────────────────────────────────────────── */

  /* Re-run on the query alone. Marking an article read while looking at results
   * changes the article list, and re-searching on that would shuffle the page
   * out from under the person reading it. */
  useEffect(() => {
    if (view !== 'search') return
    if (!query.trim()) {
      setSearchIds([])
      setSearching(false)
      return
    }

    let current = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchArchive(latest.current.articles, query).then((ids) => {
        if (!current) return
        setSearchIds(ids)
        setSearching(false)
      })
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [view, query])

  /* ── derived list ────────────────────────────────────────────────────── */

  const byId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles])

  const visible = useMemo(() => {
    if (view === 'saved') return articles.filter((a) => a.starred)
    // Search holds ids rather than the articles it found, so a row it is
    // showing still notices when you mark it read.
    if (view === 'search') {
      return searchIds.map((id) => byId.get(id)).filter((a): a is Article => Boolean(a))
    }
    // A group narrows the inbox to the sources inside it, the same way a
    // single source does — one level up.
    const inGroup =
      groupName === null
        ? null
        : new Set(feeds.filter((f) => f.group === groupName).map((f) => f.id))

    return articles.filter(
      (a) =>
        (!a.read || sticky.has(a.id)) &&
        (!feedId || a.feedId === feedId) &&
        (!inGroup || inGroup.has(a.feedId)),
    )
  }, [articles, byId, searchIds, view, feedId, groupName, feeds, sticky])

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

  const groups = useMemo(() => groupFeeds(feeds), [feeds])

  // A folded group still has to show what is waiting inside it.
  const unreadByGroup = useMemo(() => {
    const counts = new Map<string, number>()
    for (const feed of feeds) {
      if (!feed.group) continue
      counts.set(feed.group, (counts.get(feed.group) ?? 0) + (unreadByFeed.get(feed.id) ?? 0))
    }
    return counts
  }, [feeds, unreadByFeed])

  /* ── actions ─────────────────────────────────────────────────────────── */

  const go = useCallback((
    nextView: View,
    nextFeedId: string | null = null,
    nextGroup: string | null = null,
  ) => {
    setView(nextView)
    setFeedId(nextFeedId)
    setGroupName(nextGroup)
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

      const extracted = await extractArticle(article.link)
      const body = { id, html: extracted.html, text: extracted.text }
      const updated = { ...article, bodyChars: body.text.length }

      // Held either way, so the reader shows it the moment this returns.
      rememberBody(body)
      setArticles((list) => list.map((a) => (a.id === id ? updated : a)))

      // The archive setting governs what is kept on disk, so honour it here
      // too: with it off, the text is shown now and not written down.
      if (latest.current.settings.keepArchive) await db.saveBody(updated, body)
    },
    [],
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
    async (input: string, group = '') => {
      setBusy(true)
      try {
        const { url, parsed } = await resolveFeed(input)
        if (latest.current.feeds.some((f) => f.id === url)) {
          notify(`You already follow ${parsed.title || url}.`)
          return
        }
        removed.current.delete(url)
        const feed = makeFeed(url, parsed, group)
        const incoming = toArticles(feed, parsed, {
          keepArchive: latest.current.settings.keepArchive,
          existing: new Map(),
          nextSeq,
        })
        const fresh = incoming.map((i) => i.article)

        setFeeds((current) => [...current, feed].sort((a, b) => a.title.localeCompare(b.title)))
        setArticles((current) =>
          [...fresh, ...current].sort((a, b) => b.publishedAt - a.publishedAt),
        )
        await db.saveFeed(feed)
        await db.saveIncoming(incoming)
        notify(`Following ${feed.title}.`)
      } finally {
        setBusy(false)
      }
    },
    [notify, nextSeq],
  )

  const removeFeed = useCallback(
    async (id: string) => {
      const feed = latest.current.feeds.find((f) => f.id === id)
      removed.current.add(id)
      setFeeds((current) => current.filter((f) => f.id !== id))
      setArticles((current) => current.filter((a) => a.feedId !== id))
      setFeedId((current) => (current === id ? null : current))
      // Letting go of the last source in a group leaves that group nowhere to
      // point, so step back out to everything unread.
      if (feed?.group && !latest.current.feeds.some((f) => f.id !== id && f.group === feed.group)) {
        setGroupName((current) => (current === feed.group ? null : current))
      }
      // Dropping the last source lands you back where you started, rather than
      // on an empty list with no way to find the suggestions again.
      if (latest.current.feeds.length <= 1) setView('welcome')
      await db.deleteFeed(id)
      notify(`Unsubscribed from ${feed?.title ?? 'that source'}.`)
    },
    [notify],
  )

  const setFeedGroup = useCallback(
    async (id: string, group: string) => {
      const trimmed = group.trim()
      const feed = latest.current.feeds.find((f) => f.id === id)
      if (!feed || feed.group === trimmed) return
      const updated = { ...feed, group: trimmed }
      setFeeds((current) => current.map((f) => (f.id === id ? updated : f)))
      // Looking at a group you have just emptied would show nothing at all.
      setGroupName((current) => (current === feed.group ? null : current))
      await db.saveFeed(updated)
    },
    [],
  )

  const toggleGroup = useCallback((name: string) => {
    setSettings((current) => {
      const folded = current.collapsedGroups.includes(name)
      const next = {
        ...current,
        collapsedGroups: folded
          ? current.collapsedGroups.filter((g) => g !== name)
          : [...current.collapsedGroups, name],
      }
      void db.saveSettings(next)
      return next
    })
  }, [])

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
          // The folder the feed sat in wherever it came from. OPML carries it,
          // so a list that arrives organised stays organised.
          group: entry.group,
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
        forgetBodies()
        void db.dropArchivedBodies()
        setArticles((list) => list.map((a) => (a.bodyChars ? { ...a, bodyChars: 0 } : a)))
      }
      return next
    })
    // A shorter retention is a request to forget now, not at the next launch.
    if (patch.retention) void prune(patch.retention)
  }, [prune])

  const value: TildeStore = {
    ready, feeds, articles, settings,
    view, feedId, groupName, query, selectedId, showAdd, zen, refreshing, searching, busy, toast,
    visible, selected, unreadCount, savedCount, unreadByFeed, groups, unreadByGroup,
    go, step, open, setQuery,
    setRead, toggleStar, markAllRead, loadFullText,
    addFeed, removeFeed, setFeedGroup, toggleGroup, refreshAll, importOpml, exportOpml,
    update, setShowAdd, setZen, notify,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): TildeStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}
