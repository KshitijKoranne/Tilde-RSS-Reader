import { useEffect, useRef } from 'react'
import { plural, shortTime } from '../lib/format'
import { useStore } from '../lib/store'

const HINTS = ['j / k move', 'o open', 'm read', 's save', '/ search', 'f full screen']

export function ArticleList() {
  const store = useStore()
  const { view, visible, selected } = store
  const bodyRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation must drag the viewport along with it.
  useEffect(() => {
    if (!selected) return
    const row = bodyRef.current?.querySelector<HTMLElement>(`[data-article-id="${CSS.escape(selected.id)}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const activeFeed = store.feeds.find((f) => f.id === store.feedId)

  const title =
    view === 'saved' ? 'Saved' : view === 'search' ? 'Search' : (activeFeed?.title ?? 'Unread')

  let meta: string
  if (view === 'saved') {
    meta = `${store.savedCount} kept for later`
  } else if (view === 'search') {
    meta = store.query.trim()
      ? `${plural(visible.length, 'match', 'matches')} in the archive`
      : `${plural(store.articles.length, 'article', 'articles')} indexed`
  } else if (visible.length) {
    meta = `${plural(visible.length, 'article', 'articles')} · ${
      activeFeed ? 'one source' : plural(store.feeds.length, 'source', 'sources')
    }`
  } else {
    meta = store.refreshing ? 'Fetching…' : 'Nothing left'
  }

  return (
    <section className="list-col">
      <header className="list-head">
        <div className="list-head-top">
          <h1 className="t-h list-title" title={title}>
            {title}
          </h1>
          {view === 'inbox' && visible.length > 0 && (
            <button type="button" className="list-action" onClick={store.markAllRead}>
              Mark all read
            </button>
          )}
        </div>
        <p className="kicker list-meta">{meta}</p>
        {view === 'search' && (
          <input
            className="input list-search"
            type="search"
            autoFocus
            placeholder="Search every article you have read"
            value={store.query}
            onChange={(event) => store.setQuery(event.target.value)}
          />
        )}
      </header>

      <div className="list-body scroll" ref={bodyRef}>
        {activeFeed?.lastError && <p className="list-note">{activeFeed.lastError}</p>}

        {visible.map((article) => {
          const isSelected = selected?.id === article.id
          return (
            <button
              key={article.id}
              type="button"
              data-article-id={article.id}
              className={`row${isSelected ? ' is-selected' : ''}`}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => store.open(article.id)}
            >
              <span className={`row-mark${article.read ? ' is-read' : ''}`} />
              <span className="row-text">
                <span className="kicker row-feed">
                  {[article.feedTitle, shortTime(article.publishedAt), article.starred && 'saved']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className={`row-title${article.read ? ' is-read' : ''}`}>{article.title}</span>
                {article.excerpt && <span className="row-excerpt">{article.excerpt}</span>}
              </span>
            </button>
          )
        })}
      </div>

      <footer className="list-foot">
        {store.settings.showKeyboardHints && HINTS.map((hint) => <span key={hint}>{hint}</span>)}
      </footer>
    </section>
  )
}
