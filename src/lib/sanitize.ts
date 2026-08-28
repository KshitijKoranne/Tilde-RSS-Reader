/* Feed HTML is untrusted input from the open web. Nothing reaches the reading
 * pane without passing through here first: an allowlist of tags and attributes,
 * with every URL re-resolved and scheme-checked.
 *
 * DOMParser produces an inert document, so parsing alone never loads a remote
 * resource — images only fetch once sanitised markup is attached to the page,
 * which is exactly what the "Load remote images" setting gates.
 */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre',
  'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var',
])

/** Removed with their contents — the rest of the tree is merely unwrapped. */
const DROPPED_TAGS = new Set([
  'audio', 'base', 'button', 'canvas', 'embed', 'form', 'head', 'iframe', 'input',
  'link', 'meta', 'noscript', 'object', 'script', 'select', 'style', 'svg',
  'template', 'textarea', 'title', 'video',
])

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'reversed']),
  time: new Set(['datetime']),
}

const SAFE_SCHEMES = new Set(['http:', 'https:'])

function safeUrl(value: string, base: string, allowMailto: boolean): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  let resolved: URL
  try {
    resolved = base ? new URL(trimmed, base) : new URL(trimmed)
  } catch {
    return null
  }
  if (SAFE_SCHEMES.has(resolved.protocol)) return resolved.toString()
  if (allowMailto && resolved.protocol === 'mailto:') return resolved.toString()
  return null
}

export interface SanitizeOptions {
  /** Article link — relative URLs in the feed body resolve against it. */
  baseUrl?: string
  /** When false, <img> and <figure> are removed rather than rendered. */
  allowImages?: boolean
}

export interface SanitizeResult {
  html: string
  /** True when at least one image was removed because images are switched off. */
  imagesStripped: boolean
}

export function sanitizeHtml(dirty: string, options: SanitizeOptions = {}): SanitizeResult {
  const { baseUrl = '', allowImages = false } = options
  if (!dirty) return { html: '', imagesStripped: false }

  const doc = new DOMParser().parseFromString(`<div id="tilde-root">${dirty}</div>`, 'text/html')
  const root = doc.getElementById('tilde-root')
  if (!root) return { html: '', imagesStripped: false }

  let imagesStripped = false

  // Snapshot first: the walk rewrites the tree as it goes.
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (!el.isConnected) continue
    const tag = el.tagName.toLowerCase()

    if (DROPPED_TAGS.has(tag)) {
      el.remove()
      continue
    }

    if ((tag === 'img' || tag === 'picture' || tag === 'source') && !allowImages) {
      imagesStripped = true
      el.remove()
      continue
    }

    if (!ALLOWED_TAGS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes))
      continue
    }

    const permitted = ALLOWED_ATTRS[tag]
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (!permitted?.has(name)) {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'href' || name === 'src') {
        const url = safeUrl(attr.value, baseUrl, name === 'href')
        if (url) el.setAttribute(name, url)
        else el.removeAttribute(attr.name)
      }
    }

    if (tag === 'a' && el.hasAttribute('href')) {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer nofollow')
    }
    if (tag === 'img') {
      el.setAttribute('loading', 'lazy')
      el.setAttribute('referrerpolicy', 'no-referrer')
    }
  }

  // A figure whose only content was a stripped image leaves an empty shell.
  for (const figure of Array.from(root.querySelectorAll('figure'))) {
    if (!figure.textContent?.trim() && !figure.querySelector('img')) figure.remove()
  }

  return { html: root.innerHTML, imagesStripped }
}

/** Plain text of an HTML fragment, whitespace collapsed. */
export function htmlToText(html: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(`<div id="tilde-text">${html}</div>`, 'text/html')
  const root = doc.getElementById('tilde-text')
  if (!root) return html.replace(/\s+/g, ' ').trim()
  root.querySelectorAll('script, style').forEach((el) => el.remove())
  return (root.textContent || '').replace(/\s+/g, ' ').trim()
}

export function makeExcerpt(html: string, limit = 200): string {
  const text = htmlToText(html)
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`
}
