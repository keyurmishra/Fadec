import { defineConfig } from 'vitest/config'

// Kept apart from vite.config.ts so the Cloudflare and React plugins do not load
// for tests: the Worker is exercised in Node with a Miniflare-backed D1 binding.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
