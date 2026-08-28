import { useEffect, type RefObject } from 'react'
import { useStore } from './store'
import type { Article } from './types'

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
