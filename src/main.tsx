import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { connectDesktopShell, isDesktopApp } from './lib/platform'
import './styles/modernist.css'
import './styles/app.css'

// Before React mounts, so the first fetch and the first click already have a
// shell to talk to. A no-op in a browser.
connectDesktopShell()

/* The Mac app has no address bar and no landing page, so it has no use for
 * URLs. A memory router keeps the components that navigate working without
 * ever putting a path in a window that cannot show one — and without relying
 * on how a custom protocol resolves a deep link after a reload. */
const Router = isDesktopApp() ? MemoryRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)

/* Registered only in a real browser build. A service worker in front of the
 * dev server would serve yesterday's bundle while you are editing today's, and
 * the Mac app has no use for one at all: its shell is already on disk, which
 * is the whole reason the desktop build has no cache to go stale. */
if (import.meta.env.PROD && !isDesktopApp() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* an uninstallable Tilde is still a working Tilde */
    })
  })
}
