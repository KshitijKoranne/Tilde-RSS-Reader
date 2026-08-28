import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TildeMark } from '../components/TildeMark'
import '../styles/landing.css'

const FACTS = [
  { value: 'Free', label: 'No paid tier, no trial' },
  { value: 'No sign-up', label: 'Nothing to create or cancel' },
  { value: 'Yours', label: 'Your reading stays on your device' },
  { value: 'Quiet', label: 'No ads, no trackers, no suggestions' },
]

const REASONS = [
  {
    num: '01',
    title: 'You actually finish',
    body: 'Most readers scroll forever. Tilde shows what is new since you last looked, and once you have read it the list is empty and says so. Nothing refills it to keep you busy.',
  },
  {
    num: '02',
    title: 'You choose what shows up',
    body: 'Paste a link to any site, or bring your whole list over from another reader in one file. Tilde never reorders your feeds or slips in posts you did not ask for.',
  },
  {
    num: '03',
    title: 'You can find it again',
    body: 'Every article you open is saved on your own computer, in full. Search a half-remembered phrase months later and it is still there — even if the site that published it is gone.',
  },
]

const COMPARISON = [
  ['Account', 'Not needed', 'Required'],
  ['Where your reading lives', 'On your device', 'On their servers'],
  ['Cost', 'Free', 'Free tier, then a subscription'],
  ['Suggested or sponsored posts', 'None', 'Common'],
  ['Taking your feeds elsewhere', 'One file, any time', 'Sometimes limited'],
]

const KEYS = [
  [
    ['j / k', 'Next, previous article'],
    ['o', 'Open it'],
    ['m', 'Mark read or unread'],
  ],
  [
    ['s', 'Save for later'],
    ['/', 'Search everything you have read'],
    ['a', 'Add a site'],
  ],
]

export function Landing() {
  useEffect(() => {
    document.title = 'Tilde — all the sites you read, in one place'
  }, [])

  return (
    <div className="landing">
      <nav className="nav">
        <span className="nav-brand">
          <span style={{ color: 'var(--color-accent)' }}>
            <TildeMark size={22} />
          </span>
          <span className="wordmark">Tilde</span>
        </span>
        <a href="#why">Why Tilde</a>
        <a href="#compare">How it compares</a>
        <a href="#keys">Shortcuts</a>
        <Link to="/app" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
          Open Tilde
        </Link>
      </nav>

      <div className="wrap">
        <section className="hero">
          <h1 className="t-display">
            <span>All the sites you read.</span>
            <span className="hero-accent">In one place.</span>
          </h1>
          <p className="hero-lede">
            Tilde collects new posts from the blogs, news sites and newsletters you pick — and
            nothing else. It is free, there is no account, and everything stays on your own device.
          </p>
          <p className="hero-lede">
            You will reach the end. No endless scroll, no algorithm deciding what you see, and
            nothing recommended to you.
          </p>
          <div className="hero-cta">
            <Link to="/app" className="btn btn-primary">
              Open Tilde
            </Link>
            <a href="#why" className="btn btn-ghost">
              How it works
            </a>
          </div>
        </section>

        <hr className="hr" />

        <section className="stats">
          <div className="stats-grid">
            {FACTS.map((fact) => (
              <div key={fact.label}>
                <p className="t-display stat-num">{fact.value}</p>
                <p className="stat-label">{fact.label}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="hr" />

        <section id="why" className="features">
          <span className="eyebrow">Why people use it</span>
          {REASONS.map((item) => (
            <div className="feature" key={item.num}>
              <p className="t-display feature-num">{item.num}</p>
              <h2 className="t-display">{item.title}</h2>
              <p>{item.body}</p>
            </div>
          ))}
        </section>

        <hr className="hr" />

        <section id="compare" className="compare">
          <span className="eyebrow">How it compares</span>
          <h2 className="t-display">Tilde and a typical cloud reader</h2>
          <div className="compare-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Tilde</th>
                  <th>Typical cloud reader</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(([label, tilde, other]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="compare-yes">{tilde}</td>
                    <td className="compare-other">{other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="compare-note">
            Tilde is a web page, so there is nothing to install. Open it, add a few sites, and it
            remembers them next time.
          </p>
        </section>

        <hr className="hr" />

        <section id="keys" className="keys">
          <span className="eyebrow">Built for the keyboard</span>
          <h2 className="t-display">One key for everything</h2>
          <div className="keys-grid">
            {KEYS.map((group, index) => (
              <table className="table" key={index}>
                <tbody>
                  {group.map(([key, description]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </section>
      </div>

      <section className="band">
        <div className="band-inner">
          <h3 className="t-display">
            <span>Start reading.</span>
            <span>It takes a minute.</span>
          </h3>
          <div className="band-cta">
            <Link to="/app" className="btn btn-ghost">
              Open Tilde — free, no account
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap">
        <footer>Tilde — a calm reader for the sites you choose.</footer>
      </div>
    </div>
  )
}
