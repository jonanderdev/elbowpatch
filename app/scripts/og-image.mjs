// The picture a link to the app shows when it is shared: 1200 × 630, the wordmark and the line on
// the paper page. Words and mark sit in the middle, since some apps crop the picture to a square.
//
//   node scripts/og-image.mjs
//
// Writes public/og-image.png, which is committed. Run it again when the wordmark or the line changes.

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const file = (path) => new URL(path, import.meta.url)
const font = readFileSync(file('../src/ui/styles/fonts/literata-latin-standard-normal.woff2')).toString('base64')
// The wordmark sits on its own card; here the page is the card.
const wordmark = readFileSync(file('../../docs/brand/wordmark.svg'), 'utf8').replace(/<rect[^>]*\/>/, '')

const html = `<!doctype html>
<style>
  @font-face {
    font-family: Literata;
    font-weight: 200 900;
    src: url(data:font/woff2;base64,${font}) format('woff2-variations');
  }
  html, body { margin: 0; height: 100%; background: #f3f3f0; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; }
  svg { width: 684px; height: 242px; }
  p {
    margin: -24px 0 78px;
    font: 300 32px/1.3 Literata;
    font-variation-settings: 'opsz' 60;
    color: #676767;
  }
</style>
${wordmark}
<p>A quiet place to write</p>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: file('../public/og-image.png').pathname })
await browser.close()
