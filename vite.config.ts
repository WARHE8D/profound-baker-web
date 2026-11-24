import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'

/**
 * public/mockServiceWorker.js serves `npm run dev:mock`. Production builds never register it, so
 * leave it out of dist instead of publishing an unused service worker.
 */
function dropMockServiceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'drop-mock-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      rmSync(resolve(outDir, 'mockServiceWorker.js'), { force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), dropMockServiceWorker()],
  resolve: {
    // Keep in sync with "paths" in tsconfig.app.json
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // e2e/ is Playwright's (npm run e2e).
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // .env.local is not loaded in test mode; give the API client a fixed origin for MSW handlers.
    env: { VITE_API_BASE_URL: 'http://localhost:8080' },
    restoreMocks: true,
    // Rendered pages run several mocked requests; with every file at once, 5 s is too tight.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/mocks/browser.ts'],
    },
  },
})
