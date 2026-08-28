// Tilde's only server component: a dumb text proxy.
//
// The browser cannot fetch third-party feeds directly (CORS), so this function
// fetches the bytes and hands them back with permissive headers. It does not
// parse, store, rank, or log anything — parsing happens on the client, so the
// native build can drop this endpoint and fetch directly with no other change.

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 12_000
const UA = 'Tilde/1.0 (+https://github.com/KshitijKoranne/Tilde-RSS-Reader)'

// Hostnames that would let a caller use this function to probe private
// networks. Not a complete SSRF defence (DNS can still resolve a public name
// to a private address) but it closes the obvious door.
const BLOCKED_HOST = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i
const BLOCKED_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/

function isBlocked(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (BLOCKED_HOST.test(host)) return true
  if (BLOCKED_IPV4.test(host)) return true
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true
  return false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' })

  const raw = new URL(req.url, 'http://localhost').searchParams.get('url')
  if (!raw) return res.status(400).json({ error: 'Missing ?url=' })

  let target
  try {
    target = new URL(raw)
  } catch {
    return res.status(400).json({ error: 'That is not a valid address.' })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http and https addresses are allowed.' })
  }
  if (isBlocked(target.hostname)) {
    return res.status(403).json({ error: 'That address is not reachable from here.' })
  }

  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(target.toString(), {
      signal: abort.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
        'accept-language': 'en',
      },
    })

    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: `The source answered ${upstream.status} ${upstream.statusText}.` })
    }

    const declared = Number(upstream.headers.get('content-length') || 0)
    if (declared > MAX_BYTES) {
      return res.status(413).json({ error: 'That document is too large to fetch.' })
    }

    const buffer = Buffer.from(await upstream.arrayBuffer())
    if (buffer.byteLength > MAX_BYTES) {
      return res.status(413).json({ error: 'That document is too large to fetch.' })
    }

    // The client needs the post-redirect URL to resolve relative <link> hrefs
    // during feed discovery, and the content type to tell feed from web page.
    res.setHeader('X-Tilde-Final-Url', upstream.url || target.toString())
    res.setHeader('X-Tilde-Content-Type', upstream.headers.get('content-type') || '')
    res.setHeader('Access-Control-Expose-Headers', 'X-Tilde-Final-Url, X-Tilde-Content-Type')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    // Short: long enough to absorb a reload, short enough that pressing "r"
    // for a manual refresh returns something new. Vercel drops s-maxage here,
    // so max-age is what both the CDN and the browser end up honouring.
    res.setHeader('Cache-Control', 'public, max-age=60')
    return res.status(200).send(buffer)
  } catch (err) {
    const message =
      err && err.name === 'AbortError'
        ? 'The source took too long to answer.'
        : 'Could not reach that source.'
    return res.status(504).json({ error: message })
  } finally {
    clearTimeout(timer)
  }
}
