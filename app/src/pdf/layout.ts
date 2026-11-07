// The browser sets the lines, hyphenation included, off screen at print size; this reads them back
// (docs/decisions/0019). The text is set at 8 times the printed size and divided again, because WebKit
// rounds the boxes it reports to whole pixels.

import { type Block, BREAK } from '../domain/markdown'
import type { Paper } from '../domain/paper'
import { BODY, COLUMN, INK, LEADING, PARAGRAPH_GAP, TITLE_SCALE, textHeight } from './page'

const K = 8
/** Layout px at 8x for one point. */
const U = (K * 96) / 72

/** The faces of the printed page (the fixed font files). */
export type FaceName = 'literata-360' | 'literata-300-title' | 'literata-600' | 'literata-italic-400' | 'eb-garamond-italic-400' | 'eb-garamond-italic-600'

export interface Fragment {
  text: string
  face: FaceName
  /** In points. */
  size: number
  /** From the column's left edge, in points. */
  x: number
  /** The width the browser gave it, in points. */
  width: number
  /** The letter-spacing, in ems. */
  tracking: number
  /** A space stood before it in the text, rather than it touching the fragment before it. */
  spaced: boolean
  /** The word goes on, on the next line. */
  continues: boolean
  /** The browser listed a box for a hyphen it set after this fragment. A hyphen is not in the text: it may be here, or in the fragment's own width. */
  hyphenBox: boolean
}

export interface Line {
  /** From the top of the text area, in points. */
  baseline: number
  fragments: Fragment[]
}

/** What the writer's text settings add to the page; the rest of the page is fixed. */
export interface Look {
  indent: boolean
}

const GAP = 40 * U
const STRIDE = COLUMN * U + GAP

/** Lays a title and text out, and returns its pages, each a list of lines. At least one page. */
export async function layOut(title: string, blocks: Block[], paper: Paper, lang: string, look: Look): Promise<Line[][]> {
  await loadFonts(`${title}\n${blocks.map(textOf).join('\n')}`)
  const root = document.createElement('div')
  root.lang = lang
  root.setAttribute('aria-hidden', 'true')
  root.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'visibility:hidden',
    'pointer-events:none',
    `width:${COLUMN * U}px`,
    `height:${textHeight(paper) * U}px`,
    `column-width:${COLUMN * U}px`,
    `column-gap:${GAP}px`,
    'column-fill:auto',
    `font-size:${BODY * U}px`,
    `line-height:${LEADING}`,
    'font-family:Literata,serif',
    'font-weight:360',
    "font-variation-settings:'opsz' 14.667",
    'font-optical-sizing:none',
    'font-synthesis:none',
    'font-variant-numeric:normal',
    'hyphens:auto',
    'overflow-wrap:break-word',
    'white-space:pre-wrap',
    'text-align:left',
    'text-indent:0',
    'letter-spacing:0',
    'word-spacing:0',
    `color:${INK}`,
  ].join(';')
  if (title !== '') root.append(heading(title))
  for (const [i, block] of blocks.entries()) root.append(element(block, blocks[i - 1], i === blocks.length - 1, look))
  document.body.append(root)
  try {
    return read(root)
  } finally {
    root.remove()
  }
}

function textOf(block: Block): string {
  return block.type === 'raw' ? block.text : block.spans.map((s) => s.text).join('')
}

/** Each face the text can take is loaded with the text, so the browser measures the fonts the page shows. */
async function loadFonts(text: string): Promise<void> {
  const faces = ['360 16px Literata', '300 16px Literata', '600 16px Literata', 'italic 400 16px "EB Garamond"', 'italic 600 16px "EB Garamond"']
  await Promise.all(faces.map((face) => document.fonts.load(face, text))).catch(() => {})
  await document.fonts.ready
}

