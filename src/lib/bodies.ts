/* Article text, fetched from disk on demand and briefly remembered.
 *
 * Bodies are the heavy half of the archive and are stored apart from the
 * article records for that reason, so something has to fetch one when a person
 * opens an article. Keeping the last couple of dozen means walking a list with
 * j and k does not re-read the same articles from disk on the way back up.
 */

import * as db from './db'
import type { ArticleBody } from './types'

/** Enough for a session of reading up and down a list; small enough to forget. */
const LIMIT = 24

const cache = new Map<string, ArticleBody>()

function remember(body: ArticleBody): void {
  cache.delete(body.id)
  cache.set(body.id, body)
  // A Map iterates in insertion order, so the first key is the oldest.
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value as string)
}

/** The body if it happens to be to hand — lets the reader paint without a flash. */
export function peekBody(id: string): ArticleBody | null {
  return cache.get(id) ?? null
}

export async function readBody(id: string): Promise<ArticleBody | null> {
  const held = cache.get(id)
  if (held) return held
  const body = await db.loadBody(id)
  if (body) remember(body)
  return body
}

/** Records text the app has just produced, so it is not read straight back. */
export function rememberBody(body: ArticleBody): void {
  remember(body)
}

/** Called when the archive is switched off and the bodies are gone. */
export function forgetBodies(): void {
  cache.clear()
}
