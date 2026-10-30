import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Kind } from '../../domain/model'
import { ordinal } from '../../domain/words'
import { IconButton } from '../components/Icon'
import { WordButton } from '../components/WordButton'
import { FootLinks } from './Colophon'
import { SafariNote } from './Notes'

/** The three kinds, in the order the library and the Write bar show them. */
export const KINDS: { kind: Kind; group: string; word: string }[] = [
  { kind: 'book', group: 'Books', word: 'Book' },
  { kind: 'journal', group: 'Journal', word: 'Journal' },
  { kind: 'essay', group: 'Essays', word: 'Essay' },
]

/** Kinds have marks, not drawings: & for a book, today's date for the journal, ¶ for an essay. */
export function KindMark({ kind, today }: { kind: Kind; today: string }): ReactElement {
  if (kind === 'book')
    return (
      <span className="mark" aria-hidden="true">
        &amp;
      </span>
    )
  if (kind === 'essay')
    return (
      <span className="mark" aria-hidden="true">
        ¶
      </span>
    )
  const day = Number(today.slice(8, 10))
  return (
    <span className="mark" aria-hidden="true">
      {day}
      <sup>{ordinal(day)}</sup>
    </span>
  )
}

/**
 * Write, on a phone (DESIGN.md, The library): a raised word at the bottom right, in the page button's
 * place. Tapped, it opens into a bar: Book, Journal, Essay, then close.
 */
export function NewPiece({ today, onNew }: { today: string; onNew(kind: Kind): void }): ReactElement {
  const [open, setOpen] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const write = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) bar.current?.querySelector('button')?.focus()
  }, [open])
  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => write.current?.focus())
  }
  return (
    <div className="foot library-foot">
      {open ? (
        <div ref={bar} className="bar surface new-piece-bar" role="toolbar" aria-label="Write" onKeyDown={(e) => e.key === 'Escape' && close()}>
          {KINDS.map(({ kind, word }) => (
            <button key={kind} type="button" className="menu-item" onClick={() => onNew(kind)}>
              <KindMark kind={kind} today={today} />
              {word}
            </button>
          ))}
          <span className="bar-separator" />
          <IconButton icon="close" label="Close" onClick={close} />
        </div>
      ) : (
        <button ref={write} type="button" className="write surface" onClick={() => setOpen(true)}>
          Write
        </button>
      )}
    </div>
  )
}

/**
 * Write, on desktop: a word button at the right of the rail's top line. Pressed, it keeps the pressed tint
 * and drops a small menu under itself: Book, Journal, Essay. Escape or a click elsewhere closes it.
 */
export function WriteMenu({ today, onNew }: { today: string; onNew(kind: Kind): void }): ReactElement {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    box.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const away = (e: Event): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setOpen(false)
      box.current?.querySelector<HTMLElement>('.word-button')?.focus()
    }
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={box} className="write-menu-anchor">
      <WordButton word="Write" expanded={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="write-menu surface" role="menu" aria-label="Write">
          {KINDS.map(({ kind, word }) => (
            <button key={kind} type="button" role="menuitem" className="menu-item" onClick={() => onNew(kind)}>
              <KindMark kind={kind} today={today} />
              {word}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The start objects: the kinds' shelf shapes, drawn with a dashed line (DESIGN.md,
 * The library). Drawn here in the current colour, so one drawing serves paper and night.
 */
const OUTLINES: Record<Kind, ReactNode> = {
  // A book: squarer corners on the spine side, and the spine line near it.
  book: (
    <>
      <path d="M2.5 0.5H93.5Q99.5 0.5 99.5 6.5V133.5Q99.5 139.5 93.5 139.5H2.5Q0.5 139.5 0.5 137.5V2.5Q0.5 0.5 2.5 0.5Z" />
      <path d="M10.5 0.5V139.5" />
    </>
  ),
  // A journal: rounded all round, with a band down the right.
  journal: (
    <>
      <rect x="0.5" y="0.5" width="99" height="139" rx="10" />
      <path d="M86.5 0.5V139.5" />
    </>
  ),
  // An essay: a sheet with its top-right corner folded.
  essay: (
    <>
      <path d="M2.5 0.5H83.5L99.5 16.5V137.5Q99.5 139.5 97.5 139.5H2.5Q0.5 139.5 0.5 137.5V2.5Q0.5 0.5 2.5 0.5Z" />
      <path d="M83.5 0.5V16.5H99.5" />
    </>
  ),
}

const STARTS: Record<Kind, string> = { book: 'Start a book', journal: 'Start a journal', essay: 'Start an essay' }

/** A start object: the kind's shelf shape, dashed, with its words inside. The dashed shape is the button. */
export function Start({ kind, today, onNew }: { kind: Kind; today: string; onNew(kind: Kind): void }): ReactElement {
  return (
    <button type="button" className={`start ${kind}`} onClick={() => onNew(kind)}>
      <svg className="start-outline" viewBox="0 0 100 140" width="100" height="140" aria-hidden="true">
        {OUTLINES[kind]}
      </svg>
      {STARTS[kind]}
      <KindMark kind={kind} today={today} />
    </button>
  )
}

export function Empty({ today, onNew, firstRun }: { today: string; onNew(kind: Kind): void; firstRun: boolean }): ReactElement {
  return (
    <div className="empty-library">
      <div className="empty-mark" aria-hidden="true">
        §
      </div>
      <p className="empty-line">Begin anywhere.</p>
      <div className="starts">
        {KINDS.map(({ kind }) => (
          <Start key={kind} kind={kind} today={today} onNew={onNew} />
        ))}
      </div>
      {firstRun && <SafariNote />}
      {/* The large § is the mark here: the links stand alone at the foot, on Write's row on a phone. */}
      <FootLinks atFoot />
    </div>
  )
}

const NONE: Record<Kind, string> = { book: 'No books yet.', journal: 'No journal yet.', essay: 'No essays yet.' }

/** A place in the rail with nothing in it: the kind's mark large, one line, and its one start object. */
export function EmptyKind({ kind, today, onNew }: { kind: Kind; today: string; onNew(kind: Kind): void }): ReactElement {
  return (
    <div className="empty-library empty-kind">
      <div className="empty-mark" aria-hidden="true">
        <KindMark kind={kind} today={today} />
      </div>
      <p className="empty-line">{NONE[kind]}</p>
      <div className="starts">
        <Start kind={kind} today={today} onNew={onNew} />
      </div>
    </div>
  )
}

/**
 * Safari deletes a site's storage after 7 days away unless it is on the Home
 * Screen (0010): the one real risk, said once, there only.
 */
