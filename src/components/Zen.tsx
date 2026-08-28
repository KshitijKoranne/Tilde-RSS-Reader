import { useRef } from 'react'
import { fullDate } from '../lib/format'
import { useMarkReadOnScroll, useScrollToTop } from '../lib/hooks'
import { useStore } from '../lib/store'
import { ArticleBody } from './ArticleBody'

/** Full-screen reading. One column, no chrome, Esc to leave. */
export function Zen() {
  const store = useStore()
  const open = store.zen
  const article = open ? store.selected : null
  const bodyRef = useRef<HTMLDivElement>(null)

  useScrollToTop(bodyRef, article?.id)
  useMarkReadOnScroll(bodyRef, article)

  if (!article) return null

  const byline = [article.author, fullDate(article.publishedAt)].filter(Boolean).join(' · ')

  return (
    <div className="zen" role="dialog" aria-modal="true" aria-label={article.title}>
      <div className="zen-head">
        <span className="kicker">{article.feedTitle}</span>
        <span className="kicker" style={{ color: 'var(--color-neutral-700)' }}>
          Esc to leave
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => store.setZen(false)}>
          Close
        </button>
      </div>

      <article className="zen-body scroll" ref={bodyRef}>
        <div className="zen-measure">
          <h2 className="t-h zen-title">{article.title}</h2>
          <p className="kicker zen-byline">{byline}</p>
          <hr className="hr" />
          <ArticleBody article={article} />
          {article.link && (
            <p className="read-original">
              <a href={article.link} target="_blank" rel="noopener noreferrer">
                Open the original ↗
              </a>
            </p>
          )}
        </div>
      </article>
    </div>
  )
}
