import { useRef } from 'react'
import { fullDate } from '../lib/format'
import { useMarkReadOnScroll, useScrollToTop } from '../lib/hooks'
import { useStore } from '../lib/store'
import { ArticleBody } from './ArticleBody'

function EmptyState() {
  const store = useStore()

  if (!store.feeds.length) {
    return (
      <div className="read-empty">
        <span className="read-empty-mark" />
        <p className="t-h read-empty-title">No sources yet</p>
        <p className="read-empty-note">
          Tilde starts empty on purpose — you decide what shows up.
        </p>
        <p className="read-empty-cta">
          <button type="button" className="btn btn-primary" onClick={() => store.go('welcome')}>
            See suggested sources
          </button>
        </p>
      </div>
    )
  }

  let title: string
  let note: string

  if (store.view === 'search') {
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
  const { selected } = store
  const bodyRef = useRef<HTMLDivElement>(null)

  useScrollToTop(bodyRef, selected?.id)
  useMarkReadOnScroll(bodyRef, store.zen ? null : selected)

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
