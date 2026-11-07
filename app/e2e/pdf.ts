// Reads a downloaded PDF back, for tests. pdf.js is a development dependency only: nothing of it is in the app.

import type { Download } from '@playwright/test'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** A piece of text as the file draws it: one word, with the font it is set in (the same id for the same font in the file). */
export interface Run {
  str: string
  font: string
  /** In points. */
  size: number
  x: number
  width: number
  /** The baseline, up from the foot of the page. */
  y: number
}

/** A filled rectangle, such as the journal's margin rule, in points up from the page's foot. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
  color: string
}

type Matrix = [number, number, number, number, number, number]

/** `a` after `b`, as a `cm` operator composes. */
const compose = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
]

/** The rectangles a page fills, from its operators: the colour, the transform in force, and the path's bounds. */
function filledRects(list: { fnArray: number[]; argsArray: unknown[] }): Rect[] {
  const rects: Rect[] = []
  const saved: Matrix[] = []
  let matrix: Matrix = [1, 0, 0, 1, 0, 0]
  let color = '#000000'
  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i] as unknown[]
    if (fn === OPS.save) saved.push(matrix)
    else if (fn === OPS.restore) matrix = saved.pop() ?? matrix
    else if (fn === OPS.transform) matrix = compose(args as unknown as Matrix, matrix)
    else if (fn === OPS.setFillRGBColor) color = args[0] as string
    else if (fn === OPS.constructPath && args[0] === OPS.fill) {
      const [x0, y0, x1, y1] = args[2] as number[]
      const [a, , , d, e, f] = matrix
      rects.push({
        x: e + a * (x0 as number),
        y: f + d * (y0 as number),
        width: a * ((x1 as number) - (x0 as number)),
        height: d * ((y1 as number) - (y0 as number)),
        color,
      })
    }
  })
  return rects
}

export interface ReadPage {
  width: number
  height: number
  /** The rectangles the page fills, such as a margin rule. */
  rects: Rect[]
  /** One string per visual line, top to bottom. */
  lines: string[]
  /** Every piece of text as it stands in the file, in order: what searching reads. */
  text: string
  /** Every piece of text with where and in what it is drawn, in order. */
  runs: Run[]
  /** What was drawn, as pdf.js reports it: the same for the same pages. */
  operators: string
}

/** The text of a PDF, one string per visual line and per page, and the size of its pages. */
export async function readPdf(file: Download): Promise<{ count: number; pages: ReadPage[] }> {
  const chunks: Uint8Array[] = []
  const stream = (await file.createReadStream()) as unknown as AsyncIterable<Uint8Array>
  for await (const chunk of stream) chunks.push(chunk)
  const data = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const chunk of chunks) {
    data.set(chunk, at)
    at += chunk.length
  }
  const task = getDocument({ data, useSystemFonts: false })
  const doc = await task.promise
  const pages: ReadPage[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const [, , width, height] = page.view as number[]
    const { items } = await page.getTextContent()
    const rows = new Map<number, { x: number; str: string }[]>()
    for (const item of items as { str: string; transform: number[] }[]) {
      if (!item.str) continue
      const y = Math.round(item.transform[5] as number)
      rows.set(y, [...(rows.get(y) ?? []), { x: item.transform[4] as number, str: item.str }])
    }
    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) =>
        row
          .sort((a, b) => a.x - b.x)
          .map((cell) => cell.str)
          .join('')
          .trimEnd(),
      )
    const list = await page.getOperatorList()
    const text = (items as { str: string }[]).map((item) => item.str).join('')
    // Which fonts are ready is the reader's own business (it adds a "dependency" operator as they load): not part of the page.
    const drawn = list.fnArray.map((fn, i) => [fn, list.argsArray[i]] as const).filter(([fn]) => fn !== OPS.dependency)
    const runs = (items as { str: string; fontName: string; width: number; transform: number[] }[])
      .filter((item) => item.str.trim() !== '')
      .map((item) => ({
        str: item.str,
        font: item.fontName.replace(/^g_d\d+_/, ''),
        size: Math.hypot(item.transform[0] as number, item.transform[1] as number),
        x: item.transform[4] as number,
        width: item.width,
        y: item.transform[5] as number,
      }))
    pages.push({
      width: width as number,
      height: height as number,
      rects: filledRects(list),
      lines,
      text,
      runs,
      operators: JSON.stringify([drawn, items]).replace(/g_d\d+_/g, 'g_'),
    })
  }
  await task.destroy()
  return { count: pages.length, pages }
}
