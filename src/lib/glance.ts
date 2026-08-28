/* A tiny summary of your library, kept in localStorage.
 *
 * The landing page needs to know whether you are a returning reader *before*
 * it paints, so it can say "Continue reading" instead of pitching. IndexedDB
 * is async and would swap the button after the fact, so the reader writes this
 * synchronous crumb instead. It holds counts and nothing else — no titles, no
 * URLs, nothing worth reading if someone else opens the browser.
 */

const KEY = 'tilde:glance'

export interface Glance {
  feeds: number
  unread: number
}

export function readGlance(): Glance | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Glance>
    if (typeof parsed?.feeds !== 'number') return null
    return { feeds: parsed.feeds, unread: Number(parsed.unread) || 0 }
  } catch {
    // Private mode, disabled storage, corrupt value — treat as a new visitor.
    return null
  }
}

export function writeGlance(glance: Glance): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(glance))
  } catch {
    /* nothing here is important enough to fail over */
  }
}
