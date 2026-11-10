import fontkit from '@pdf-lib/fontkit'
import { describe, expect, it } from 'vitest'
import coverage from './fonts/coverage.json'
import { filesFor, splitRuns } from './runs'

describe('which font file holds each character', () => {
  it('keeps plain Latin text in one run of the Latin file', () => {
    expect(splitRuns('literata-360', 'We kept the lamp lit.')).toEqual([{ script: 'latin', text: 'We kept the lamp lit.' }])
  })

  it('keeps Polish, Turkish and Vietnamese letters in the Latin file, which holds all three web files', () => {
    expect(splitRuns('literata-360', 'Łódź şeker Việt')).toEqual([{ script: 'latin', text: 'Łódź şeker Việt' }])
  })

  it('sets Cyrillic and Greek in their own files, keeping the punctuation and space among the letters with them', () => {
    expect(splitRuns('literata-360', 'Привет, мир 2026!')).toEqual([{ script: 'cyrillic', text: 'Привет, мир 2026!' }])
    expect(splitRuns('literata-360', 'Γειά σου, κόσμε.')).toEqual([{ script: 'greek', text: 'Γειά σου, κόσμε.' }])
  })

  it('splits a word where the script changes, and keeps its order', () => {
    expect(splitRuns('literata-360', 'lamp-лампа')).toEqual([
      { script: 'latin', text: 'lamp-' },
      { script: 'cyrillic', text: 'лампа' },
    ])
  })

  it('draws as an image what no file holds: an emoji, Arabic, Japanese', () => {
    expect(splitRuns('literata-360', 'lit 🕯️ now')).toEqual([
      { script: 'latin', text: 'lit ' },
      { script: 'image', text: '🕯️' },
      { script: 'latin', text: ' now' },
    ])
    expect(splitRuns('literata-360', 'مرحبا')).toEqual([{ script: 'image', text: 'مرحبا' }])
    expect(splitRuns('literata-360', '日本語x')).toEqual([
      { script: 'image', text: '日本語' },
      { script: 'latin', text: 'x' },
    ])
  })

  it('keeps an emoji joined by a zero-width joiner whole', () => {
    const family = '👨‍👩‍👧'
    expect(splitRuns('literata-360', `a${family}b`)).toEqual([
      { script: 'latin', text: 'a' },
      { script: 'image', text: family },
      { script: 'latin', text: 'b' },
    ])
  })

  it('writes decomposed letters as the precomposed ones the file holds, so a mark is never left out of place', () => {
    expect(splitRuns('literata-360', 'Zoë Việt')).toEqual([{ script: 'latin', text: 'Zoë Việt' }])
  })

  it('draws a letter with a mark that no precomposed letter holds as an image', () => {
    expect(splitRuns('literata-360', 'q́x')).toEqual([
      { script: 'image', text: 'q́' },
      { script: 'latin', text: 'x' },
    ])
  })

  it('leaves out what takes no room and draws nothing', () => {
    expect(splitRuns('literata-360', 'co­oper​ate')).toEqual([{ script: 'latin', text: 'cooperate' }])
  })

  it('is judged face by face: a letter the italic lacks is an image there', () => {
    // Literata holds the superscript two; EB Garamond italic does not, so inside an emphasis it is drawn as the browser set it.
    expect(splitRuns('literata-360', 'm²')).toEqual([{ script: 'latin', text: 'm²' }])
    expect(splitRuns('eb-garamond-italic-400', 'm²')).toEqual([
      { script: 'latin', text: 'm' },
      { script: 'image', text: '²' },
    ])
  })

  it('names the files a piece needs, and no others', () => {
    expect(filesFor('literata-360', 'Just plain English.')).toEqual(['literata-360'])
    expect(filesFor('literata-360', 'Привет, hello')).toEqual(['literata-360', 'literata-360-cyrillic'])
    expect(filesFor('literata-360', 'Γειά 🕯️')).toEqual(['literata-360-greek'])
  })
})

const FILES = import.meta.glob<string>('./fonts/*.ttf', { query: '?inline', import: 'default', eager: true })

function open(file: string): fontkit.Font {
  const url = FILES[`./fonts/${file}.ttf`] as string
  const binary = atob(url.slice(url.indexOf(',') + 1))
  return fontkit.create(Uint8Array.from(binary, (c) => c.charCodeAt(0))) as fontkit.Font
}

describe('the list of what each file holds', () => {
  it.each(Object.keys(coverage))('%s holds what the list says', (file) => {
    const font = open(file)
    for (const part of (coverage as Record<string, string>)[file]?.split(',') ?? []) {
      const [from, to = from] = part.split('-').map((h) => Number.parseInt(h, 16))
      for (let code = from as number; code <= (to as number); code++) if (!font.hasGlyphForCodePoint(code)) expect.fail(`${file} lacks U+${code.toString(16)}`)
    }
  })
})
