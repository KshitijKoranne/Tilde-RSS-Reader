/* The one place Tilde talks to the network.
 *
 * On the web the browser cannot request third-party feeds (CORS), so requests
 * go through this project's own /api/feed function. A native build has no such
 * restriction: the Tauri shell installs `window.__TILDE_NATIVE_FETCH__` and
 * everything above this file stays exactly as it is. Nothing else in the app
 * calls fetch().
 */

export interface FetchedDocument {
  text: string
  /** URL after redirects — relative <link> hrefs resolve against this. */
  finalUrl: string
  contentType: string
}

declare global {
  interface Window {
    __TILDE_NATIVE_FETCH__?: (url: string) => Promise<FetchedDocument>
  }
}

export function isNative(): boolean {
  return typeof window !== 'undefined' && typeof window.__TILDE_NATIVE_FETCH__ === 'function'
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    /* not JSON — use the fallback */
  }
  return fallback
}

async function viaProxy(url: string): Promise<FetchedDocument> {
  const response = await fetch(`/api/feed?url=${encodeURIComponent(url)}`)
  if (!response.ok) {
    throw new Error(await errorMessage(response, `The source could not be fetched (${response.status}).`))
  }
  return {
    text: await response.text(),
    finalUrl: response.headers.get('X-Tilde-Final-Url') || url,
    contentType: response.headers.get('X-Tilde-Content-Type') || '',
  }
}

export async function fetchDocument(url: string): Promise<FetchedDocument> {
  if (window.__TILDE_NATIVE_FETCH__) return window.__TILDE_NATIVE_FETCH__(url)
  return viaProxy(url)
}
