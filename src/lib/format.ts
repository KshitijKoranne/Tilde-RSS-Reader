const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const THIS_YEAR = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const OTHER_YEAR = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** The list's time column: clock today, weekday this week, date beyond that. */
export function shortTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const today = new Date(now)

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const days = Math.floor((startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86_400_000)

  if (days <= 0) return TIME.format(date)
  if (days === 1) return 'Yesterday'
  if (days < 7) return WEEKDAY.format(date)
  if (date.getFullYear() === today.getFullYear()) return THIS_YEAR.format(date)
  return OTHER_YEAR.format(date)
}

export function fullDate(timestamp: number): string {
  if (!timestamp) return ''
  const now = Date.now()
  const date = new Date(timestamp)
  const withinWeek = now - timestamp < 7 * 86_400_000
  return withinWeek
    ? `${shortTime(timestamp, now)}`
    : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "craigmod.com" — what a source is, shown when its title is unhelpful. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
