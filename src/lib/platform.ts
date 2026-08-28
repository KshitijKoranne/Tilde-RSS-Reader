/* The two places Tilde runs, and the four things they do differently.
 *
 * The Mac build is not a fork: it is this same bundle inside a Tauri window.
 * Everything above this file — the parser, the sanitiser, the store, every
 * component — cannot tell which one it is in. Only these four capabilities
 * have to know:
 *
 *   fetching   the web goes through /api/feed because CORS forbids the direct
 *              request; the Mac app has no such rule and calls the source
 *   saving     a browser downloads a blob; a WKWebView has nowhere to put one
 *   opening    a link inside the app window would navigate the app away
 *   files      <input type="file"> against a native panel
 *
 * Everything here is loaded lazily, so a browser never downloads the shell's
 * client code.
 */

import type { FetchedDocument } from './fetcher'

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

/** Tauri injects this before any of our scripts run, so the check is safe at
 *  module scope — no waiting, no flash of the wrong interface. */
export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let bridge: Promise<Invoke> | null = null

function invoke(): Promise<Invoke> {
  if (!bridge) {
    bridge = import('@tauri-apps/api/core').then((module) => module.invoke as Invoke)
  }
  return bridge
}

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return (await invoke())<T>(name, args)
}

/** Opens a link in the user's own browser. */
export async function openExternal(url: string): Promise<void> {
  if (!isDesktopApp()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  await command<void>('open_external', { url })
}

/** Writes text wherever this platform writes text. */
export async function saveTextFile(name: string, contents: string, mime: string): Promise<void> {
  if (isDesktopApp()) {
    await command<boolean>('save_text_file', { name, contents })
    return
  }
  const blob = new Blob([contents], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** Asks for a text file and returns its contents; null when the user cancels.
 *  Desktop only — in a browser the caller opens its own file input. */
export async function pickTextFile(): Promise<string | null> {
  return command<string | null>('pick_text_file')
}

/* Connects the page to the shell. Called once, before React mounts, so that
 * the first fetch already has somewhere to go. A no-op in a browser. */
export function connectDesktopShell(): void {
  if (!isDesktopApp()) return

  // src/lib/fetcher.ts looks for exactly this and asks no further questions.
  window.__TILDE_NATIVE_FETCH__ = (url: string) =>
    command<FetchedDocument>('fetch_document', { url })

  // "Open original", and every link inside an article, has to leave the
  // window. Following one in place would replace Tilde with the website and
  // leave no way back — there is no address bar here.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return
    const anchor = (event.target as Element | null)?.closest?.('a')
    // An HTMLAnchorElement's .href is always resolved and always a string —
    // unlike an SVG <a>, whose href is an object that would not survive being
    // parsed. Relative and in-app hrefs resolve against tauri://localhost and
    // so fall through to the router untouched.
    if (!(anchor instanceof HTMLAnchorElement)) return
    if (!/^https?:$/i.test(new URL(anchor.href, location.href).protocol)) return
    event.preventDefault()
    void openExternal(anchor.href)
  })
}
