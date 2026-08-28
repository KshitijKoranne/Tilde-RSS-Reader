import { useMemo } from 'react'
import { sanitizeHtml } from '../lib/sanitize'
import { useStore } from '../lib/store'
import type { Article } from '../lib/types'

/* Article HTML is re-sanitised here, at render time rather than at fetch time,
 * so flipping "Load remote images" takes effect on what is already on disk. */
export function ArticleBody({ article }: { article: Article }) {
  const { settings } = useStore()

  const { html, imagesStripped } = useMemo(
    () =>
      sanitizeHtml(article.contentHtml, {
        baseUrl: article.link,
        allowImages: settings.loadImages,
      }),
    [article.contentHtml, article.link, settings.loadImages],
  )

  if (!html) {
    return (
      <div className="prose">
        <p>
          {article.excerpt || 'This source publishes titles only.'}
        </p>
        <p className="prose-stripped">
          {settings.keepArchive
            ? 'Full text is not in this feed — open the original.'
            : 'The local archive is switched off, so only the summary is kept.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
      {imagesStripped && (
        <p className="prose-stripped">
          Images hidden — turn them on in Settings
        </p>
      )}
    </>
  )
}
