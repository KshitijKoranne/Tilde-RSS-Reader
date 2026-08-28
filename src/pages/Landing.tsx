import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { TildeMark } from '../components/TildeMark'
import '../styles/landing.css'

const STATS = [
  { value: '0', label: 'Recommendations, ever' },
  { value: '100%', label: 'Sources you added yourself' },
  { value: 'Local', label: 'Where every article is stored' },
  { value: '1', label: 'Window. Three columns. Nothing else.' },
]

const COMMITMENTS = [
  {
    num: '01',
    title: 'Finite by design',
    body: 'One pass through the day’s articles, then the list is empty and says so. No pull-to-refresh loop, no “you might also like”, no badge inventing work. Reading is something you can complete.',
  },
  {
    num: '02',
    title: "Your sources, nobody else's",
    body: 'Paste a URL, import an OPML file, and that is the whole ingestion story. Tilde does not rank your feeds, does not sell what you read, and exports everything back out the day you want to leave.',
  },
  {
    num: '03',
    title: 'An archive that answers',
    body: 'Every article you open is kept in full text, locally, indexed. The half-remembered paragraph from four years ago is three keystrokes away, whether or not the site that published it still exists.',
  },
]

const KEYS = [
  [
    ['j / k', 'Next, previous article'],
    ['o', 'Open in the reader'],
    ['m', 'Mark read or unread'],
  ],
  [
    ['s', 'Save for later'],
    ['/', 'Search the archive'],
    ['a', 'Add a feed'],
  ],
]

export function Landing() {
  useEffect(() => {
    document.title = 'Tilde — an RSS reader that ends'
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
        <a href="#manifesto">Manifesto</a>
        <a href="#features">What it does</a>
        <a href="#keys">Shortcuts</a>
        <Link to="/app" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
          Open Tilde
        </Link>
      </nav>

      <div className="wrap">
        <section id="manifesto" className="hero">
          <h1 className="t-display">
            <span>The feed ends.</span>
            <span className="hero-accent">That is the feature.</span>
          </h1>
          <p className="hero-lede">
            Tilde is a reader for sources you chose yourself. Nothing is recommended to you. Nothing
            is inserted between the things you asked for. The unread count goes down and only down,
            and when it reaches zero the day is finished — no scroll continues past it.
          </p>
          <p className="hero-lede">
            Everything you have ever opened stays on your machine, searchable to the sentence. Feeds
            arrive as OPML and leave as OPML. There is no account watching you read.
          </p>
          <div className="hero-cta">
            <Link to="/app" className="btn btn-primary">
              Open the reader
            </Link>
            <a href="#features" className="btn btn-ghost">
              What it does
            </a>
          </div>
        </section>

        <hr className="hr" />

        <section className="stats">
          <div className="stats-grid">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p className="t-display stat-num">{stat.value}</p>
                <p className="stat-label">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className="hr" />

        <section id="features" className="features">
          <span className="eyebrow">Three commitments</span>
          {COMMITMENTS.map((item) => (
            <div className="feature" key={item.num}>
              <p className="t-display feature-num">{item.num}</p>
              <h2 className="t-display">{item.title}</h2>
              <p>{item.body}</p>
            </div>
          ))}
        </section>

        <hr className="hr" />

        <section id="keys" className="keys">
          <span className="eyebrow">Hands on the keyboard</span>
          <h2 className="t-display">Every action has one key</h2>
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
            <span>Read less.</span>
            <span>Finish it.</span>
          </h3>
          <div className="band-cta">
            <Link to="/app" className="btn btn-ghost">
              Open Tilde — free, local, yours
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap">
        <footer>Tilde — an RSS reader that ends.</footer>
      </div>
    </div>
  )
}
