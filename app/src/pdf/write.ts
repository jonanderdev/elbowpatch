// Writes the pages into a file. Each word is placed where the browser put it, in a real glyph run with a
// real space between words, so the text can be selected and searched. pdf-lib does not apply a font's
// kerning, so it is put back with the numbers of a `TJ` array (docs/decisions/0019).

import fontkit from '@pdf-lib/fontkit'
import {
  beginText,
  concatTransformationMatrix,
  drawObject,
  endText,
  PDFArray,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  type PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
} from 'pdf-lib'
import type { Paper } from '../domain/paper'
import { breathe } from './breathe'
import { faceBytes } from './fonts'
import { advance, draw as drawn } from './images'
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

import { fileOf, type Script, splitRuns } from './runs'

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

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
  /** The font file's name: a face in one group of scripts. */
  file: string
  pdf: PDFFont
  metrics: fontkit.Font
  features: { liga: boolean } | undefined
}

/**
 * A stretch of a fragment set in one font file, or drawn as an image. Each has the width it takes, in
 * points, so the next starts where it ends.
 */
type Part = { kind: 'font'; face: Face; text: string; width: number } | { kind: 'image'; text: string; width: number }

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

  const faces = new Map<string, Face>()
  const face = async (name: FaceName, script: Script): Promise<Face> => {
    const file = fileOf(name, script)
    let known = faces.get(file)
    if (!known) {
      const bytes = await faceBytes(file)
      const features = NO_LIGATURES.includes(name) ? { liga: false } : undefined
      known = { file, pdf: await doc.embedFont(bytes, { subset: true, features }), metrics: fontkit.create(bytes), features }
      faces.set(file, known)
    }
    return known
  }

  /** The text in the face as its parts: in each file that holds its characters, or an image where none does. */
  const shape = async (name: FaceName, text: string, pt: number, tracking = 0): Promise<Part[]> => {
    const parts: Part[] = []
    for (const run of splitRuns(name, text)) {
      if (run.script === 'image') {
        parts.push({ kind: 'image', text: run.text, width: await advance(name, run.text, pt) })
        continue
      }
      const f = await face(name, run.script)
      parts.push({ kind: 'font', face: f, text: run.text, width: width(f, run.text, pt) + tracking * pt * [...run.text].length })
    }
    return parts
  }
  const total = (parts: Part[]): number => parts.reduce((sum, part) => sum + part.width, 0)

  /** A running head too long for the column is shortened, a letter at a time, with an ellipsis. */
  const fitted = async (name: FaceName, text: string, pt: number, room: number): Promise<Part[]> => {
    const letters = [...graphemes.segment(text)].map((g) => g.segment)
    let parts = await shape(name, text, pt)
    for (let keep = letters.length - 1; total(parts) > room && keep > 0; keep--) parts = await shape(name, `${letters.slice(0, keep).join('').trimEnd()}…`, pt)
    return parts
  }

  const size = PAPER[paper]
  const left = columnLeft(paper)
  for (const sheet of sheets) {
    await breathe()
    const page = doc.addPage([size.width, size.height])
    if (ruled) page.drawRectangle({ x: left - RULE_FROM_TEXT, y: 0, width: RULE_WIDTH, height: size.height, color: color(RULE) })
    const keys = new Map<string, PDFName>()
    const key = (id: string, make: () => PDFName): PDFName => {
      const known = keys.get(id) ?? make()
      keys.set(id, known)
      return known
    }
    const draw = async (name: FaceName, parts: Part[], pt: number, x: number, baselineFromTop: number, ink: string, tracking = 0): Promise<void> => {
      let pen = x
      for (const part of parts) {
        if (part.kind === 'font') {
          const f = part.face
          page.pushOperators(
            beginText(),
            setFillingColor(color(ink)),
            setFontAndSize(
              key(f.file, () => page.node.newFontDictionary(f.pdf.name, f.pdf.ref)),
              pt,
            ),
            // Part of the graphics state, so set for every word: the title's letter-spacing must not carry on.
            setCharacterSpacing(tracking * pt),
            setTextMatrix(1, 0, 0, 1, pen, size.height - baselineFromTop),
            glyphs(doc, f, part.text),
            endText(),
          )
        } else {
          const image = await drawn(doc, name, part.text, pt, ink)
          page.pushOperators(
            pushGraphicsState(),
            concatTransformationMatrix(image.width, 0, 0, image.height, pen - image.left, size.height - baselineFromTop - image.below),
            drawObject(key(`image ${image.ref.tag}`, () => page.node.newXObject('Char', image.ref))),
            popGraphicsState(),
          )
        }
        pen += part.width
      }
    }
    if (sheet.kind === 'title') {
      await titlePage(sheet, left, size.height, { face, shape, total, draw })
      continue
    }
    for (const line of sheet.lines) {
      await breathe()
      for (const [i, fragment] of line.fragments.entries()) {
        const next = line.fragments[i + 1]
        let tail = next?.spaced ? ' ' : ''
        if (fragment.continues) {
          // The browser sets a hyphen at a break it chose, but a hyphen is not in the text: the box it gave
          // the word holds it, or is wider than the letters by about its width. After a drawn character
          // there is none (a word of Arabic or Japanese is not hyphenated).
          const letters = await shape(fragment.face, fragment.text, fragment.size, fragment.tracking)
          if (letters.at(-1)?.kind === 'font' && (fragment.hyphenBox || fragment.width - total(letters) > 0.15 * fragment.size)) tail = '-'
        }
        const parts = await shape(fragment.face, fragment.text + tail, fragment.size, fragment.tracking)
        await draw(fragment.face, parts, fragment.size, left + fragment.x, MARGIN_TOP + line.baseline + fragment.drop, INK, fragment.tracking)
      }
    }
    if (sheet.head !== '') {
      const parts = await fitted('literata-italic-400', sheet.head, RUNNING_HEAD, COLUMN)
      const y = RUNNING_HEAD_TOP + ascent(await face('literata-italic-400', 'latin'), RUNNING_HEAD)
      await draw('literata-italic-400', parts, RUNNING_HEAD, (size.width - total(parts)) / 2, y, SECONDARY)
    }
    const y = size.height - PAGE_NUMBER_FROM_BOTTOM + ascent(await face('literata-360', 'latin'), PAGE_NUMBER)
    const parts = await shape('literata-360', String(sheet.number), PAGE_NUMBER)
    // The rule holds the left of a journal's page and the number its right; elsewhere the number is centred.
    await draw('literata-360', parts, PAGE_NUMBER, ruled ? left + COLUMN - total(parts) : (size.width - total(parts)) / 2, y, SECONDARY)
  }
  return doc.save()
}

