import { type ReactElement, type ReactNode, type RefObject, useEffect, useRef } from 'react'
import type { ContentsChapter } from '../../domain/pieces'
import { number } from '../../domain/words'
import { Icon } from '../components/Icon'
import { showCurrent } from './showCurrent'

interface ContentsListProps {
  chapters: ContentsChapter[]
  /** The chapter on the page. */
  current: string
  /** The chapters that can go, in a window that is writing. */
  removable: ReadonlySet<string>
  onOpen(sectionId: string): void
  onRemove(sectionId: string): void
}

/**
 * The book's chapters, each with the page it starts on once that is known, the current one tinted
 * (DESIGN.md, Books and chapters). It knows nothing of what holds it: the phone's sheet, or the rail.
 */
export function ContentsList({ chapters, current, removable, onOpen, onRemove }: ContentsListProps): ReactElement {
  return (
    <ol className="contents-list">
      {chapters.map((c) => {
        const goes = removable.has(c.sectionId)
        return (
          <li key={c.sectionId} className="contents-line">
            <button type="button" className="contents-row" aria-current={c.sectionId === current ? 'true' : undefined} onClick={() => onOpen(c.sectionId)}>
              <span className="contents-title">{c.title.trim() || 'Untitled'}</span>
              {goes || c.startPage === undefined ? null : <span className="contents-page">{number(c.startPage)}</span>}
            </button>
            {/* Beside the row, not in it: a button holds no other. */}
            {goes ? (
              <button type="button" className="text-link contents-remove" aria-label="Remove chapter" onClick={() => onRemove(c.sectionId)}>
                Remove
              </button>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

/** *+ New chapter*: a text link for whatever holds Contents to place, the sheet's foot or under the rail's chapters. */
export function NewChapter({ onAdd }: { onAdd(): void }): ReactElement {
  return (
    <button type="button" className="text-link strong new-chapter" onClick={onAdd}>
      <span className="new-chapter-mark">+</span> New chapter
    </button>
  )
}

const pagesWord = (pages: number): string => `${number(pages)} ${pages === 1 ? 'page' : 'pages'}`

interface ContentsSheetProps extends ContentsListProps {
  /** The book's name: a phone shows it nowhere else past the title page. */
  name: string
  /** The book's pages, once every chapter's are known. */
  pages?: number
  /** Opened by keyboard: the focus moves to the current chapter. Otherwise it stays, so the phone keyboard stays up. */
  takeFocus: boolean
  onDone(): void
  /** What stands in the foot beside Done: *+ New chapter*, in a window that is writing. */
  children?: ReactNode
}

/** Contents on a phone: a sheet dropped under the head, whose list scrolls inside it. */
export function ContentsSheet({ name, chapters, current, removable, pages, takeFocus, onOpen, onRemove, onDone, children }: ContentsSheetProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  // Once, as it opens: a long list starts at the current chapter.
  const opening = useRef(takeFocus)
  useEffect(() => {
    const row = showCurrent(ref.current)
    if (opening.current) row?.focus({ preventScroll: true })
  }, [])
  return (
    // A press in the sheet leaves the focus where it is: in the text, the keyboard stays up.
    <div ref={ref} className="sheet surface contents" role="dialog" aria-label="Contents" onMouseDown={(e) => e.preventDefault()}>
      <div className="sheet-title">
        <span className="contents-name">{name.trim() || 'Untitled'}</span>
        {pages === undefined ? null : <span className="sheet-aside contents-pages">{pagesWord(pages)}</span>}
      </div>
      <ContentsList chapters={chapters} current={current} removable={removable} onOpen={onOpen} onRemove={onRemove} />
      <div className="contents-foot">
        {children}
        <button type="button" className="text-link" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

interface ContentsRailProps extends ContentsListProps {
  open: boolean
  /** The book's pages, once every chapter's are known. */
  pages?: number
  /** Escape, from inside it. */
  onLeave(): void
  /** What stands under the chapters: *+ New chapter*, in a window that is writing. */
  children?: ReactNode
}

const RAIL_ID = 'contents-rail'

/**
 * Contents on desktop: the rail, which folds away and never moves the text (DESIGN.md, Layout). Folded,
 * it stays out of the way of the keyboard and of a screen reader.
 */
export function ContentsRail({ chapters, current, removable, pages, open, onOpen, onRemove, onLeave, children }: ContentsRailProps): ReactElement {
  const ref = useRef<HTMLElement>(null)
  // A new page opens for each chapter, so a long list starts at the current one; and again on opening.
  useEffect(() => {
    if (open) showCurrent(ref.current)
  }, [open])
  return (
    <nav
      ref={ref}
      id={RAIL_ID}
      className="rail contents-rail"
      aria-label="Contents"
      data-folded={open ? undefined : ''}
      // A press in the rail leaves the focus where it is: a chapter chosen while writing keeps the caret going.
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onLeave()
      }}
    >
      <p className="rail-line">
        {`${number(chapters.length)} ${chapters.length === 1 ? 'chapter' : 'chapters'}`}
        {pages === undefined ? null : (
          <>
            {' · '}
            <span className="contents-pages">{pagesWord(pages)}</span>
          </>
        )}
      </p>
      <ContentsList chapters={chapters} current={current} removable={removable} onOpen={onOpen} onRemove={onRemove} />
      {children}
    </nav>
  )
}

interface RailToggleProps {
  open: boolean
  onToggle(): void
  buttonRef: RefObject<HTMLButtonElement | null>
}

/** Folds the rail away and opens it again, from the path. Pressed, it leaves the focus in the text. */
export function RailToggle({ open, onToggle, buttonRef }: RailToggleProps): ReactElement {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="icon-button quiet rail-toggle"
      aria-label="Contents"
      aria-expanded={open}
      aria-controls={RAIL_ID}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      <Icon name="rail" />
    </button>
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
