import { describe, expect, it } from 'vitest'
import { groupFeeds, groupNames, makeFeed, normalizeInput, toArticles } from './feeds'
import type { ParsedFeed } from './parse'
import type { Article, Feed } from './types'

const feed = (title: string, group = ''): Feed => ({
  id: `https://${title}.test/feed`,
  url: `https://${title}.test/feed`,
  siteUrl: `https://${title}.test/`,
  title,
  addedAt: 0,
  group,
  lastFetchedAt: 0,
  lastError: '',
})

describe('normalizeInput', () => {
  it('assumes https for a bare host', () => {
    expect(normalizeInput('example.com')).toBe('https://example.com')
  })

  it('rewrites the feed:// scheme browsers still hand out', () => {
    expect(normalizeInput('feed://example.com/rss')).toBe('https://example.com/rss')
  })

  it('leaves a full address alone', () => {
    expect(normalizeInput('  http://example.com/rss  ')).toBe('http://example.com/rss')
  })

  it('returns nothing for blank input', () => {
    expect(normalizeInput('   ')).toBe('')
  })
})

describe('groupFeeds', () => {
  it('puts named groups first, alphabetically', () => {
    const groups = groupFeeds([feed('a', 'Zed'), feed('b', 'Alpha')])
    expect(groups.map((g) => g.name)).toEqual(['Alpha', 'Zed'])
  })

  it('collects ungrouped feeds last, under an empty name', () => {
    const groups = groupFeeds([feed('loose'), feed('a', 'Tech')])
    expect(groups.map((g) => g.name)).toEqual(['Tech', ''])
    expect(groups[1].feeds.map((f) => f.title)).toEqual(['loose'])
  })

  it('omits the trailing bucket when everything is grouped', () => {
    expect(groupFeeds([feed('a', 'Tech')]).map((g) => g.name)).toEqual(['Tech'])
  })

  it('keeps the order feeds arrive in within a group', () => {
    const groups = groupFeeds([feed('alpha', 'T'), feed('beta', 'T'), feed('gamma', 'T')])
    expect(groups[0].feeds.map((f) => f.title)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('loses nobody', () => {
    const feeds = [feed('a', 'X'), feed('b'), feed('c', 'Y'), feed('d', 'X')]
    const total = groupFeeds(feeds).reduce((n, g) => n + g.feeds.length, 0)
    expect(total).toBe(feeds.length)
  })

  it('returns nothing for no feeds', () => {
    expect(groupFeeds([])).toEqual([])
  })
})

describe('groupNames', () => {
  it('lists each group once, sorted, ignoring the ungrouped', () => {
    expect(groupNames([feed('a', 'Tech'), feed('b'), feed('c', 'Art'), feed('d', 'Tech')])).toEqual([
      'Art',
      'Tech',
    ])
  })
})

describe('makeFeed', () => {
  const parsed: ParsedFeed = { title: 'Example', siteUrl: 'https://example.test/', items: [] }

  it('records the group it was added under', () => {
    expect(makeFeed('https://example.test/feed', parsed, 'News').group).toBe('News')
  })

  it('defaults to no group', () => {
    expect(makeFeed('https://example.test/feed', parsed).group).toBe('')
  })
})

describe('toArticles', () => {
  const parsed: ParsedFeed = {
    title: 'Example',
    siteUrl: 'https://example.test/',
    items: [
      {
        guid: 'one',
        title: 'First',
        link: 'https://example.test/one',
        author: 'Ada',
        publishedAt: 1_000,
        contentHtml: '<p>Body <script>alert(1)</script></p>',
        summaryHtml: '<p>Summary</p>',
      },
    ],
  }
  const source = feed('example')

  const build = (options: Partial<Parameters<typeof toArticles>[2]> = {}) => {
    let next = 1
    return toArticles(source, parsed, {
      keepArchive: true,
      existing: new Map(),
      nextSeq: () => next++,
      ...options,
    })
  }

  it('sanitises the body before it is ever stored', () => {
    const [{ body }] = build()
    expect(body?.html).not.toContain('script')
    expect(body?.html).toContain('Body')
  })

  it('records the text length on the article and the text beside it', () => {
    const [{ article, body }] = build()
    expect(article.bodyChars).toBe(body?.text.length)
    expect(body?.text).toContain('Body')
    expect(body).not.toBeNull()
  })

  it('numbers a new article and keeps the number on the next refresh', () => {
    const [{ article }] = build()
    expect(article.seq).toBe(1)

    const existing = new Map<string, Article>([[article.id, { ...article, seq: 42 }]])
    expect(build({ existing })[0].article.seq).toBe(42)
  })

  it('keeps read and starred state across a refresh', () => {
    const [{ article }] = build()
    const existing = new Map<string, Article>([[article.id, { ...article, read: true, starred: true }]])
    const again = build({ existing })[0].article
    expect(again.read).toBe(true)
    expect(again.starred).toBe(true)
  })

  it('never moves an article that has already been seen', () => {
    const [{ article }] = build()
    const existing = new Map<string, Article>([[article.id, { ...article, publishedAt: 42 }]])
    let next = 1
    const moved = { ...parsed, items: [{ ...parsed.items[0], publishedAt: 9_999 }] }
    const again = toArticles(source, moved, { keepArchive: true, existing, nextSeq: () => next++ })
    expect(again[0].article.publishedAt).toBe(42)
  })

  it('writes no body at all when the archive is switched off', () => {
    const [{ article, body }] = build({ keepArchive: false })
    expect(body).toBeNull()
    expect(article.bodyChars).toBe(0)
    expect(article.excerpt).toBe('Summary')
  })
})
