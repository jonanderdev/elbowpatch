// Writes the pages into a file. Each word is placed where the browser put it, in a real glyph run with a
// real space between words, so the text can be selected and searched. pdf-lib does not apply a font's
// kerning, so it is put back with the numbers of a `TJ` array (docs/decisions/0019).

import fontkit from '@pdf-lib/fontkit'
import {
  beginText,
  endText,
  PDFArray,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  type PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  rgb,
  setCharacterSpacing,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
} from 'pdf-lib'
import type { Paper } from '../domain/paper'
import { faceBytes } from './fonts'
import type { FaceName, Line } from './layout'
import {
  COLUMN,
  columnLeft,
  INK,
  MARGIN_TOP,
  PAGE_NUMBER,
  PAGE_NUMBER_FROM_BOTTOM,
  PAPER,
  RULE,
  RULE_FROM_TEXT,
  RULE_WIDTH,
  RUNNING_HEAD,
  RUNNING_HEAD_TOP,
  SECONDARY,
  TITLE_PAGE_GAP,
  TITLE_PAGE_SUBTITLE,
  TITLE_PAGE_SUBTITLE_LEADING,
  TITLE_PAGE_TITLE,
  TITLE_PAGE_TITLE_LEADING,
  TITLE_PAGE_TOP,
} from './page'

/** One sheet of paper. */
export type Sheet =
  /** A title page: no running head and no number. */
  | { kind: 'title'; title: string; subtitle: string }
  /** Text already set into lines, with its running head ('' for none) and the number it is printed with. */
  | { kind: 'text'; lines: Line[]; head: string; number: number }

export interface Printed {
  sheets: Sheet[]
  /** A journal's look: a margin rule on every sheet, and the number flush with the text's right edge instead of centred. */
  ruled: boolean
  paper: Paper
  title: string
  lang: string
}

interface Face {
  pdf: PDFFont
  metrics: fontkit.Font
  features: { liga: boolean } | undefined
}

/**
 * Text with letter-spacing has no ligatures in a browser, and the title has some: the browser measured
 * its words without them, so they are drawn without them too.
 */
const NO_LIGATURES: FaceName[] = ['literata-300-title']

/** Characters that take no room and draw nothing: left out, never missing. */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/gu

