import { useEffect, useMemo, useState } from 'react'
import { isThin } from '../lib/extract'
import { useArticleBody } from '../lib/hooks'
import { sanitizeHtml } from '../lib/sanitize'
import { useStore } from '../lib/store'
import type { Article } from '../lib/types'

type Status = { state: 'idle' | 'loading' } | { state: 'error'; message: string }

/* Some feeds publish the whole article; some publish a sentence; Hacker News
 * publishes the word "Comments" and a link. When there is little or nothing to
 * read, offer to go and get it — on a press, never on its own, so opening an
 * article still costs one request rather than two. */
function FetchFullText({ article }: { article: Article }) {
  const store = useStore()
  const [status, setStatus] = useState<Status>({ state: 'idle' })

  // A new article is a new question; the previous one's error is not about it.
  useEffect(() => setStatus({ state: 'idle' }), [article.id])

  if (!article.link) return null

  const run = async () => {
    setStatus({ state: 'loading' })
    try {
      await store.loadFullText(article.id)
      // On success this component unmounts — the article is no longer thin.
    } catch (caught) {
      setStatus({
        state: 'error',
        message: caught instanceof Error ? caught.message : 'Could not fetch that page.',
      })
    }
  }

  return (
    <p className="read-fulltext">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => void run()}
        disabled={status.state === 'loading'}
      >
        {status.state === 'loading' ? 'Fetching the article…' : 'Read the full article'}
      </button>
      {status.state === 'error' && <span className="read-fulltext-note">{status.message}</span>}
    </p>
  )
}

/* Article HTML is re-sanitised here, at render time rather than at fetch time,
 * so flipping "Load remote images" takes effect on what is already on disk.
 *
 * The text itself is not part of the article record — it is read from disk as
 * the article is opened, which is what keeps a ten-thousand-article archive
 * from being loaded into memory to show one page of it. */
export function ArticleBody({ article }: { article: Article }) {
  const { settings } = useStore()
  const { body, loading } = useArticleBody(article)

  const { html, imagesStripped } = useMemo(
    () =>
      sanitizeHtml(body?.html ?? '', {
        baseUrl: article.link,
        allowImages: settings.loadImages,
      }),
    [body?.html, article.link, settings.loadImages],
  )

  // Nothing at all is better than a flash of "this feed publishes titles only"
  // in front of an article that is about to appear.
  if (loading) return <div className="prose" aria-busy="true" />

  if (!html) {
    return (
      <div className="prose">
        <p>{article.excerpt || 'This source publishes titles only.'}</p>
        <p className="prose-stripped">
          {settings.keepArchive
            ? 'Full text is not in this feed.'
            : 'The local archive is switched off, so only the summary is kept.'}
        </p>
        <FetchFullText article={article} />
      </div>
    )
  }

  return (
    <>
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      {imagesStripped && <p className="prose-stripped">Images hidden — turn them on in Settings</p>}
      {isThin(article.bodyChars) && <FetchFullText article={article} />}
    </>
  )
}
