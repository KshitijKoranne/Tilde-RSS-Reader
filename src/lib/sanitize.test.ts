import { describe, expect, it } from 'vitest'
import { htmlToText, makeExcerpt, sanitizeHtml } from './sanitize'

const clean = (dirty: string, options?: Parameters<typeof sanitizeHtml>[1]) =>
  sanitizeHtml(dirty, { allowImages: true, ...options }).html

describe('sanitizeHtml', () => {
  it('keeps ordinary prose intact', () => {
    expect(clean('<p>Hello <em>there</em></p>')).toBe('<p>Hello <em>there</em></p>')
  })

  it('removes a script and its contents', () => {
    expect(clean('<p>a</p><script>alert(1)</script><p>b</p>')).toBe('<p>a</p><p>b</p>')
  })

  it('removes iframes, objects and styles with their contents', () => {
    const html = clean('<iframe src="https://evil.test"></iframe><style>p{}</style><object></object>x')
    expect(html).toBe('x')
  })

  it('unwraps an unknown tag but keeps the text inside it', () => {
    expect(clean('<marquee>still readable</marquee>')).toBe('still readable')
  })

  it('drops every event handler attribute', () => {
    expect(clean('<p onclick="steal()" onmouseover="x">hi</p>')).toBe('<p>hi</p>')
  })

  it('drops a javascript: href', () => {
    // eslint-disable-next-line no-script-url
    expect(clean('<a href="javascript:alert(1)">click</a>')).toBe('<a>click</a>')
  })

  it('drops a javascript: href hidden behind whitespace and case', () => {
    expect(clean('<a href="  JaVaScRiPt:alert(1)">click</a>')).toBe('<a>click</a>')
  })

  it('drops a data: URL image', () => {
    expect(clean('<img src="data:text/html;base64,PHNjcmlwdD4=">')).toBe(
      '<img loading="lazy" referrerpolicy="no-referrer">',
    )
  })

  it('keeps mailto on a link but not on an image', () => {
    expect(clean('<a href="mailto:a@b.test">mail</a>')).toContain('href="mailto:a@b.test"')
    expect(clean('<img src="mailto:a@b.test">')).not.toContain('src=')
  })

  it('resolves a relative href against the article link', () => {
    const html = clean('<a href="/about">about</a>', { baseUrl: 'https://example.test/posts/one' })
    expect(html).toContain('href="https://example.test/about"')
  })

  it('marks outgoing links so they cannot reach back through window.opener', () => {
    const html = clean('<a href="https://example.test">x</a>')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('target="_blank"')
  })

  describe('with images switched off', () => {
    it('removes the image and reports that it did', () => {
      const result = sanitizeHtml('<p>a</p><img src="https://x.test/p.gif">', { allowImages: false })
      expect(result.html).toBe('<p>a</p>')
      expect(result.imagesStripped).toBe(true)
    })

    it('does not report stripping when there was no image', () => {
      expect(sanitizeHtml('<p>a</p>', { allowImages: false }).imagesStripped).toBe(false)
    })

    it('removes a figure left empty by its stripped image', () => {
      expect(sanitizeHtml('<figure><img src="https://x.test/p.gif"></figure>', {}).html).toBe('')
    })

    it('keeps a figure that still has a caption', () => {
      const html = sanitizeHtml('<figure><img src="https://x.test/p.gif"><figcaption>A cat</figcaption></figure>', {}).html
      expect(html).toContain('A cat')
    })
  })

  it('returns nothing for empty input', () => {
    expect(sanitizeHtml('')).toEqual({ html: '', imagesStripped: false })
  })
})

describe('htmlToText', () => {
  it('flattens markup and collapses whitespace', () => {
    expect(htmlToText('<p>one</p>\n\n  <p>two   three</p>')).toBe('one two three')
  })

  it('does not leak script or style bodies into the search index', () => {
    expect(htmlToText('<style>p{color:red}</style><p>real</p><script>x=1</script>')).toBe('real')
  })

  it('decodes entities', () => {
    expect(htmlToText('caf&eacute; &amp; bar')).toBe('café & bar')
  })
})

describe('makeExcerpt', () => {
  it('returns short text unchanged', () => {
    expect(makeExcerpt('<p>Short one.</p>')).toBe('Short one.')
  })

  it('cuts on a word boundary and adds an ellipsis', () => {
    const excerpt = makeExcerpt(`<p>${'alpha '.repeat(60)}</p>`, 40)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(41)
    expect(excerpt).not.toContain('alph…')
  })
})
