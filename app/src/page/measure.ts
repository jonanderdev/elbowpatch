import { DOMSerializer } from 'prosemirror-model'
import { parse } from '../domain/markdown'
import type { ChapterToLayOut } from '../domain/pieces'
import { layOut } from './layout'
import { Pager } from './pager'
import { schema, toDoc } from './schema'

/** Every face a chapter's text can take: Literata, and EB Garamond for italics and pull quotes. */
const FACES = ['16px Literata', 'italic 16px Literata', 'italic 16px "EB Garamond"']

/**
 * The fonts a chapter's text needs: a face arriving after it is measured would move its breaks. They are
 * split by script and load as text first asks for them (0011).
 */
export async function fontsFor(chapter: ChapterToLayOut): Promise<void> {
  const text = `${chapter.title} ${chapter.content}`
  await Promise.all(FACES.map((face) => document.fonts.load(face, text))).catch(() => {})
}

/** Whether the faces a chapter's text needs are loaded: if so it can be laid out now, with no wait. */
export function fontsReady(chapter: ChapterToLayOut): boolean {
  const text = `${chapter.title} ${chapter.content}`
  return FACES.every((face) => document.fonts.check(face, text))
}

/**
 * A chapter's pages on this screen's page at the text settings, laid out as the page lays it out: the same
 * elements, styles and pager, without an editor (0003). Built, read and taken away in one task, so it is
 * never painted and nothing ever finds it in the document. `short`: on the Time Machine's page, which ends
 * above the moment bar.
 */
export function measureChapter(chapter: ChapterToLayOut, short = false): number {
  const screen = element('page-screen')
  screen.style.visibility = 'hidden'
  screen.style.contain = 'strict'
  const viewport = screen.appendChild(element('pager'))
  const flow = viewport.appendChild(element('flow'))
  flow.lang = chapter.lang
  flow.toggleAttribute('data-title-page', chapter.titlePage)
  const title = flow.appendChild(document.createElement('h1'))
  title.className = 'title'
  title.contentEditable = 'plaintext-only'
  title.textContent = chapter.title
  title.dataset.placeholder = 'Chapter title'
  title.toggleAttribute('data-empty', chapter.title === '')
  const body = flow.appendChild(textOf(chapter))

  document.getElementById('app')?.append(screen)
  const pager = new Pager(viewport, flow, body, () => {})
  layOut(pager, screen, 'book', short)
  screen.remove()
  return pager.count
}

/** The text as the editor shows it: an editable box, with a line kept for a paragraph that ends empty. */
function textOf(chapter: ChapterToLayOut): HTMLElement {
  const body = element('body')
  body.lang = chapter.lang
  body.contentEditable = 'true'
  body.spellcheck = false
  body.append(DOMSerializer.fromSchema(schema).serializeFragment(toDoc(parse(chapter.content)).content))
  for (const block of body.children) if (!block.lastChild || block.lastChild.nodeName === 'BR') block.append(document.createElement('br'))
  return body
}

function element(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
}
