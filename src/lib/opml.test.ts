import { describe, expect, it } from 'vitest'
import { buildOpml, parseOpml } from './opml'
import type { Feed } from './types'

const feed = (title: string, url: string, group = ''): Feed => ({
  id: url,
  url,
  siteUrl: `https://${title.toLowerCase()}.test/`,
  title,
  addedAt: 0,
  group,
  lastFetchedAt: 0,
  lastError: '',
})

const FLAT = `<?xml version="1.0"?>
<opml version="1.0"><head><title>subs</title></head><body>
  <outline type="rss" text="One" xmlUrl="https://one.test/feed" />
  <outline type="rss" title="Two" xmlUrl="https://two.test/feed" />
</body></opml>`

const FOLDERED = `<?xml version="1.0"?>
<opml version="1.0"><head><title>subs</title></head><body>
  <outline text="Technology">
    <outline type="rss" text="Ars" xmlUrl="https://ars.test/feed" />
    <outline type="rss" text="Verge" xmlUrl="https://verge.test/feed" />
  </outline>
  <outline text="Science">
    <outline type="rss" text="Quanta" xmlUrl="https://quanta.test/feed" />
  </outline>
  <outline type="rss" text="Loose" xmlUrl="https://loose.test/feed" />
</body></opml>`

describe('parseOpml', () => {
  it('reads a flat file, with no group on anything', () => {
    expect(parseOpml(FLAT)).toEqual([
      { url: 'https://one.test/feed', title: 'One', group: '' },
      { url: 'https://two.test/feed', title: 'Two', group: '' },
    ])
  })

  it('reads the folder a feed sits in as its group', () => {
    const entries = parseOpml(FOLDERED)
    expect(entries.map((e) => [e.title, e.group])).toEqual([
      ['Ars', 'Technology'],
      ['Verge', 'Technology'],
      ['Quanta', 'Science'],
      ['Loose', ''],
    ])
  })

  it('flattens deeper nesting to the folder nearest the feed', () => {
    const nested = `<opml><body><outline text="Outer"><outline text="Inner">
      <outline type="rss" text="Deep" xmlUrl="https://deep.test/feed" />
    </outline></outline></body></opml>`
    expect(parseOpml(nested)[0].group).toBe('Inner')
  })

  it('falls back to the enclosing folder when one in between is unnamed', () => {
    const nested = `<opml><body><outline text="Outer"><outline>
      <outline type="rss" text="Deep" xmlUrl="https://deep.test/feed" />
    </outline></outline></body></opml>`
    expect(parseOpml(nested)[0].group).toBe('Outer')
  })

  it('accepts the lowercase xmlurl some exporters write', () => {
    const odd = `<opml><body><outline type="rss" text="Odd" xmlurl="https://odd.test/feed" /></body></opml>`
    expect(parseOpml(odd)[0].url).toBe('https://odd.test/feed')
  })

  it('keeps the first copy of a feed listed in two folders', () => {
    const dupe = `<opml><body>
      <outline text="A"><outline type="rss" text="X" xmlUrl="https://x.test/feed" /></outline>
      <outline text="B"><outline type="rss" text="X" xmlUrl="https://x.test/feed" /></outline>
    </body></opml>`
    const entries = parseOpml(dupe)
    expect(entries).toHaveLength(1)
    expect(entries[0].group).toBe('A')
  })

  it('prefers title over text for a feed name', () => {
    const both = `<opml><body><outline type="rss" title="Real" text="Fallback" xmlUrl="https://x.test/f" /></body></opml>`
    expect(parseOpml(both)[0].title).toBe('Real')
  })

  it('rejects a file that is not OPML', () => {
    expect(() => parseOpml('not xml at all <')).toThrow(/not valid OPML/)
  })

  it('rejects valid XML with no feeds in it', () => {
    expect(() => parseOpml('<opml><body></body></opml>')).toThrow(/No feeds/)
  })
})

describe('buildOpml', () => {
  it('nests grouped feeds inside a folder outline', () => {
    const xml = buildOpml([feed('Ars', 'https://ars.test/feed', 'Technology')])
    expect(xml).toContain('<outline text="Technology" title="Technology">')
    expect(xml).toContain('xmlUrl="https://ars.test/feed"')
  })

  it('leaves ungrouped feeds at the top level', () => {
    const xml = buildOpml([feed('Loose', 'https://loose.test/feed')])
    expect(xml).not.toContain('</outline>')
  })

  it('escapes a name that would otherwise break the file', () => {
    const xml = buildOpml([feed('X', 'https://x.test/feed', 'Cats & "dogs" <b>')])
    expect(xml).toContain('text="Cats &amp; &quot;dogs&quot; &lt;b&gt;"')
    expect(() => parseOpml(xml)).not.toThrow()
  })

  it('survives a round trip with its groups intact', () => {
    const feeds = [
      feed('Ars', 'https://ars.test/feed', 'Technology'),
      feed('Quanta', 'https://quanta.test/feed', 'Science'),
      feed('Loose', 'https://loose.test/feed'),
    ]
    const entries = parseOpml(buildOpml(feeds))
    expect(entries).toEqual(
      expect.arrayContaining([
        { url: 'https://ars.test/feed', title: 'Ars', group: 'Technology' },
        { url: 'https://quanta.test/feed', title: 'Quanta', group: 'Science' },
        { url: 'https://loose.test/feed', title: 'Loose', group: '' },
      ]),
    )
    expect(entries).toHaveLength(3)
  })

  it('round-trips a file exported by another reader without losing folders', () => {
    const first = parseOpml(FOLDERED)
    const feeds = first.map((e) => feed(e.title, e.url, e.group))
    // Export orders groups alphabetically, so compare the set, not the order.
    const again = parseOpml(buildOpml(feeds))
    expect(again).toHaveLength(first.length)
    expect(again).toEqual(expect.arrayContaining(first))
  })
})