/** What a title page needs of the file being written: the faces, the parts a text is drawn in, and drawing them. */
interface Tools {
  face(name: FaceName, script: Script): Promise<Face>
  shape(name: FaceName, text: string, pt: number, tracking?: number): Promise<Part[]>
  total(parts: Part[]): number
  draw(name: FaceName, parts: Part[], pt: number, x: number, baselineFromTop: number, ink: string, tracking?: number): Promise<void>
}

/** The title, and the subtitle in italic under it, each line centred on the column, in the upper third. */
async function titlePage(sheet: { title: string; subtitle: string }, left: number, height: number, tools: Tools): Promise<void> {
  let top = height * TITLE_PAGE_TOP
  const set = async (name: FaceName, text: string, pt: number, leading: number, tracking: number): Promise<void> => {
    if (text === '') return
    const metrics = (await tools.face(name, 'latin')).metrics
    const across = async (line: string): Promise<number> => tools.total(await tools.shape(name, line, pt, tracking))
    // The line box is `leading` tall and the text sits in its middle, as a browser sets it.
    const above = (leading - ((metrics.ascent - metrics.descent) / metrics.unitsPerEm) * pt) / 2 + (metrics.ascent / metrics.unitsPerEm) * pt
    for (const line of await wrapped(text, across, COLUMN)) {
      const parts = await tools.shape(name, line, pt, tracking)
      await tools.draw(name, parts, pt, left + (COLUMN - tools.total(parts)) / 2, top + above, INK, tracking)
      top += leading
    }
    top += TITLE_PAGE_GAP
  }
  await set('literata-300-title', sheet.title, TITLE_PAGE_TITLE, TITLE_PAGE_TITLE * TITLE_PAGE_TITLE_LEADING, -0.012)
  await set('literata-italic-400', sheet.subtitle, TITLE_PAGE_SUBTITLE, TITLE_PAGE_SUBTITLE * TITLE_PAGE_SUBTITLE_LEADING, 0)
}

/** Text broken into lines that fit a room, at its spaces; a word wider than the room is broken between its letters. */
async function wrapped(text: string, across: (line: string) => Promise<number>, room: number): Promise<string[]> {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line !== '' && (await across(`${line} ${word}`)) <= room) {
      line = `${line} ${word}`
      continue
    }
    if (line !== '') lines.push(line)
    line = ''
    for (const { segment } of graphemes.segment(word)) {
      if (line !== '' && (await across(line + segment)) > room) {
        lines.push(line)
        line = ''
      }
      line += segment
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
