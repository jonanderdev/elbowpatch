// Reads a downloaded PDF back, for tests. pdf.js is a development dependency only: nothing of it is in the app.

import type { Download } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export interface ReadPage {
  width: number
  height: number
  /** One string per visual line, top to bottom. */
  lines: string[]
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
    pages.push({ width: width as number, height: height as number, lines, operators: JSON.stringify([list.fnArray, list.argsArray]) })
  }
  await task.destroy()
  return { count: pages.length, pages }
}
