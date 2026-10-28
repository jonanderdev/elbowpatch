import { defineConfig, devices } from '@playwright/test'

// Real layout, in WebKit and Chromium, at phone and desktop sizes (docs/decisions/0007).
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false }
const desktop = { viewport: { width: 1440, height: 900 } }

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // Runs stalled when a stray `vite preview` held the port, when tests waited fixed times
  // for saves, and when macOS idled the browsers overnight (run with `caffeinate`). Four
  // workers keep a laptop responsive.
  workers: 4,
  reporter: 'list',
  // The built app, service worker included.
  use: { baseURL: 'http://localhost:5198/' },
  webServer: { command: 'npx vite build && npx vite preview --port 5198 --strictPort', url: 'http://localhost:5198/', reuseExistingServer: false, timeout: 120_000 },
  projects: [
    { name: 'chromium-phone', use: { ...devices['Desktop Chrome'], ...phone } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...desktop } },
    { name: 'webkit-phone', use: { ...devices['Desktop Safari'], ...phone } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], ...desktop } },
  ],
})
