import { useEffect, useState, type RefObject } from 'react'
import { peekBody, readBody } from './bodies'
import { useStore } from './store'
import type { Article, ArticleBody } from './types'

/* "Mark read when scrolled past" — the reader only, never the list. Shared by
 * the reading pane and full-screen mode, which are the same reader in two
 * shapes and must behave identically. */
export function useMarkReadOnScroll(
  ref: RefObject<HTMLElement | null>,
  article: Article | null,
): void {
  const store = useStore()
  const enabled = store.settings.markReadOnScroll

  useEffect(() => {
    const element = ref.current
    if (!element || !article || article.read || !enabled) return

    const onScroll = () => {
      const reachedEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 120
      if (reachedEnd) store.setRead(article.id, true)
    }

    /* Only a real scroll counts. Checking eagerly would mark the article the
     * list auto-selects as read the moment it appeared, without the reader
     * ever choosing it — short articles stay unread until you press m. */
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [ref, article, enabled, store])
}

/** Resets a scroll container to the top whenever the article changes. */
export function useScrollToTop(ref: RefObject<HTMLElement | null>, key: string | undefined): void {
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0
  }, [ref, key])
}

export interface LoadedBody {
  body: ArticleBody | null
  loading: boolean
}

/* An article's text, read from disk when it is opened rather than held for
 * every article at once. bodyChars is part of the key because fetching the
 * full article replaces the text under an id that has not changed. */
export function useArticleBody(article: Article | null): LoadedBody {
  const id = article?.id ?? ''
  const chars = article?.bodyChars ?? 0
  const [state, setState] = useState<LoadedBody>(() => ({
    body: peekBody(id),
    loading: Boolean(chars) && !peekBody(id),
  }))

  useEffect(() => {
    if (!id || !chars) {
      setState({ body: null, loading: false })
      return
    }
    const held = peekBody(id)
    if (held) {
      setState({ body: held, loading: false })
      return
    }

    let current = true
    setState({ body: null, loading: true })
    void readBody(id).then((body) => {
      if (current) setState({ body, loading: false })
    })
    return () => {
      current = false
    }
  }, [id, chars])

  return state
}
