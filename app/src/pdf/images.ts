// What no font file holds (an emoji, Arabic, Japanese, a letter with a mark that has no precomposed form)
// is drawn by the browser, as it sets it on the page, and placed in the file as a small image at the size
// and place of the line (docs/decisions/0019). An image is made from the browser's pixels, so it cannot be
// selected as text, but it is there, and never an empty box.

import type { PDFDocument, PDFRef } from 'pdf-lib'
import type { FaceName } from './layout'

/** Pixels in the canvas for each CSS pixel of the printed size: about 290 dots to the inch. */
const SCALE = 3
/** A point is this many CSS pixels. */
const PX = 96 / 72

const FAMILY: Record<FaceName, string> = {
  'literata-360': '360 {px} Literata, serif',
  'literata-300-title': '300 {px} Literata, serif',
  'literata-600': '600 {px} Literata, serif',
  'literata-600-initial': '600 {px} Literata, serif',
  'literata-italic-400': 'italic 400 {px} Literata, serif',
  'eb-garamond-italic-400': 'italic 400 {px} "EB Garamond", serif',
  'eb-garamond-italic-600': 'italic 600 {px} "EB Garamond", serif',
}

/** The font as the layout set the face, for a size in CSS pixels; built from its parts, since a computed shorthand is not the same in every browser. */
function fontFor(face: FaceName, px: number): string {
  return FAMILY[face].replace('{px}', `${px}px`)
}

let canvas: HTMLCanvasElement | undefined

function context(): CanvasRenderingContext2D {
  canvas ??= document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No canvas to draw the characters on')
  return ctx
}

const advances = new Map<string, number>()

/** How far the browser sets the text on, in points, at the face and size. Fonts the page needs are loaded first. */
export async function advance(face: FaceName, text: string, pt: number): Promise<number> {
  const key = `${face}|${pt}|${text}`
  let known = advances.get(key)
  if (known === undefined) {
    const font = fontFor(face, pt * PX)
    await document.fonts.load(font, text).catch(() => {})
    const ctx = context()
    ctx.font = font
    known = ctx.measureText(text).width / PX
    advances.set(key, known)
  }
  return known
}

/** An image in the file: where its box lies against the pen on the baseline, in points. */
export interface Drawn {
  ref: PDFRef
  /** The box's size. */
  width: number
  height: number
  /** How far the box starts left of the pen. */
  left: number
  /** How far the box's bottom lies below the baseline. */
  below: number
}

const made = new WeakMap<PDFDocument, Map<string, Promise<Drawn>>>()

/** The text drawn in the face's ink at the size, as an image embedded once in the document. */
export function draw(doc: PDFDocument, face: FaceName, text: string, pt: number, ink: string): Promise<Drawn> {
  const known = made.get(doc) ?? new Map<string, Promise<Drawn>>()
  made.set(doc, known)
  const key = `${face}|${pt}|${ink}|${text}`
  const image = known.get(key) ?? render(doc, face, text, pt, ink)
  known.set(key, image)
  return image
}

async function render(doc: PDFDocument, face: FaceName, text: string, pt: number, ink: string): Promise<Drawn> {
  const px = pt * PX * SCALE
  const font = fontFor(face, px)
  await document.fonts.load(font, text).catch(() => {})
  const ctx = context()
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const m = ctx.measureText(text)
  // Colour emoji and tall scripts reach past the font's own ascent and descent, so the box takes what is drawn.
  const ascent = Math.ceil(Math.max(m.fontBoundingBoxAscent ?? px * 0.9, m.actualBoundingBoxAscent ?? 0))
  const descent = Math.ceil(Math.max(m.fontBoundingBoxDescent ?? px * 0.3, m.actualBoundingBoxDescent ?? 0))
  const pad = Math.ceil(px * 0.1)
  const before = pad + Math.ceil(Math.max(0, m.actualBoundingBoxLeft ?? 0))
  const width = before + Math.ceil(Math.max(m.width, m.actualBoundingBoxRight ?? 0)) + pad
  const height = ascent + descent + 2 * pad
  // Resizing the canvas resets what was set on it.
  canvas = canvas as HTMLCanvasElement
  canvas.width = width
  canvas.height = height
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = ink
  ctx.fillText(text, before, pad + ascent)
  const { data } = ctx.getImageData(0, 0, width, height)
  const rgb = new Uint8Array(width * height * 3)
  const alpha = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    rgb[i * 3] = data[p] as number
    rgb[i * 3 + 1] = data[p + 1] as number
    rgb[i * 3 + 2] = data[p + 2] as number
    alpha[i] = data[p + 3] as number
  }
  const mask = doc.context.register(
    doc.context.flateStream(alpha, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }),
  )
  const ref = doc.context.register(
    doc.context.flateStream(rgb, {
      Type: 'XObject',
      Subtype: 'Image',
      Width: width,
      Height: height,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      SMask: mask,
    }),
  )
  const point = 1 / (PX * SCALE)
  return { ref, width: width * point, height: height * point, left: before * point, below: (descent + pad) * point }
}
