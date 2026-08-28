import { useEffect, useRef } from 'react'
import { fullDate } from '../lib/format'
import { useStore } from '../lib/store'
import { ArticleBody } from './ArticleBody'

function EmptyState() {
  const store = useStore()

  let title: string
  let note: string

  if (!store.feeds.length) {
    title = 'No sources yet'
    note = 'Add a feed from the rail, or import an OPML file in Settings. Tilde only ever shows you what you asked for.'
  } else if (store.view === 'search') {
    title = store.query.trim() ? 'No matches' : 'Search the archive'
    note = store.query.trim()
      ? 'Try a fragment of a sentence instead of a title.'
      : 'Every article you have opened is kept in full text. Type a phrase you half remember.'
  } else if (store.view === 'saved') {
    title = 'Nothing saved yet'
    note = 'Press s on any article to keep it here.'
  } else if (store.refreshing) {
    title = 'Fetching'
    note = 'Tilde is asking your sources what is new. This takes a moment on the first run.'
  } else {
    const feed = store.feeds.find((f) => f.id === store.feedId)
    title = 'All caught up'
    note = `You have read everything from ${
      feed ? feed.title : `all ${store.feeds.length} sources`
    }. Tilde will not invent more. Come back tomorrow.`
  }

  return (
    <div className="read-empty">
      <span className="read-empty-mark" />
      <p className="t-h read-empty-title">{title}</p>
      <p className="read-empty-note">{note}</p>
    </div>
  )
}

export function ReaderPane() {
  const store = useStore()
  const { selected, settings } = store
  const bodyRef = useRef<HTMLDivElement>(null)

  // A new article always starts at the top of the pane.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [selected?.id])

  // "Mark read when scrolled past" — the reader only, never the list.
  useEffect(() => {
    const element = bodyRef.current
    if (!element || !selected || selected.read || !settings.markReadOnScroll) return

    const onScroll = () => {
      const reachedEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 120
      if (reachedEnd) store.setRead(selected.id, true)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [selected, settings.markReadOnScroll, store])

  if (!selected) {
    return (
      <section className="read-col">
        <EmptyState />
      </section>
    )
  }

  const byline = [selected.author, fullDate(selected.publishedAt)].filter(Boolean).join(' · ')

  return (
    <section className="read-col">
      <header className="read-head">
        <span className="kicker" title={selected.feedTitle}>
          {selected.feedTitle}
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => store.toggleStar(selected.id)}>
          {selected.starred ? 'Saved ✓' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => store.setRead(selected.id, !selected.read)}
        >
          {selected.read ? 'Mark unread' : 'Mark read'}
        </button>
      </header>

      <article className="read-body scroll" ref={bodyRef}>
        <div className="read-measure">
          <h2 className="t-h read-title">{selected.title}</h2>
          <p className="kicker read-byline">{byline}</p>
          <hr className="hr" />

          <ArticleBody article={selected} />

          {selected.link && (
            <p className="read-original">
              <a href={selected.link} target="_blank" rel="noopener noreferrer">
                Open the original ↗
              </a>
            </p>
          )}
          <p className="read-zen-link">
            <button type="button" onClick={() => store.setZen(true)}>
              Read full screen — f
            </button>
          </p>
        </div>
      </article>
    </section>
  )
}
