import { Navigate, Route, Routes } from 'react-router-dom'
import { isDesktopApp } from './lib/platform'
import { StoreProvider } from './lib/store'
import { Landing } from './pages/Landing'
import { Reader } from './pages/Reader'

export function App() {
  // On the Mac the app *is* the reader. The landing page exists to explain
  // Tilde to someone who has not got it yet; by definition that is not the
  // person who just opened it from the Dock.
  if (isDesktopApp()) {
    return (
      <StoreProvider>
        <Reader />
      </StoreProvider>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/app"
        element={
          <StoreProvider>
            <Reader />
          </StoreProvider>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
