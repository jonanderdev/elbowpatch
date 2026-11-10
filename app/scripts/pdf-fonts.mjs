// The fixed font files the PDF is set in (docs/decisions/0019): Literata and EB Garamond at the
// weights the printed page uses. Each face has a file for Latin, extended Latin and Vietnamese together,
// one for Cyrillic and one for Greek.
//
//   node scripts/pdf-fonts.mjs
//
// Writes src/pdf/fonts/*.ttf and coverage.json (the characters each file holds, so the PDF code knows
// which files a piece needs without fetching any), which are committed. The sources are fetched at
// pinned versions, the same version as the web fonts the app ships (Literata 3.103, EB Garamond 1.003),
// so a word has the same width in the PDF as on the page. Python with fonttools is used once, in a
// temporary folder: the app's build never needs it. Run it again only when the faces, the weights or the
// scripts change.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = (path) => new URL(path, import.meta.url).pathname
const SOURCES = {
  literata: ['https://raw.githubusercontent.com/googlefonts/literata/3.103/fonts/variable/Literata%5Bopsz,wght%5D.ttf', 'Literata.ttf'],
  literataItalic: ['https://raw.githubusercontent.com/googlefonts/literata/3.103/fonts/variable/Literata-Italic%5Bopsz,wght%5D.ttf', 'Literata-Italic.ttf'],
  ebGaramond: [
    'https://raw.githubusercontent.com/google/fonts/f8c1d3d6cc75e30d77130bdcbfbff27e3b6233fe/ofl/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf',
    'EBGaramond-Italic.ttf',
  ],
}

// The characters of the web fonts' script files, so the PDF holds what the page shows. The Cyrillic and
// Greek files also hold the punctuation, digits and space that stand among their letters, so a Russian or
// Greek sentence stays in one file; the Latin file is asked first for everything else.
const css = readFileSync(here('../src/ui/styles/fonts.css'), 'utf8')
const GROUPS = {
  latin: ['latin', 'latin-ext', 'vietnamese'],
  cyrillic: ['cyrillic', 'cyrillic-ext'],
  greek: ['greek', 'greek-ext'],
}
const SHARED = 'U+0020-0040, U+005B-0060, U+007B-007E, U+00A0, U+00AB, U+00BB, U+2010-2015, U+2018-201F, U+2026'
const unicodes = {}
for (const [group, names] of Object.entries(GROUPS)) {
  const ranges = names.map((name) => {
    const found = css.match(new RegExp(`url\\(\\./fonts/literata-${name}-standard-normal\\.woff2\\)[^}]*?unicode-range:([^;]+);`, 's'))
    if (!found) throw new Error(`No unicode-range for ${name} in fonts.css`)
    return found[1]
  })
  if (group !== 'latin') ranges.push(SHARED)
  const codes = new Set()
  for (const part of ranges.join(',').split(',')) {
    const [from, to = from] = part.trim().replace(/^U\+/, '').split('-')
    for (let c = Number.parseInt(from, 16); c <= Number.parseInt(to, 16); c++) codes.add(c)
  }
  unicodes[group] = [...codes].map((c) => c.toString(16)).join(' ')
}

const work = mkdtempSync(join(tmpdir(), 'pdf-fonts-'))
const paths = {}
for (const [key, [url, name]] of Object.entries(SOURCES)) {
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer())
  paths[key] = join(work, name)
  writeFileSync(paths[key], bytes)
  console.log(name, createHash('sha256').update(bytes).digest('hex').slice(0, 16))
}
writeFileSync(join(work, 'unicodes.json'), JSON.stringify(unicodes))

execFileSync('python3', ['-m', 'venv', join(work, 'venv')], { stdio: 'inherit' })
execFileSync(join(work, 'venv/bin/pip'), ['install', '--quiet', 'fonttools==4.60.2'], { stdio: 'inherit' })
const out = here('../src/pdf/fonts')
mkdirSync(out, { recursive: true })
execFileSync(join(work, 'venv/bin/python'), [here('pdf-fonts.py'), paths.literata, paths.literataItalic, paths.ebGaramond, join(work, 'unicodes.json'), out], {
  stdio: 'inherit',
})
