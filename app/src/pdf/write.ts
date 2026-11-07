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
import { COLUMN, columnLeft, INK, MARGIN_TOP, PAGE_NUMBER, PAGE_NUMBER_FROM_BOTTOM, PAPER, RUNNING_HEAD, RUNNING_HEAD_TOP, SECONDARY } from './page'

export interface Printed {
  /** One list of lines for each page, from the first. */
  pages: Line[][]
  /** The running head, from the second page on. */
  head: string
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

export async function write({ pages, head, paper, title, lang }: Printed): Promise<Uint8Array> {
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
  for (const [index, lines] of pages.entries()) {
    const page = doc.addPage([size.width, size.height])
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
    for (const line of lines) {
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
    if (index > 0 && head !== '') {
      const f = await face('literata-italic-400')
      const text = fitted(f, head, RUNNING_HEAD, COLUMN)
      const y = RUNNING_HEAD_TOP + ascent(f, RUNNING_HEAD)
      await draw('literata-italic-400', text, RUNNING_HEAD, (size.width - width(f, text, RUNNING_HEAD)) / 2, y, SECONDARY)
    }
    const f = await face('literata-360')
    const number = String(index + 1)
    const y = size.height - PAGE_NUMBER_FROM_BOTTOM + ascent(f, PAGE_NUMBER)
    await draw('literata-360', number, PAGE_NUMBER, (size.width - width(f, number, PAGE_NUMBER)) / 2, y, SECONDARY)
  }
  return doc.save()
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
