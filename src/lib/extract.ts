/* Reading an article a feed did not include.
 *
 * Plenty of feeds are link lists rather than content feeds. Hacker News is the
 * clearest case: every entry's description is the single word "Comments"
 * wrapped in an anchor, and nothing else. The article is at the other end of
 * the link, and until now the only way to reach it was to leave Tilde.
 *
 * So: fetch that page and pull the readable part out of it. This is the same
 * "reader mode" Firefox and Safari ship, using Mozilla's own implementation of
 * it — the one those browsers derive from — rather than a guess of our own.
 *
 * Two things stay true. The fetch goes through the one network boundary
 * (`fetcher.ts`), so the Mac app asks the site directly and the web build uses
 * the proxy, exactly as feeds do. And nothing is fetched unless a person
 * presses the button: opening an article still costs one request, never two.
 */

import { fetchDocument } from './fetcher'
import { htmlToText } from './sanitize'

export interface ExtractedArticle {
  /** Unsanitised, like feed content — ArticleBody sanitises at render time. */
  html: string
  text: string
}

/** Anything much shorter than this is a stub, not an article: a bare
 *  "Comments" link, an empty paragraph, a one-line summary. */
const THIN = 400

/** Whether the button is worth offering for this article at all. */
export function looksThin(contentHtml: string): boolean {
  return htmlToText(contentHtml).length < THIN
}

function isHtml(contentType: string, text: string): boolean {
  if (/html/i.test(contentType)) return true
  // Some servers send no content-type at all; sniff rather than give up.
  return !contentType && /^\s*(<!doctype html|<html)/i.test(text)
}

export async function extractArticle(url: string): Promise<ExtractedArticle> {
  // Loaded on the first press, not on page load: most reading never needs it,
  // and it is a third of the size of the rest of Tilde put together.
  const readability = import('@mozilla/readability')

  const document_ = await fetchDocument(url)

  if (!isHtml(document_.contentType, document_.text)) {
    throw new Error('That link is not a web page.')
  }

  const parsed = new DOMParser().parseFromString(document_.text, 'text/html')

  /* Readability resolves links and images against the document's base, and a
   * document built by DOMParser inherits Tilde's own URL. Without this, every
   * relative image in the article would point at tilde-rss-reader.vercel.app.
   * finalUrl is the address after redirects, which is the correct base. */
  const base = parsed.createElement('base')
  base.setAttribute('href', document_.finalUrl || url)
  parsed.head.prepend(base)

  const { Readability, isProbablyReaderable } = await readability
  if (!isProbablyReaderable(parsed)) {
    throw new Error('There is no article on that page to read.')
  }

  // Readability rewrites the document it is given, which is why it gets a
  // throwaway parse rather than anything else holds a reference to.
  const article = new Readability(parsed).parse()
  const html = article?.content?.trim() || ''
  if (!html) throw new Error('There is no article on that page to read.')

  return { html, text: htmlToText(html) }
}
