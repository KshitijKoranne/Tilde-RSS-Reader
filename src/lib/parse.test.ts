import { describe, expect, it } from 'vitest'
import { discoverFeedUrl, looksLikeFeed, parseFeedDocument } from './parse'

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example Blog</title>
    <link>https://example.test/</link>
    <item>
      <title>First post</title>
      <link>/posts/first</link>
      <guid isPermaLink="false">post-1</guid>
      <pubDate>Wed, 02 Oct 2024 08:00:00 GMT</pubDate>
      <dc:creator>Ada</dc:creator>
      <description>A summary.</description>
      <content:encoded><![CDATA[<p>The whole post.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <link rel="self" href="https://atom.test/feed.xml"/>
  <link rel="alternate" href="https://atom.test/"/>
  <entry>
    <title>Entry one</title>
    <link rel="edit" href="https://atom.test/edit/1"/>
    <link rel="alternate" href="https://atom.test/one"/>
    <id>urn:uuid:1</id>
    <published>2024-03-01T10:00:00Z</published>
    <author><name>Grace</name></author>
    <content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
  </entry>
</feed>`

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <channel><title>RDF Feed</title><link>https://rdf.test/</link></channel>
  <item><title>Old style</title><link>https://rdf.test/one</link></item>
</rdf:RDF>`

describe('parseFeedDocument', () => {
  it('reads an RSS 2.0 channel', () => {
    const feed = parseFeedDocument(RSS, 'https://example.test/feed.xml')!
    expect(feed.title).toBe('Example Blog')
    expect(feed.siteUrl).toBe('https://example.test/')
    expect(feed.items).toHaveLength(1)
  })

  it('prefers content:encoded over the description for the body', () => {
    const [item] = parseFeedDocument(RSS, 'https://example.test/feed.xml')!.items
    expect(item.contentHtml).toContain('The whole post.')
    expect(item.summaryHtml).toBe('A summary.')
  })

  it('resolves a relative item link against the site', () => {
    const [item] = parseFeedDocument(RSS, 'https://example.test/feed.xml')!.items
    expect(item.link).toBe('https://example.test/posts/first')
  })

  it('reads dc:creator as the author', () => {
    expect(parseFeedDocument(RSS, 'https://example.test/feed.xml')!.items[0].author).toBe('Ada')
  })

  it('reads an RFC 822 date', () => {
    const [item] = parseFeedDocument(RSS, 'https://example.test/feed.xml')!.items
    expect(item.publishedAt).toBe(Date.parse('Wed, 02 Oct 2024 08:00:00 GMT'))
  })

  it('reads an Atom feed and its alternate links', () => {
    const feed = parseFeedDocument(ATOM, 'https://atom.test/feed.xml')!
    expect(feed.title).toBe('Atom Blog')
    expect(feed.siteUrl).toBe('https://atom.test/')
    expect(feed.items[0].link).toBe('https://atom.test/one')
    expect(feed.items[0].author).toBe('Grace')
  })

  it('reads RSS 1.0, whose items sit outside the channel', () => {
    const feed = parseFeedDocument(RDF, 'https://rdf.test/feed')!
    expect(feed.title).toBe('RDF Feed')
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0].title).toBe('Old style')
  })

  it('refuses a javascript: link rather than passing it to the reader', () => {
    const hostile = RSS.replace('<link>/posts/first</link>', '<link>javascript:alert(1)</link>')
    const [item] = parseFeedDocument(hostile, 'https://example.test/feed.xml')!.items
    expect(item.link).toBe('')
  })

  it('refuses a javascript: guid standing in for a link', () => {
    const hostile = RSS.replace('<link>/posts/first</link>', '')
      .replace('<guid isPermaLink="false">post-1</guid>', '<guid>javascript:alert(1)</guid>')
    const [item] = parseFeedDocument(hostile, 'https://example.test/feed.xml')!.items
    expect(item.link).toBe('')
  })

  it('returns null for malformed XML', () => {
    expect(parseFeedDocument('<rss><channel>', 'https://x.test/')).toBeNull()
  })

  it('returns null for a web page', () => {
    expect(parseFeedDocument('<!doctype html><html><body>hi</body></html>', 'https://x.test/')).toBeNull()
  })

  it('gives an item with no title a placeholder rather than an empty row', () => {
    const untitled = RSS.replace('<title>First post</title>', '')
    expect(parseFeedDocument(untitled, 'https://example.test/feed.xml')!.items[0].title).toBe('Untitled')
  })

  it('keeps items in feed order when none carry a date', () => {
    const undated = `<rss version="2.0"><channel><title>T</title><link>https://t.test/</link>
      <item><title>A</title><link>https://t.test/a</link></item>
      <item><title>B</title><link>https://t.test/b</link></item></channel></rss>`
    const items = parseFeedDocument(undated, 'https://t.test/feed')!.items
    expect(items.map((i) => i.title)).toEqual(['A', 'B'])
    expect(items[0].publishedAt).toBeGreaterThan(items[1].publishedAt)
  })
})

describe('looksLikeFeed', () => {
  it('trusts a feed content type', () => {
    expect(looksLikeFeed('anything', 'application/rss+xml; charset=utf-8')).toBe(true)
  })

  it('sniffs a feed root element when the type is unhelpful', () => {
    expect(looksLikeFeed(RSS, 'text/plain')).toBe(true)
    expect(looksLikeFeed(ATOM, '')).toBe(true)
  })

  it('rejects an HTML page even when it mentions rss', () => {
    expect(looksLikeFeed('<!doctype html><html><a href="/rss">RSS</a></html>', 'text/html')).toBe(false)
  })
})

describe('discoverFeedUrl', () => {
  it('finds the feed a page advertises and resolves it', () => {
    const page = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>`
    expect(discoverFeedUrl(page, 'https://example.test/blog/')).toBe('https://example.test/feed.xml')
  })

  it('prefers RSS over a JSON feed when a page offers both', () => {
    const page = `<html><head>
      <link rel="alternate" type="application/feed+json" href="/feed.json">
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    </head></html>`
    expect(discoverFeedUrl(page, 'https://example.test/')).toBe('https://example.test/feed.xml')
  })

  it('returns null when a page advertises nothing', () => {
    expect(discoverFeedUrl('<html><head></head></html>', 'https://example.test/')).toBeNull()
  })
})