function color(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  return rgb((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export async function write({ sheets, ruled, paper, title, lang }: Printed): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.registerFontkit(fontkit)
  doc.setTitle(title, { showInWindowTitleBar: true })
  doc.setProducer('Elbowpatch')
  doc.setCreator('Elbowpatch')
  doc.setLanguage(lang)
  const now = new Date()
  doc.setCreationDate(now)
  doc.setModificationDate(now)

  const faces = new Map<FaceName, Face>()
  const face = async (name: FaceName): Promise<Face> => {
    let known = faces.get(name)
    if (!known) {
      const bytes = await faceBytes(name)
      const features = NO_LIGATURES.includes(name) ? { liga: false } : undefined
      known = { pdf: await doc.embedFont(bytes, { subset: true, features }), metrics: fontkit.create(bytes), features }
      faces.set(name, known)
    }
    return known
  }

  const size = PAPER[paper]
  const left = columnLeft(paper)
  for (const sheet of sheets) {
    const page = doc.addPage([size.width, size.height])
    if (ruled) page.drawRectangle({ x: left - RULE_FROM_TEXT, y: 0, width: RULE_WIDTH, height: size.height, color: color(RULE) })
    const keys = new Map<FaceName, PDFName>()
    const draw = async (name: FaceName, text: string, pt: number, x: number, baselineFromTop: number, ink: string, tracking = 0): Promise<void> => {
      const f = await face(name)
      let key = keys.get(name)
      if (!key) {
        key = page.node.newFontDictionary(f.pdf.name, f.pdf.ref)
        keys.set(name, key)
      }
      page.pushOperators(
        beginText(),
        setFillingColor(color(ink)),
        setFontAndSize(key, pt),
        // Part of the graphics state, so set for every word: the title's letter-spacing must not carry on.
        setCharacterSpacing(tracking * pt),
        setTextMatrix(1, 0, 0, 1, x, size.height - baselineFromTop),
        glyphs(doc, f, text),
        endText(),
      )
    }
    if (sheet.kind === 'title') {
      await titlePage(sheet, size, left, face, draw)
      continue
    }
    for (const line of sheet.lines) {
      for (const [i, fragment] of line.fragments.entries()) {
        const next = line.fragments[i + 1]
        const f = await face(fragment.face)
        // The browser sets a hyphen at a break it chose, but a hyphen is not in the text: the box it gave
        // the word holds it, or is wider than the letters by about its width.
        const letters = width(f, fragment.text, fragment.size) + fragment.tracking * fragment.size * [...fragment.text].length
        const hyphen = fragment.continues && (fragment.hyphenBox || fragment.width - letters > 0.15 * fragment.size)
        const text = fragment.text + (hyphen ? '-' : next?.spaced ? ' ' : '')
        await draw(fragment.face, text, fragment.size, left + fragment.x, MARGIN_TOP + line.baseline + fragment.drop, INK, fragment.tracking)
      }
    }
    if (sheet.head !== '') {
      const f = await face('literata-italic-400')
      const text = fitted(f, sheet.head, RUNNING_HEAD, COLUMN)
      const y = RUNNING_HEAD_TOP + ascent(f, RUNNING_HEAD)
      await draw('literata-italic-400', text, RUNNING_HEAD, (size.width - width(f, text, RUNNING_HEAD)) / 2, y, SECONDARY)
    }
    const f = await face('literata-360')
    const number = String(sheet.number)
    const y = size.height - PAGE_NUMBER_FROM_BOTTOM + ascent(f, PAGE_NUMBER)
    const across = width(f, number, PAGE_NUMBER)
    // The rule holds the left of a journal's page and the number its right; elsewhere the number is centred.
    await draw('literata-360', number, PAGE_NUMBER, ruled ? left + COLUMN - across : (size.width - across) / 2, y, SECONDARY)
  }
  return doc.save()
}

type Draw = (name: FaceName, text: string, pt: number, x: number, baselineFromTop: number, ink: string, tracking?: number) => Promise<void>

/** The title, and the subtitle in italic under it, each line centred on the column, in the upper third. */
async function titlePage(
  sheet: { title: string; subtitle: string },
  size: { width: number; height: number },
  left: number,
  face: (name: FaceName) => Promise<Face>,
  draw: Draw,
): Promise<void> {
  const tracking = -0.012
  let top = size.height * TITLE_PAGE_TOP
  const set = async (name: FaceName, text: string, pt: number, leading: number, spacing: number): Promise<void> => {
    if (text === '') return
    const f = await face(name)
    const across = (line: string): number => width(f, line, pt) + spacing * pt * [...line].length
    // The line box is `leading` tall and the text sits in its middle, as a browser sets it.
    const above = (leading - ((f.metrics.ascent - f.metrics.descent) / f.metrics.unitsPerEm) * pt) / 2 + ascent(f, pt)
    for (const line of wrapped(text, across, COLUMN)) {
      await draw(name, line, pt, left + (COLUMN - across(line)) / 2, top + above, INK, spacing)
      top += leading
    }
    top += TITLE_PAGE_GAP
  }
  await set('literata-300-title', sheet.title, TITLE_PAGE_TITLE, TITLE_PAGE_TITLE * TITLE_PAGE_TITLE_LEADING, tracking)
  await set('literata-italic-400', sheet.subtitle, TITLE_PAGE_SUBTITLE, TITLE_PAGE_SUBTITLE * TITLE_PAGE_SUBTITLE_LEADING, 0)
}

/** Text broken into lines that fit a room, at its spaces; a word wider than the room is broken where it must be. */
function wrapped(text: string, across: (line: string) => number, room: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line !== '' && across(`${line} ${word}`) <= room) {
      line = `${line} ${word}`
      continue
    }
    if (line !== '') lines.push(line)
    line = ''
    for (const letter of word) {
      if (line !== '' && across(line + letter) > room) {
        lines.push(line)
        line = ''
      }
      line += letter
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

function ascent(f: Face, pt: number): number {
  return (f.metrics.ascent / f.metrics.unitsPerEm) * pt
}

function normal(text: string): string {
  return text.replace(INVISIBLE, '').normalize('NFC')
}

function width(f: Face, text: string, pt: number): number {
  const run = f.metrics.layout(normal(text), f.features)
  return (run.positions.reduce((sum, p) => sum + p.xAdvance, 0) / f.metrics.unitsPerEm) * pt
}

/** A running head too long for the column is shortened, with an ellipsis. */
function fitted(f: Face, text: string, pt: number, room: number): string {
  let shown = text
  while (shown.length > 1 && width(f, shown, pt) > room) shown = `${shown.slice(0, -2).trimEnd()}…`
  return shown
}

/**
 * A run of glyphs as the operands of one `TJ`: each glyph's code, and after it the difference between
 * the font's kerned advance and the plain one the file will use, so the pairs sit as the browser set them.
 */
function glyphs(doc: PDFDocument, f: Face, text: string): PDFOperator {
  const drawn = normal(text)
  for (const char of drawn) {
    const code = char.codePointAt(0) as number
    if (!f.metrics.hasGlyphForCodePoint(code)) throw new Error(`The font has no ${char} (U+${code.toString(16)})`)
  }
  const run = f.metrics.layout(drawn, f.features)
  const hex = f.pdf.encodeText(drawn).toString().slice(1, -1)
  if (hex.length / 4 !== run.glyphs.length) throw new Error('The font set a different number of glyphs than the file holds')
  const operands = PDFArray.withContext(doc.context)
  run.glyphs.forEach((glyph, i) => {
    operands.push(PDFHexString.of(hex.slice(i * 4, i * 4 + 4)))
    const back = ((glyph.advanceWidth - (run.positions[i]?.xAdvance ?? glyph.advanceWidth)) * 1000) / f.metrics.unitsPerEm
    if (Math.abs(back) > 0.01) operands.push(PDFNumber.of(Math.round(back * 1000) / 1000))
  })
  return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [operands])
}
