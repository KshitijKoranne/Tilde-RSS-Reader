import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { SUGGESTED_GROUPS } from '../lib/suggested'

/* Offered, never subscribed on your behalf. Anything already followed drops
 * out of the list, so it empties as you use it.
 *
 * Subscribing carries the heading across: pick something under Science and it
 * arrives in a Science group in the rail, so the shape you chose from is the
 * shape you get back. */
export function Suggestions({ compact = false }: { compact?: boolean }) {
  const store = useStore()
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<Record<string, string>>({})

  const followed = useMemo(() => new Set(store.feeds.map((f) => f.id)), [store.feeds])

  const groups = SUGGESTED_GROUPS.map((group) => ({
    ...group,
    feeds: group.feeds.filter((feed) => !followed.has(feed.url)),
  })).filter((group) => group.feeds.length > 0)

  if (!groups.length) {
    return (
      <p className="suggest-done">
        You are following every suggestion. Add your own with <b>a</b>, or import an OPML file in
        Settings.
      </p>
    )
  }

  const subscribe = async (url: string, group: string) => {
    setPending(url)
    setFailed((current) => {
      const next = { ...current }
      delete next[url]
      return next
    })
    try {
      await store.addFeed(url, group)
    } catch (error) {
      setFailed((current) => ({
        ...current,
        [url]: error instanceof Error ? error.message : 'Could not subscribe.',
      }))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className={`suggest${compact ? ' is-compact' : ''}`}>
      {groups.map((group) => (
        <div className="suggest-group" key={group.name}>
          <span className="kicker suggest-group-name">{group.name}</span>
          {group.feeds.map((feed) => (
            <div className="suggest-row" key={feed.url}>
              <span className="suggest-text">
                <span className="suggest-name">{feed.title}</span>
                <span className="suggest-note">{failed[feed.url] || feed.note}</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost suggest-btn"
                onClick={() => void subscribe(feed.url, group.name)}
                disabled={pending !== null}
              >
                {pending === feed.url ? 'Adding…' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
