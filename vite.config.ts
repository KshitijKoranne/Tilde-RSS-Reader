import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './vite-api-plugin'

// apiPlugin mounts api/feed.js into `vite dev` and `vite preview`, so local
// runs exercise the same proxy the deployed build uses.
export default defineConfig({
  plugins: [react(), apiPlugin()],
  build: { outDir: 'dist', sourcemap: true },
})
