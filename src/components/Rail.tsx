import { Link } from 'react-router-dom'
import { hostOf } from '../lib/format'
import { isDesktopApp } from '../lib/platform'
import { useStore } from '../lib/store'
import type { Feed, View } from '../lib/types'
import { Brand } from './Wordmark'

interface NavDef {
  key: View
  label: string
  count: string | number
}

/* One source. The same row whether it sits in a group or on its own — a group
 * indents its members rather than dressing them differently. */
function FeedRow({ feed, inGroup }: { feed: Feed; inGroup: boolean }) {
  const store = useStore()
  const active = store.feedId === feed.id

  return (
    <button
      type="button"
      className={`side-item${inGroup ? ' is-nested' : ''}${active ? ' is-active' : ''}${
        feed.lastError ? ' is-erroring' : ''
      }`}
      title={feed.lastError ? `${feed.title} — ${feed.lastError}` : hostOf(feed.url)}
      onClick={() => store.go('inbox', active ? null : feed.id)}
    >
      <span className="side-label">{feed.title}</span>
      <span className="side-count">
        {feed.lastError ? '!' : (store.unreadByFeed.get(feed.id) ?? 0)}
      </span>
    </button>
  )
}

/* A group heading is two controls in one row: the triangle folds it, the name
 * reads everything inside it. Folding is not the same gesture as reading, so
 * they are separate buttons rather than one that guesses. */
function GroupHeading({ name }: { name: string }) {
  const store = useStore()
  const collapsed = store.settings.collapsedGroups.includes(name)
  const active = store.groupName === name

  return (
    <div className={`group-head${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="group-fold"
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${name}`}
        onClick={() => store.toggleGroup(name)}
      >
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </button>
      <button
        type="button"
        className="group-name"
        aria-current={active ? 'page' : undefined}
        onClick={() => store.go('inbox', null, active ? null : name)}
      >
        <span className="side-label">{name}</span>
        <span className="side-count">{store.unreadByGroup.get(name) ?? 0}</span>
      </button>
    </div>
  )
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
        {/* In the Mac app there is no landing page to go home to, so the
            wordmark is just the wordmark. */}
        {isDesktopApp() ? (
          <span className="rail-brand">
            <Brand size={20} />
          </span>
        ) : (
          <Link to="/" className="rail-brand" aria-label="Tilde home">
            <Brand size={20} />
          </Link>
        )}
        <span className="kicker" style={{ color: 'var(--color-neutral-700)' }}>
          v1.2
        </span>
      </div>

      <nav className="rail-nav">
        {navItems.map((item) => {
          const active =
            store.view === item.key &&
            !(item.key === 'inbox' && (store.feedId || store.groupName))
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

        {store.groups.map((group) =>
          group.name ? (
            <div className="rail-group" key={group.name}>
              <GroupHeading name={group.name} />
              {!store.settings.collapsedGroups.includes(group.name) &&
                group.feeds.map((feed) => <FeedRow key={feed.id} feed={feed} inGroup />)}
            </div>
          ) : (
            group.feeds.map((feed) => <FeedRow key={feed.id} feed={feed} inGroup={false} />)
          ),
        )}
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
