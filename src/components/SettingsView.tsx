import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { hostOf } from '../lib/format'
import { isDesktopApp, pickTextFile } from '../lib/platform'
import { useStore } from '../lib/store'
import type { ListDensity, ReaderFont, ReaderSize, Settings } from '../lib/types'
import { Suggestions } from './Suggestions'
import { Tilde } from './Wordmark'

const FONT_NOTES: Record<ReaderFont, string> = {
  Archivo: 'The system face — the interface and the article set in one voice.',
  Newsreader: 'A serif cut for long reading; the default in the reader.',
  'Plex Mono': 'Fixed width, for code-heavy sources and short posts.',
}

const FONTS: ReaderFont[] = ['Archivo', 'Newsreader', 'Plex Mono']
const SIZES: ReaderSize[] = ['Small', 'Regular', 'Large']
const DENSITIES: ListDensity[] = ['Comfortable', 'Compact']

const TOGGLES: { key: keyof Settings; label: string; note: string }[] = [
  {
    key: 'markReadOnScroll',
    label: 'Mark read when scrolled past',
    note: 'In the reader only — the list never marks on its own.',
  },
  {
    key: 'loadImages',
    label: 'Load remote images',
    note: 'Off by default, because images carry trackers.',
  },
  {
    key: 'keepArchive',
    label: 'Keep a local full-text archive',
    note: 'Roughly 40 MB per year of ordinary reading. Turning this off erases the bodies already stored.',
  },
  {
    key: 'showKeyboardHints',
    label: 'Show the shortcut strip',
    note: 'The row of key hints under the article list.',
  },
]

export function SettingsView() {
  const store = useStore()
  const { settings } = store
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const subscribe = async (event: FormEvent) => {
    event.preventDefault()
    setStatus(null)
    try {
      await store.addFeed(url)
      setUrl('')
    } catch (caught) {
      setStatus({
        text: caught instanceof Error ? caught.message : 'Could not add that feed.',
        error: true,
      })
    }
  }

  const ingestOpml = async (read: () => Promise<string | null>) => {
    setStatus(null)
    try {
      const text = await read()
      if (text !== null) await store.importOpml(text)
    } catch (caught) {
      setStatus({
        text: caught instanceof Error ? caught.message : 'Could not read that file.',
        error: true,
      })
    }
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await ingestOpml(() => file.text())
  }

  // The Mac app asks the system for the file; the browser has its own input.
  const chooseFile = () => {
    if (isDesktopApp()) void ingestOpml(pickTextFile)
    else fileRef.current?.click()
  }

  return (
    <section className="settings-col">
      <header className="settings-head">
        <h1 className="t-h">Settings</h1>
        <span className="kicker">Stored on this device</span>
      </header>

      <div className="settings-body scroll">
        <span className="kicker set-legend">Reading</span>
        <div className="set-group">
          <div>
            <label className="kicker set-label">Reading typeface</label>
            <div className="seg">
              {FONTS.map((font) => (
                <button
                  key={font}
                  type="button"
                  className="seg-opt"
                  data-face={font}
                  aria-pressed={settings.font === font}
                  onClick={() => store.update({ font })}
                >
                  {font}
                </button>
              ))}
            </div>
            <p className="set-note">{FONT_NOTES[settings.font]}</p>
          </div>

          <div>
            <label className="kicker set-label">Text size in the reader</label>
            <div className="seg">
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className="seg-opt"
                  aria-pressed={settings.size === size}
                  onClick={() => store.update({ size })}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="kicker set-label">List density</label>
            <div className="seg">
              {DENSITIES.map((density) => (
                <button
                  key={density}
                  type="button"
                  className="seg-opt"
                  aria-pressed={settings.density === density}
                  onClick={() => store.update({ density })}
                >
                  {density}
                </button>
              ))}
            </div>
          </div>

          {TOGGLES.map((toggle) => (
            <button
              key={toggle.key}
              type="button"
              className="check"
              aria-pressed={Boolean(settings[toggle.key])}
              onClick={() => store.update({ [toggle.key]: !settings[toggle.key] } as Partial<Settings>)}
            >
              <span className="check-box" />
              <span>
                <span className="check-label">{toggle.label}</span>
                <span className="check-note">{toggle.note}</span>
              </span>
            </button>
          ))}
        </div>

        <span className="kicker set-legend">Sources</span>
        <form className="set-row" onSubmit={subscribe}>
          <div className="field">
            <label htmlFor="set-url">Feed URL</label>
            <input
              id="set-url"
              className="input"
              type="text"
              inputMode="url"
              placeholder="https://example.com/feed.xml"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={store.busy || !url.trim()}>
            {store.busy ? 'Looking…' : 'Subscribe'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={chooseFile}
            disabled={store.busy}
          >
            Import OPML
          </button>
          <button type="button" className="btn btn-ghost" onClick={store.exportOpml}>
            Export OPML
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            hidden
            onChange={(event) => void importFile(event)}
          />
          {status && (
            <p className={`set-status${status.error ? ' is-error' : ''}`}>{status.text}</p>
          )}
        </form>

        <span className="kicker set-legend">
          {store.feeds.length} {store.feeds.length === 1 ? 'subscription' : 'subscriptions'}
        </span>
        <div className="set-feeds">
          {store.feeds.length === 0 && <p className="set-prose">Nothing yet.</p>}
          {store.feeds.map((feed) => (
            <div className="set-feed" key={feed.id}>
              <span className="set-feed-name">{feed.title}</span>
              <span className={`set-feed-url${feed.lastError ? ' set-feed-error' : ''}`}>
                {feed.lastError || hostOf(feed.url)}
              </span>
              <button
                type="button"
                className="list-action"
                onClick={() => void store.removeFeed(feed.id)}
              >
                Unsubscribe
              </button>
            </div>
          ))}
        </div>

        <span className="kicker set-legend">Suggested</span>
        <div className="set-feeds">
          <Suggestions compact />
        </div>

        <span className="kicker set-legend">Privacy</span>
        {isDesktopApp() ? (
          <p className="set-prose">
            <Tilde /> fetches your feeds and keeps every article in a local index on this Mac.
            There is no <Tilde /> account, no analytics, and nothing is stored on a server. The Mac
            app requests each source directly — nothing passes through this project's proxy, so
            there is not even a middle step that could keep a log. That index lives in{' '}
            <code>~/Library/WebKit/in.kjrlabs.tilde</code>, which macOS keeps even after <Tilde /> is
            moved to the Trash; delete that folder to remove everything.
          </p>
        ) : (
          <p className="set-prose">
            <Tilde /> fetches your feeds and keeps every article in a local index in this browser.
            There is no <Tilde /> account, no analytics, and nothing is stored on a server. On the
            web the fetch passes through this project's own proxy — the only step that exists
            because browsers cannot request feeds directly — and that proxy keeps no log. Clearing
            this site's data deletes everything.
          </p>
        )}
      </div>
    </section>
  )
}
