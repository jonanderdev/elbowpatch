import { type ReactElement, type ReactNode, useEffect, useRef } from 'react'
import type { ContentsChapter } from '../../domain/pieces'
import { number } from '../../domain/words'
import { Icon } from '../components/Icon'

interface ContentsListProps {
  chapters: ContentsChapter[]
  /** The chapter on the page. */
  current: string
  onOpen(sectionId: string): void
}

/**
 * The book's chapters, each with the page it starts on once that is known, the current one tinted
 * (DESIGN.md, Books and chapters). It knows nothing of what holds it: the phone's sheet, or the rail.
 */
export function ContentsList({ chapters, current, onOpen }: ContentsListProps): ReactElement {
  return (
    <ol className="contents-list">
      {chapters.map((c) => (
        <li key={c.sectionId}>
          <button type="button" className="contents-row" aria-current={c.sectionId === current ? 'true' : undefined} onClick={() => onOpen(c.sectionId)}>
            <span className="contents-title">{c.title.trim() || 'Untitled'}</span>
            {c.startPage === undefined ? null : <span className="contents-page">{number(c.startPage)}</span>}
          </button>
        </li>
      ))}
    </ol>
  )
}

/** *+ New chapter*: a text link for whatever holds Contents to place, the sheet's foot or under the rail's chapters. */
export function NewChapter({ onAdd }: { onAdd(): void }): ReactElement {
  return (
    <button type="button" className="text-link strong" onClick={onAdd}>
      + New chapter
    </button>
  )
}

interface ContentsSheetProps extends ContentsListProps {
  /** The book's pages, once every chapter's are known. */
  pages?: number
  /** Opened by keyboard: the focus moves to the current chapter. Otherwise it stays, so the phone keyboard stays up. */
  takeFocus: boolean
  onDone(): void
  /** What stands in the foot beside Done: *+ New chapter*, in a window that is writing. */
  children?: ReactNode
}

/** Contents on a phone: a sheet dropped under the head, whose list scrolls inside it. */
export function ContentsSheet({ chapters, current, pages, takeFocus, onOpen, onDone, children }: ContentsSheetProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  // Once, as it opens: a long list starts at the current chapter.
  const opening = useRef(takeFocus)
  useEffect(() => {
    const list = ref.current?.querySelector<HTMLElement>('.contents-list')
    const row = ref.current?.querySelector<HTMLElement>('[aria-current="true"]')
    if (!list || !row) return
    const gap = row.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom
    if (gap > 0) list.scrollTop += gap
    if (opening.current) row.focus({ preventScroll: true })
  }, [])
  return (
    // A press in the sheet leaves the focus where it is: in the text, the keyboard stays up.
    <div ref={ref} className="sheet surface contents" role="dialog" aria-label="Contents" onMouseDown={(e) => e.preventDefault()}>
      <div className="sheet-title">
        <span>Contents</span>
        {pages === undefined ? null : <span className="sheet-aside">{`${number(pages)} ${pages === 1 ? 'page' : 'pages'}`}</span>}
      </div>
      <ContentsList chapters={chapters} current={current} onOpen={onOpen} />
      <div className="contents-foot">
        {children}
        <button type="button" className="text-link" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

interface RunningHeadControlProps {
  title: string
  open: boolean
  onOpen(from: HTMLElement): void
}

/** A book's running head on a phone: a control with ⌄ that drops Contents (DESIGN.md, Control). */
export function RunningHeadControl({ title, open, onOpen }: RunningHeadControlProps): ReactElement {
  const name = title.trim() || 'Untitled'
  return (
    <button
      type="button"
      className="running-control"
      aria-label={`${name}. Contents`}
      aria-haspopup="dialog"
      aria-expanded={open}
      // Pressed, it leaves the focus in the text: Contents opens with the keyboard up.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      <span className="running-title">{name}</span>
      <Icon name="chevronDown" />
    </button>
  )
}