function heading(title: string): HTMLElement {
  const h1 = document.createElement('h1')
  h1.textContent = title
  h1.style.cssText = [
    'margin:0',
    `padding:0 0 ${6.74 * U}px`,
    `margin-bottom:${PARAGRAPH_GAP * U}px`,
    `font-size:${TITLE_SCALE}em`,
    'font-weight:300',
    "font-variation-settings:'opsz' 60",
    'line-height:1.12',
    'letter-spacing:-0.012em',
    'hyphens:manual',
    'white-space:normal',
    'break-inside:avoid',
    'break-after:avoid',
  ].join(';')
  return h1
}

function element(block: Block, before: Block | undefined, last: boolean, look: Look): HTMLElement {
  const quote = block.type === 'quote'
  const el = document.createElement(quote ? 'blockquote' : 'p')
  const style = [
    `margin:${look.indent && quote ? PARAGRAPH_GAP * U : 0}px 0 ${last || (look.indent && !quote) ? 0 : PARAGRAPH_GAP * U}px`,
    'orphans:2',
    'widows:2',
  ]
  if (quote) {
    // As on the page: EB Garamond italic, centred, set a little larger.
    style.push(
      "font-family:'EB Garamond',serif",
      'font-style:italic',
      'font-weight:400',
      'font-size:1.36em',
      'line-height:1.32',
      'padding:0.53em 1.2em 0.58em',
      'text-align:center',
      'hyphens:manual',
    )
  } else if (look.indent && before?.type === 'paragraph') style.push('text-indent:1.5em')
  el.style.cssText = style.join(';')
  if (block.type === 'raw') {
    el.textContent = block.text
    return el
  }
  for (const span of block.spans) {
    span.text.split(BREAK).forEach((part, i) => {
      if (i > 0) el.append(document.createElement('br'))
      if (part === '') return
      let node: Node = document.createTextNode(part)
      if (span.marks.includes('strong')) node = wrap('strong', 'font-weight:600', node)
      if (span.marks.includes('em'))
        node = wrap(
          'em',
          quote ? 'font-style:italic' : "font-family:'EB Garamond',serif;font-style:italic;font-weight:400;font-size:1.17em;line-height:1",
          node,
        )
      el.append(node)
    })
  }
  if (!el.lastChild || el.lastChild.nodeName === 'BR') el.append(document.createElement('br'))
  return el
}

function wrap(tag: string, css: string, child: Node): HTMLElement {
  const el = document.createElement(tag)
  el.style.cssText = css
  el.append(child)
  return el
}

/** The face an element's text takes, from the style the browser gave it. */
function faceOf(style: CSSStyleDeclaration): FaceName {
  const weight = Number.parseFloat(style.fontWeight)
  if (style.fontFamily.includes('EB Garamond')) return weight >= 500 ? 'eb-garamond-italic-600' : 'eb-garamond-italic-400'
  if (weight <= 330) return 'literata-300-title'
  return weight >= 500 ? 'literata-600' : 'literata-360'
}

interface Box {
  left: number
  top: number
  right: number
}

/** The baseline's distance below the top of a text box, which the browsers measure from different font metrics: found once for each style. */
class Baselines {
  private known = new Map<string, number>()

