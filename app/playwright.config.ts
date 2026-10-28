import { defineConfig, devices } from '@playwright/test'

// Real layout, in WebKit and Chromium, at phone and desktop sizes (docs/decisions/0007).
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false }
const desktop = { viewport: { width: 1440, height: 900 } }

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5199/' },
  webServer: { command: 'npx vite --port 5199 --strictPort', url: 'http://localhost:5199/', reuseExistingServer: true },
  projects: [
    { name: 'chromium-phone', use: { ...devices['Desktop Chrome'], ...phone } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...desktop } },
    { name: 'webkit-phone', use: { ...devices['Desktop Safari'], ...phone } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], ...desktop } },
  ],
})
