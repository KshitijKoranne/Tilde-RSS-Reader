import { defineConfig } from 'vitest/config'

/* The tests cover src/lib — the parsing, sanitising and storage layer, which
 * is where untrusted input from the open web arrives. Every one of those files
 * leans on DOMParser, IndexedDB or both, so the suite runs in jsdom with a
 * real in-memory IndexedDB rather than mocking either away. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
  },
})
