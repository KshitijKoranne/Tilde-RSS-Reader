/* OPML in and OPML out. Feeds arrive this way and leave this way — the design's
 * second commitment, and the reason there is nothing to lock you in. */

import type { Feed } from './types'

export interface OpmlEntry {
  title: string
  url: string
}

export function parseOpml(xml: string): OpmlEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('That file is not valid OPML.')

  const entries: OpmlEntry[] = []
  const seen = new Set<string>()

  for (const outline of Array.from(doc.querySelectorAll('outline'))) {
    const url = (outline.getAttribute('xmlUrl') || outline.getAttribute('xmlurl') || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    entries.push({
      url,
      title: (outline.getAttribute('title') || outline.getAttribute('text') || '').trim(),
    })
  }

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

export function buildOpml(feeds: Feed[]): string {
  const outlines = feeds
    .map(
      (feed) =>
        `    <outline type="rss" text="${escapeXml(feed.title)}" title="${escapeXml(feed.title)}"` +
        ` xmlUrl="${escapeXml(feed.url)}" htmlUrl="${escapeXml(feed.siteUrl || feed.url)}" />`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Tilde subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${outlines}
  </body>
</opml>
`
}

export function downloadOpml(feeds: Feed[]): void {
  const blob = new Blob([buildOpml(feeds)], { type: 'text/x-opml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tilde-subscriptions-${new Date().toISOString().slice(0, 10)}.opml`
  link.click()
  URL.revokeObjectURL(url)
}
