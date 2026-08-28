/* RSS 2.0, Atom 1.0 and RSS 1.0/RDF, parsed in the browser.
 *
 * Parsing stays on the client on purpose: the server is a byte pipe and nothing
 * more, so the native build can delete it without changing behaviour.
 */

import { htmlToText } from './sanitize'

export interface ParsedItem {
  guid: string
  title: string
  link: string
  author: string
  publishedAt: number
  /** Raw, unsanitised HTML straight from the feed. */
  contentHtml: string
  summaryHtml: string
}

export interface ParsedFeed {
  title: string
  siteUrl: string
  items: ParsedItem[]
}

const FEED_LINK_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/rdf+xml',
  'application/feed+json',
  'text/xml',
  'application/xml',
]

function matches(el: Element, name: string): boolean {
  return el.nodeName.toLowerCase() === name || el.localName.toLowerCase() === name
}

function findChild(parent: Element, ...names: string[]): Element | undefined {
  for (const name of names) {
    for (const child of Array.from(parent.children)) {
      if (matches(child, name)) return child
    }
  }
  return undefined
}

function findChildren(parent: Element, ...names: string[]): Element[] {
  return Array.from(parent.children).filter((child) => names.some((name) => matches(child, name)))
}

/** Text of the first matching child, with any markup or entities flattened. */
function childText(parent: Element, ...names: string[]): string {
  const el = findChild(parent, ...names)
  return el ? htmlToText(el.textContent || '') : ''
}

/** HTML of the first matching child — Atom's type="xhtml" keeps real elements. */
function childHtml(parent: Element, ...names: string[]): string {
  const el = findChild(parent, ...names)
  if (!el) return ''
  if (el.getAttribute('type') === 'xhtml' || el.children.length > 0) return el.innerHTML
  return el.textContent || ''
}

/* Feeds control these strings, and the results end up in href attributes. A
 * feed that offers `javascript:…` as an entry's <link> would otherwise become
 * a script that runs when the reader clicks "Open the original", so the scheme
 * check belongs here, at the single point where feed URLs are built. */
const SAFE_SCHEMES = new Set(['http:', 'https:'])

function resolve(href: string, base: string): string {
  try {
    const url = new URL(href.trim(), base || undefined)
    return SAFE_SCHEMES.has(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

/** Atom allows many <link>s; the readable page is rel="alternate". */
function atomLink(parent: Element, base: string): string {
  const links = findChildren(parent, 'link')
  const alternate =
    links.find((l) => l.getAttribute('rel') === 'alternate') ??
    links.find((l) => !l.getAttribute('rel') || l.getAttribute('rel') === '') ??
    links[0]
  const href = alternate?.getAttribute('href')
  return href ? resolve(href, base) : ''
}

function itemLink(item: Element, base: string): string {
  const link = findChild(item, 'link')
  if (link) {
    const href = link.getAttribute('href') || link.textContent || ''
    if (href.trim()) return resolve(href, base)
  }
  // RSS entries without <link> sometimes carry a permalink guid instead.
  const guid = findChild(item, 'guid')
  const guidText = guid?.textContent?.trim() || ''
  if (/^https?:\/\//i.test(guidText)) return guidText
  return ''
}

function parseDate(value: string, fallback: number): number {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? fallback : parsed
}

export function parseFeedDocument(xml: string, sourceUrl: string): ParsedFeed | null {
  const doc = new DOMParser().parseFromString(xml.trim(), 'application/xml')
  if (doc.querySelector('parsererror')) return null

  const root = doc.documentElement
  if (!root) return null
  const name = root.localName.toLowerCase()

  if (name === 'rss') {
    const channel = findChild(root, 'channel')
    if (!channel) return null
    return readRss(channel, findChildren(channel, 'item'), sourceUrl)
  }
  if (name === 'feed') return readAtom(root, sourceUrl)
  if (name === 'rdf') {
    const channel = findChild(root, 'channel')
    // RSS 1.0 puts <item> beside <channel>, not inside it.
    const items = findChildren(root, 'item')
    return channel ? readRss(channel, items, sourceUrl) : null
  }
  return null
}

function readRss(channel: Element, itemEls: Element[], sourceUrl: string): ParsedFeed {
  const siteUrl = resolve(childText(channel, 'link') || '', sourceUrl)
  const now = Date.now()

  const items = itemEls.map((item, index): ParsedItem => {
    const link = itemLink(item, siteUrl || sourceUrl)
    const content = childHtml(item, 'content:encoded', 'encoded')
    const summary = childHtml(item, 'description', 'summary')
    return {
      guid: childText(item, 'guid', 'id') || link || `${sourceUrl}#${index}`,
      title: childText(item, 'title') || 'Untitled',
      link,
      author: childText(item, 'dc:creator', 'creator', 'author'),
      // Feeds routinely omit dates; falling back to "now" keeps ordering stable
      // because the value is stored on first sight and never recomputed.
      publishedAt: parseDate(childText(item, 'pubdate', 'pubDate', 'dc:date', 'date'), now - index),
      contentHtml: content || summary,
      summaryHtml: summary || content,
    }
  })

  return { title: childText(channel, 'title') || 'Untitled feed', siteUrl, items }
}

function readAtom(feed: Element, sourceUrl: string): ParsedFeed {
  const siteUrl = atomLink(feed, sourceUrl)
  const now = Date.now()

  const items = findChildren(feed, 'entry').map((entry, index): ParsedItem => {
    const link = atomLink(entry, siteUrl || sourceUrl)
    const authorEl = findChild(entry, 'author')
    const content = childHtml(entry, 'content')
    const summary = childHtml(entry, 'summary')
    return {
      guid: childText(entry, 'id') || link || `${sourceUrl}#${index}`,
      title: childText(entry, 'title') || 'Untitled',
      link,
      author: authorEl ? childText(authorEl, 'name') : childText(entry, 'dc:creator', 'creator'),
      publishedAt: parseDate(
        childText(entry, 'published', 'updated', 'issued', 'dc:date'),
        now - index,
      ),
      contentHtml: content || summary,
      summaryHtml: summary || content,
    }
  })

  return { title: childText(feed, 'title') || 'Untitled feed', siteUrl, items }
}

/** Finds the feed a web page advertises via <link rel="alternate">. */
export function discoverFeedUrl(html: string, baseUrl: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const links = Array.from(doc.querySelectorAll('link[rel~="alternate" i][href]'))

  for (const type of FEED_LINK_TYPES) {
    const match = links.find((l) => (l.getAttribute('type') || '').toLowerCase() === type)
    const href = match?.getAttribute('href')
    if (href) return resolve(href, baseUrl) || null
  }
  return null
}

/** True when the bytes look like a feed rather than a web page. */
export function looksLikeFeed(text: string, contentType: string): boolean {
  if (/(rss|atom|rdf)\+xml/i.test(contentType)) return true
  const head = text.slice(0, 1500).toLowerCase()
  if (/<!doctype\s+html/.test(head) || /<html[\s>]/.test(head)) return false
  return /<(rss|feed|rdf:rdf)[\s>]/.test(head)
}