  of(el: Element): number {
    const style = getComputedStyle(el)
    const key = [style.fontFamily, style.fontWeight, style.fontStyle, style.fontSize, style.fontVariationSettings].join('|')
    let ascent = this.known.get(key)
    if (ascent === undefined) {
      const probe = document.createElement('div')
      probe.setAttribute('aria-hidden', 'true')
      probe.style.cssText = `position:fixed;top:0;left:0;visibility:hidden;white-space:nowrap;line-height:normal;font-family:${style.fontFamily};font-weight:${style.fontWeight};font-style:${style.fontStyle};font-size:${style.fontSize};font-variation-settings:${style.fontVariationSettings};font-optical-sizing:none;font-synthesis:none`
      const text = probe.appendChild(document.createTextNode('x'))
      const mark = probe.appendChild(document.createElement('span'))
      mark.style.cssText = 'display:inline-block;width:0;height:0'
      document.body.append(probe)
      const range = document.createRange()
      range.selectNodeContents(text)
      ascent = mark.getBoundingClientRect().top - range.getBoundingClientRect().top
      probe.remove()
      this.known.set(key, ascent)
    }
    return ascent
  }
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function read(root: HTMLElement): Line[][] {
  const origin = root.getBoundingClientRect()
  const baselines = new Baselines()
  const pages: Line[][] = [[]]

  const place = (text: string, node: Node, box: Box, top: number, spaced: boolean, continues: boolean, hyphenBox: boolean): void => {
    const el = node.parentElement as HTMLElement
    const style = getComputedStyle(el)
    const fontPx = Number.parseFloat(style.fontSize)
    const page = Math.max(0, Math.floor((box.left - origin.left + GAP / 2) / STRIDE))
    const baseline = (top - origin.top + baselines.of(el)) / U
    while (pages.length <= page) pages.push([])
    const lineList = pages[page] as Line[]
    let line = lineList.find((l) => Math.abs(l.baseline - baseline) < 4)
    if (!line) {
      line = { baseline, fragments: [] }
      lineList.push(line)
    }
    line.fragments.push({
      text,
      face: faceOf(style),
      size: fontPx / U,
      tracking: style.letterSpacing === 'normal' ? 0 : Number.parseFloat(style.letterSpacing) / fontPx,
      x: (box.left - origin.left - page * STRIDE) / U,
      width: (box.right - box.left) / U,
      spaced,
      continues,
      hyphenBox,
    })
  }

  let spaced = true
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const data = node.data
    const words = [...data.matchAll(/\S+/gu)]
    if (words.length === 0) {
      spaced = true
      continue
    }
    const sizePx = Number.parseFloat(getComputedStyle(node.parentElement as Element).fontSize)
    words.forEach((match, w) => {
      const word = match[0]
      const start = match.index as number
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + word.length)
      const rects = [...range.getClientRects()].filter((r) => r.width > 0)
      const joined = w === 0 ? !(spaced || /^\s/u.test(data)) : false
      const space = !joined
      if (rects.length <= 1) {
        const r = rects[0]
        if (r) place(word, node, r, r.top, space, false, false)
        return
      }
      // The word is split across lines: by a hyphen the browser added, or at the column's edge.
      const pieces: { text: string; box: Box; top: number; hyphenBox: boolean }[] = []
      let at = start
      for (const { segment } of graphemes.segment(word)) {
        const part = document.createRange()
        part.setStart(node, at)
        part.setEnd(node, at + segment.length)
        const all = [...part.getClientRects()].filter((q) => q.width > 0)
        // Chromium lists the hyphen's box first, on the line before, among the rects of the letter that follows it: the last is the letter's own.
        const r = all.at(-1)
        at += segment.length
        if (!r) continue
        const last = pieces.at(-1)
        const sameLine = last && Math.abs(last.top - r.top) < 2 * U && Math.abs(last.box.right - r.left) < sizePx
        if (last && sameLine) {
          last.text += segment
          last.box.right = r.right
        } else {
          if (last && all.length > 1 && Math.abs((all[0] as DOMRect).top - last.top) < 2 * U) last.hyphenBox = true
          pieces.push({ text: segment, box: { left: r.left, top: r.top, right: r.right }, top: r.top, hyphenBox: false })
        }
      }
      pieces.forEach((piece, i) => {
        // Firefox and WebKit count a hyphen in the box the word has on that line, though not in any letter's.
        const line = rects.find((r) => Math.abs(r.top - piece.top) < 2 * U && r.left <= piece.box.left + 1 && r.right >= piece.box.right - 1)
        const box = { ...piece.box, right: Math.max(piece.box.right, line?.right ?? 0) }
        place(piece.text, node, box, piece.top, i === 0 ? space : false, i < pieces.length - 1, piece.hyphenBox)
      })
    })
    spaced = /\s$/u.test(data)
  }
  for (const page of pages) {
    page.sort((a, b) => a.baseline - b.baseline)
    for (const line of page) line.fragments.sort((a, b) => a.x - b.x)
  }
  return pages
}
