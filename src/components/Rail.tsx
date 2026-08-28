import { Link } from 'react-router-dom'
import { hostOf } from '../lib/format'
import { useStore } from '../lib/store'
import type { View } from '../lib/types'
import { TildeMark } from './TildeMark'

interface NavDef {
  key: View
  label: string
  count: string | number
}

export function Rail() {
  const store = useStore()

  const navItems: NavDef[] = [
    { key: 'inbox', label: 'Unread', count: store.unreadCount },
    { key: 'saved', label: 'Saved', count: store.savedCount },
    { key: 'search', label: 'Search', count: '/' },
    { key: 'settings', label: 'Settings', count: '' },
  ]

  return (
    <aside className="rail">
      <div className="rail-head">
        <Link to="/" className="rail-brand" aria-label="Tilde home">
          <span style={{ color: 'var(--color-accent)' }}>
            <TildeMark size={20} />
          </span>
          <span className="wordmark">Tilde</span>
        </Link>
        <span className="kicker" style={{ color: 'var(--color-neutral-700)' }}>
          v1.0
        </span>
      </div>

      <nav className="rail-nav">
        {navItems.map((item) => {
          const active = store.view === item.key && !(item.key === 'inbox' && store.feedId)
          return (
            <button
              key={item.key}
              type="button"
              className={`side-item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => store.go(item.key, null)}
            >
              <span className="side-label">{item.label}</span>
              <span className="side-count">{item.count}</span>
            </button>
          )
        })}
      </nav>

      <div className="rail-section">
        <span className="kicker">Sources</span>
        <button
          type="button"
          className="rail-refresh"
          onClick={() => void store.refreshAll()}
          disabled={store.refreshing || !store.feeds.length}
        >
          {store.refreshing ? 'Fetching…' : 'Refresh'}
        </button>
      </div>

      <div className="rail-feeds scroll">
        {store.feeds.length === 0 && (
          <p className="rail-empty">No sources yet. Add one below.</p>
        )}
        {store.feeds.map((feed) => {
          const active = store.feedId === feed.id
          return (
            <button
              key={feed.id}
              type="button"
              className={`side-item${active ? ' is-active' : ''}${feed.lastError ? ' is-erroring' : ''}`}
              title={feed.lastError ? `${feed.title} — ${feed.lastError}` : hostOf(feed.url)}
              onClick={() => store.go('inbox', active ? null : feed.id)}
            >
              <span className="side-label">{feed.title}</span>
              <span className="side-count">
                {feed.lastError ? '!' : (store.unreadByFeed.get(feed.id) ?? 0)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="rail-foot">
        <button
          type="button"
          className="btn btn-ghost btn-block"
          onClick={() => store.setShowAdd(true)}
        >
          Add a feed
        </button>
      </div>
    </aside>
  )
}
