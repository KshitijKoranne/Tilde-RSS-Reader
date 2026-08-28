import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ITEMS_PER_FETCH } from '../lib/feeds'
import { useStore } from '../lib/store'

export function AddFeedDialog() {
  const store = useStore()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (store.showAdd) inputRef.current?.focus()
  }, [store.showAdd])

  if (!store.showAdd) return null

  const close = () => {
    setUrl('')
    setError('')
    store.setShowAdd(false)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await store.addFeed(url)
      close()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that feed.')
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <form className="dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label="Add a feed">
        <h3 className="dialog-title">Add a feed</h3>
        <div className="dialog-body">
          <p className="dialog-intro">
            Paste a site or feed address. Tilde finds the feed and fetches the last{' '}
            {ITEMS_PER_FETCH} entries.
          </p>
          <div className="field">
            <label htmlFor="add-url">Address</label>
            <input
              id="add-url"
              ref={inputRef}
              className="input"
              type="text"
              inputMode="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          {error && <p className="dialog-error">{error}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={store.busy || !url.trim()}>
            {store.busy ? 'Looking…' : 'Subscribe'}
          </button>
        </div>
      </form>
    </div>
  )
}
