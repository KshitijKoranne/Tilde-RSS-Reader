import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TildeMark } from '../components/TildeMark'
import { Brand, Tilde } from '../components/Wordmark'
import { readGlance } from '../lib/glance'
import '../styles/landing.css'

const REPO = 'https://github.com/KshitijKoranne/Tilde-RSS-Reader'
const MAC_RELEASE = `${REPO}/releases/latest`

/* iPadOS reports itself as a Mac, so the touch count is the tiebreaker. It
 * only decides whether the hero offers the download — the section below always
 * does, because someone on a phone may well be choosing for their laptop. */
function onMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const mac = /Mac/i.test(navigator.platform || '') || /Mac OS X/i.test(navigator.userAgent)
  return mac && navigator.maxTouchPoints <= 1
}

const FACTS = [
  { value: 'Free', label: 'No paid tier, no trial' },
  { value: 'No sign-up', label: 'Nothing to create or cancel' },
  { value: 'Yours', label: 'Your reading stays on your device' },
  { value: 'Quiet', label: 'No ads, no trackers, no suggestions' },
]

const REASONS: { num: string; title: string; body: ReactNode }[] = [
  {
    num: '01',
    title: 'You actually finish',
    body: (
      <>
        Most readers scroll forever. <Tilde /> shows what is new since you last looked, and once you
        have read it the list is empty and says so. Nothing refills it to keep you busy.
      </>
    ),
  },
  {
    num: '02',
    title: 'You choose what shows up',
    body: (
      <>
        Paste a link to any site, or bring your whole list over from another reader in one file.{' '}
        <Tilde /> never reorders your feeds or slips in posts you did not ask for.
      </>
    ),
  },
  {
    num: '03',
    title: 'You can find it again',
    body: (
      <>
        Every article you open is saved on your own computer, in full. Search a half-remembered
        phrase months later and it is still there — even if the site that published it is gone.
      </>
    ),
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
  // Read once, before first paint, so the button never swaps under the cursor.
  const [glance] = useState(readGlance)
  const [mac] = useState(onMac)
  const returning = (glance?.feeds ?? 0) > 0
  const unread = glance?.unread ?? 0

  useEffect(() => {
    document.title = 'Tilde — a free RSS reader for Mac and the web'
  }, [])

  return (
    <div className="landing">
      <nav className="nav">
        <span className="nav-brand">
          <Brand size={22} />
        </span>
        <a href="#why">
          Why <Tilde />
        </a>
        <a href="#compare">How it compares</a>
        <a href="#mac">Mac app</a>
        <a href="#keys">Shortcuts</a>
        <Link to="/app" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
          <span className="btn-label">
            {returning ? (
              'Continue reading'
            ) : (
              <>
                Open <Tilde />
              </>
            )}
          </span>
        </Link>
      </nav>

      <div className="wrap">
        <section className="hero">
          <h1 className="t-display">
            <span>All the sites you read.</span>
            <span className="hero-accent">In one place.</span>
          </h1>
          <p className="hero-lede">
            <Tilde /> collects new posts from the blogs, news sites and newsletters you pick — and
            nothing else. It is free, there is no account, and everything stays on your own device.
          </p>
          <p className="hero-lede">
            You will reach the end. No endless scroll, no algorithm deciding what you see, and
            nothing recommended to you.
          </p>
          <div className="hero-cta">
            <Link to="/app" className="btn btn-primary">
              <TildeMark size={16} />
              <span className="btn-label">
                {returning ? (
                  unread > 0 ? (
                    `Continue reading — ${unread} unread`
                  ) : (
                    'Continue reading'
                  )
                ) : (
                  <>
                    Open <Tilde />
                  </>
                )}
              </span>
            </Link>
            {mac ? (
              <a href={MAC_RELEASE} className="btn btn-secondary">
                <span className="btn-label">Download for Mac</span>
              </a>
            ) : (
              <a href="#why" className="btn btn-secondary">
                <span className="btn-label">How it works</span>
              </a>
            )}
          </div>
          <p className="hero-note">
            Free either way — the same reader in a browser tab or in your Dock.{' '}
            <a href="#mac">What is the difference?</a>
          </p>
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
          <h2 className="t-display">
            <Tilde /> and a typical cloud reader
          </h2>
          <div className="compare-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th className="compare-brand">
                    <Tilde />
                  </th>
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
            <Tilde /> is a web page, so there is nothing to install — and a Mac app, if you would
            rather have it in the Dock. Open either one, add a few sites, and it remembers them next
            time.
          </p>
        </section>

        <hr className="hr" />

        <section id="mac" className="choose">
          <span className="eyebrow">Two ways to read</span>
          <h2 className="t-display">In a browser, or in your Dock</h2>
          <p className="choose-lede">
            The same reader either way — same feeds, same shortcuts, same articles kept on your own
            machine. What changes is where it runs.
          </p>

          <div className="choose-grid">
            <article className="choose-card">
              <span className="kicker">On the web</span>
              <h3 className="t-display">Nothing to install</h3>
              <ul className="choose-list">
                <li>Opens in any browser, on any computer</li>
                <li>Your reading is kept in that browser, on that machine</li>
                <li>
                  Feeds arrive through <Tilde />&rsquo;s own proxy, because a browser is not allowed
                  to request them directly
                </li>
              </ul>
              <Link to="/app" className="btn btn-primary">
                <TildeMark size={16} />
                <span className="btn-label">
                  {returning ? 'Continue reading' : <>Open <Tilde /></>}
                </span>
              </Link>
              <p className="choose-foot">Free. No account. Works today.</p>
            </article>

            <article className="choose-card">
              <span className="kicker">On macOS</span>
              <h3 className="t-display">A real app</h3>
              <ul className="choose-list">
                <li>Lives in the Dock and in &#8984;-Tab, like anything else you use</li>
                <li>Fetches every source directly — no proxy in the middle at all</li>
                <li>Opens and reads with the network off, every time, not just when a cache agrees</li>
              </ul>
              <a href={MAC_RELEASE} className="btn btn-primary">
                <TildeMark size={16} />
                <span className="btn-label">Download for Mac</span>
              </a>
              <p className="choose-foot">
                Free. One universal build for Apple silicon and Intel. macOS 10.15 or later.
              </p>
            </article>
          </div>

          <details className="choose-details">
            <summary>macOS will warn you the first time. Here is why, and what to do.</summary>
            <p>
              Apple charges $99 a year for the developer account that signs and notarises Mac
              software. <Tilde /> does not have one, so macOS cannot look up who built it. The
              warning is about a missing signature, not about anything the app does.
            </p>
            <p>
              Open the disk image and drag <Tilde /> to Applications. Then{' '}
              <strong>right-click it and choose Open</strong>, and Open again when asked. If macOS
              refuses outright, go to <strong>System Settings → Privacy &amp; Security</strong>,
              scroll to the note about <Tilde />, and press <strong>Open Anyway</strong>. It is once,
              not every launch.
            </p>
            <p>
              If you would rather not take anyone&rsquo;s word for it: the whole app is{' '}
              <a href={REPO} target="_blank" rel="noopener noreferrer">
                on GitHub
              </a>{' '}
              and builds from source in one command.
            </p>
          </details>
        </section>

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
            {returning ? (
              <>
                <span>Pick up</span>
                <span>where you left off.</span>
              </>
            ) : (
              <>
                <span>Start reading.</span>
                <span>It takes a minute.</span>
              </>
            )}
          </h3>
          <div className="band-cta">
            <Link to="/app" className="btn btn-ghost">
              <TildeMark size={18} />
              <span className="btn-label">
                {returning ? (
                  'Continue reading'
                ) : (
                  <>
                    Open <Tilde /> — free, no account
                  </>
                )}
              </span>
            </Link>
            <a href={MAC_RELEASE} className="btn btn-ghost">
              <span className="btn-label">Download for Mac</span>
            </a>
          </div>
        </div>
      </section>

      <div className="wrap">
        <footer>
          <Brand size={18} />
          <span>a calm reader for the sites you choose.</span>
          <span className="footer-by">
            Made by{' '}
            <a href="https://kjrlabs.in" target="_blank" rel="noopener noreferrer">
              KJR Labs
            </a>
          </span>
        </footer>
      </div>
    </div>
  )
}
