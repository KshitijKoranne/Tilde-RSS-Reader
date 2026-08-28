import { Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './lib/store'
import { Landing } from './pages/Landing'
import { Reader } from './pages/Reader'

export function App() {
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
