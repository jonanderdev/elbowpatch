import { useEffect, useRef, useState, type ReactNode } from 'react'
import { type Kind } from '../../domain/model'
import { ordinal, words } from '../../domain/words'
import { Icon, IconButton } from '../Icon'
import { SafariNote } from './Notes'

/** The three kinds, in the order the library and the new-piece bar show them. */
export const KINDS: { kind: Kind; group: string; word: string }[] = [
  { kind: 'book', group: 'Books', word: 'Book' },
  { kind: 'journal', group: 'Journal', word: 'Journal' },
  { kind: 'essay', group: 'Essays', word: 'Essay' },
]

/** Kinds have marks, not drawings: & for a book, today's date for the journal, ¶ for an essay. */
export function KindMark({ kind, today }: { kind: Kind; today: string }) {
  if (kind === 'book') return <span className="mark" aria-hidden="true">&amp;</span>
  if (kind === 'essay') return <span className="mark" aria-hidden="true">¶</span>
  const day = Number(today.slice(8, 10))
  return (
    <span className="mark" aria-hidden="true">
      {day}
      <sup>{ordinal(day)}</sup>
    </span>
  )
}

export function NewPiece({ today, onNew }: { today: string; onNew(kind: Kind): void }) {
  const [open, setOpen] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const plus = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) bar.current?.querySelector('button')?.focus()
  }, [open])
  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => plus.current?.focus())
  }
  return (
    <div className="foot library-foot">
      {open ? (
        <div ref={bar} className="bar surface new-piece-bar" role="toolbar" aria-label="New piece" onKeyDown={(e) => e.key === 'Escape' && close()}>
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
        <button ref={plus} type="button" className="page-button surface" aria-label="New piece" onClick={() => setOpen(true)}>
          <Icon name="add" />
        </button>
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

export function Empty({ today, onNew, firstRun }: { today: string; onNew(kind: Kind): void; firstRun: boolean }) {
  const words = { book: 'Start a book', journal: 'Start a journal', essay: 'Start an essay' }
  return (
    <div className="empty-library">
      <div className="empty-mark" aria-hidden="true">
        §
      </div>
      <p className="empty-line">Begin anywhere.</p>
      <div className="starts">
        {(['book', 'journal', 'essay'] as const).map((kind) => (
          <button key={kind} type="button" className={`start ${kind}`} onClick={() => onNew(kind)}>
            <svg className="start-outline" viewBox="0 0 100 140" width="100" height="140" aria-hidden="true">
              {OUTLINES[kind]}
            </svg>
            {words[kind]}
            <KindMark kind={kind} today={today} />
          </button>
        ))}
      </div>
      {firstRun && <SafariNote />}
    </div>
  )
}

/**
 * Safari deletes a site's storage after 7 days away unless it is on the Home
 * Screen (0010): the one real risk, said once, there only.
 */
