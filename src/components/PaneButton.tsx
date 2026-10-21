import { useStore, type Pane } from '../lib/store'

/** Moves between panes where the three columns do not fit. It is always
 *  rendered; app.css shows it only below the widths where it is needed. */
export function PaneButton({ to, children }: { to: Pane; children: string }) {
  const store = useStore()
  return (
    <button
      type="button"
      className={`btn btn-ghost ${to === 'rail' ? 'nav-sources' : 'nav-back'}`}
      onClick={() => store.setPane(to)}
    >
      ‹ {children}
    </button>
  )
}
