import { useEffect } from 'react'
import { AddFeedDialog } from '../components/AddFeedDialog'
import { ArticleList } from '../components/ArticleList'
import { Rail } from '../components/Rail'
import { ReaderPane } from '../components/ReaderPane'
import { SettingsView } from '../components/SettingsView'
import { Zen } from '../components/Zen'
import { useStore } from '../lib/store'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/** Every action has one key — the promise the landing page makes. */
function useShortcuts() {
  const store = useStore()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Escape') {
        if (store.zen) store.setZen(false)
        else if (store.showAdd) store.setShowAdd(false)
        return
      }
      if (isTyping(event.target)) return
      if (store.showAdd) return

      const selected = store.selected

      switch (event.key) {
        case 'f':
          event.preventDefault()
          if (selected) store.setZen(!store.zen)
          return
        case 'j':
        case 'k':
          if (store.zen) return
          event.preventDefault()
          store.step(event.key === 'j' ? 1 : -1)
          return
        case 'o':
          if (store.zen || !selected) return
          event.preventDefault()
          store.open(selected.id)
          return
        case 'm':
          if (store.zen || !selected) return
          event.preventDefault()
          store.setRead(selected.id, !selected.read)
          return
        case 's':
          if (store.zen || !selected) return
          event.preventDefault()
          store.toggleStar(selected.id)
          return
        case '/':
          if (store.zen) return
          event.preventDefault()
          store.go('search')
          return
        case 'a':
          if (store.zen) return
          event.preventDefault()
          store.setShowAdd(true)
          return
        case 'r':
          if (store.zen) return
          event.preventDefault()
          void store.refreshAll()
          return
        default:
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [store])
}

export function Reader() {
  const store = useStore()
  useShortcuts()

  useEffect(() => {
    document.body.classList.add('is-reader')
    return () => document.body.classList.remove('is-reader')
  }, [])

  return (
    <div
      className="shell"
      data-reader-font={store.settings.font}
      data-reader-size={store.settings.size}
      data-density={store.settings.density}
    >
      <Rail />

      {store.view === 'settings' ? (
        <SettingsView />
      ) : (
        <>
          <ArticleList />
          <ReaderPane />
        </>
      )}

      <AddFeedDialog />
      <Zen />

      {store.toast && (
        <div className={`toast${store.toast.tone === 'error' ? ' is-error' : ''}`} role="status">
          {store.toast.message}
        </div>
      )}
    </div>
  )
}
