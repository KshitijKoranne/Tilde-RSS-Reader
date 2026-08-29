/* OPML in and OPML out. Feeds arrive this way and leave this way — the design's
 * second commitment, and the reason there is nothing to lock you in.
 *
 * OPML carries grouping in its shape: an <outline> with no xmlUrl is a folder,
 * and the feeds inside it are its children. Tilde reads that as a source group
 * and writes it back the same way, so a list that arrives organised leaves
 * organised. Anything more deeply nested than one level is flattened to the
 * folder nearest the feed, because that is the group the reader would name.
 */

import { saveTextFile } from './platform'
import type { Feed } from './types'

export interface OpmlEntry {
  title: string
  url: string
  /** The enclosing folder's name; empty for a feed at the top level. */
  group: string
}

function outlineName(outline: Element): string {
  return (outline.getAttribute('title') || outline.getAttribute('text') || '').trim()
}

function feedUrlOf(outline: Element): string {
  // Attribute names are case-sensitive in XML, and exporters disagree.
  for (const attr of Array.from(outline.attributes)) {
    if (attr.name.toLowerCase() === 'xmlurl') return attr.value.trim()
  }
  return ''
}

export function parseOpml(xml: string): OpmlEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('That file is not valid OPML.')

  const entries: OpmlEntry[] = []
  const seen = new Set<string>()

  const walk = (parent: Element, group: string) => {
    for (const child of Array.from(parent.children)) {
      if (child.localName.toLowerCase() !== 'outline') continue
      const url = feedUrlOf(child)
      if (url) {
        if (seen.has(url)) continue
        seen.add(url)
        entries.push({ url, title: outlineName(child), group })
        continue
      }
      // A folder. Its own name wins over its parent's for anything inside it.
      walk(child, outlineName(child) || group)
    }
  }

  const body = Array.from(doc.documentElement.children).find(
    (el) => el.localName.toLowerCase() === 'body',
  )
  walk(body ?? doc.documentElement, '')

  if (!entries.length) throw new Error('No feeds found in that file.')
  return entries
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function feedOutline(feed: Feed, indent: string): string {
  return (
    `${indent}<outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}"` +
    ` xmlUrl="${escapeXml(feed.url)}" htmlUrl="${escapeXml(feed.siteUrl || feed.url)}" />`
  )
}

export function buildOpml(feeds: Feed[]): string {
  const groups = new Map<string, Feed[]>()
  const loose: Feed[] = []
  for (const feed of feeds) {
    if (!feed.group) loose.push(feed)
    else groups.set(feed.group, [...(groups.get(feed.group) ?? []), feed])
  }

  const lines = [
    ...[...groups.keys()].sort((a, b) => a.localeCompare(b)).map((name) => {
      const inner = groups.get(name)!.map((feed) => feedOutline(feed, '      ')).join('\n')
      return `    <outline text="${escapeXml(name)}" title="${escapeXml(name)}">\n${inner}\n    </outline>`
    }),
    ...loose.map((feed) => feedOutline(feed, '    ')),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Tilde subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${lines.join('\n')}
  </body>
</opml>
`
}

export async function downloadOpml(feeds: Feed[]): Promise<void> {
  // Where this ends up is the platform's business: a download in a browser, a
  // save panel in the Mac app.
  await saveTextFile(
    `tilde-subscriptions-${new Date().toISOString().slice(0, 10)}.opml`,
    buildOpml(feeds),
    'text/x-opml',
  )
}
