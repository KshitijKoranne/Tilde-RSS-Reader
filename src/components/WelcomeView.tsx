import { useStore } from '../lib/store'
import { Suggestions } from './Suggestions'

/* The first-run screen. Tilde subscribes to nothing on your behalf, so this is
 * where an empty install starts: a shortlist to pick from, and two other ways
 * in for people who already know what they want. It stays put while you choose
 * more than one — leaving is an explicit click. */
export function WelcomeView() {
  const store = useStore()
  const count = store.feeds.length

  return (
    <section className="welcome-col">
      <header className="settings-head">
        <h1 className="t-h">Choose your sources</h1>
        <span className="kicker">
          {count ? `${count} added` : 'Nothing is added for you'}
        </span>
        {count > 0 && (
          <button
            type="button"
            className="btn btn-primary welcome-go"
            onClick={() => store.go('inbox')}
          >
            Start reading →
          </button>
        )}
      </header>

      <div className="settings-body scroll">
        <p className="set-prose welcome-intro">
          Pick anything below to follow it. You can also paste the address of any site or feed, or
          bring your whole list over from another reader as an OPML file.
        </p>

        <div className="welcome-actions">
          <button type="button" className="btn btn-secondary" onClick={() => store.setShowAdd(true)}>
            Add a site by address
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => store.go('settings')}>
            Import OPML
          </button>
        </div>

        <Suggestions />
      </div>
    </section>
  )
}
