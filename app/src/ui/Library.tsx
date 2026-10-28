import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Kind, Piece } from '../domain/model'
import { totalWords } from '../domain/pieces'
import { dayTitle, number, ordinal, shortDate, words } from '../domain/words'
import { ExportSheet } from './Export'
import { Icon, IconButton } from './Icon'
import startBook from './icons/start-book.svg'
import startBookNight from './icons/start-book-night.svg'
import startEssay from './icons/start-essay.svg'
import startEssayNight from './icons/start-essay-night.svg'
import startJournal from './icons/start-journal.svg'
import startJournalNight from './icons/start-journal-night.svg'
import { theme, update, useSettings } from './settings'
import { download } from './download'
import { unsaved, useUnsaved } from './unsaved'
import { useUpdateWaiting } from './updates'

interface Props {
  pieces: Piece[]
  /** The piece last written in: Continue. */
  last?: Piece
  today: string
  onOpen(piece: Piece): void
  onNew(kind: Kind): void
  onRename(piece: Piece, title: string): void
  /** Downloads the piece as one .md file; gives the file name. */
  onExport(piece: Piece): Promise<string | undefined>
}

const KINDS: { kind: Kind; group: string; word: string }[] = [
  { kind: 'book', group: 'Books', word: 'Book' },
  { kind: 'journal', group: 'Journal', word: 'Journal' },
  { kind: 'essay', group: 'Essays', word: 'Essay' },
]

export function Library({ pieces, last, today, onOpen, onNew, onRename, onExport }: Props) {
  const settings = useSettings()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  const empty = pieces.length === 0
  const now = Date.now()
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [exporting, setExporting] = useState<Piece | null>(null)
  const [line, setLine] = useState<string | null>(null)
  useEffect(() => {
    if (!line) return
    const t = setTimeout(() => setLine(null), 4000)
    return () => clearTimeout(t)
  }, [line])

  return (
    <div className="library" role="main">
      <div className="library-inner">
        <div className="library-head">
          <h1 ref={headingRef} tabIndex={-1}>
            Library
          </h1>
          {/* shortcut: the view switch and settings arrive with the shelf and the Settings views. */}
        </div>

        {empty ? (
          <Empty today={today} onNew={onNew} firstRun={!settings.firstRunDone} />
        ) : (
          <>
            {last && (
              <>
                <div className="continue-heading">Where you left off</div>
                <button type="button" className="continue surface" onClick={() => onOpen(last)}>
                  <span className="continue-excerpt">{excerpt(last)}</span>
                  <span className="continue-foot">
                    <span className="continue-meta">{continueMeta(last)}</span>
                    <span className="patch" aria-label={`page ${last.place?.page ?? 1}`}>
                      {last.place?.page ?? 1}
                    </span>
                  </span>
                </button>
              </>
            )}
            {KINDS.map(({ kind, group }) => {
              const rows = pieces.filter((p) => p.kind === kind && p.id !== last?.id)
              if (rows.length === 0) return null
              return (
                <section className="group" key={kind} aria-labelledby={`group-${kind}`}>
                  <h2 className="group-heading" id={`group-${kind}`}>
                    <KindMark kind={kind} today={today} />
                    {group}
                  </h2>
                  <ul className="rows">
                    {rows.map((piece) => (
                      <PieceRow
                        key={piece.id}
                        piece={piece}
                        meta={meta(piece, today, now)}
                        menuOpen={menuFor === piece.id}
                        onMenu={(open) => setMenuFor(open ? piece.id : null)}
                        onOpen={() => onOpen(piece)}
                        onRename={(title) => onRename(piece, title)}
                        onExport={() => {
                          setMenuFor(null)
                          setExporting(piece)
                        }}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
            {!settings.firstRunDone && <FirstRun atFoot />}
          </>
        )}
      </div>
      <NewPiece today={today} onNew={onNew} />
      <div className="library-lines">
        <UnsavedLine />
        <UpdateLine />
        {line && (
          <div className="line surface" role="status">
            {line}
          </div>
        )}
      </div>
      {exporting && (
        <ExportSheet
          title={exporting.title.trim() || 'Untitled'}
          onMarkdown={async () => {
            const name = await onExport(exporting)
            setExporting(null)
            if (name) setLine(`Saved as ${name}.`)
          }}
          onDone={() => setExporting(null)}
        />
      )}
    </div>
  )
}

/** Words a closed page could not store (0010): said here too, since the page that said it is gone. */
function UnsavedLine() {
  const waiting = useUnsaved()
  if (waiting.length === 0) return null
  return (
    <div className="line surface" role="alert">
      Can't save right now. Your words are still here.
      <button
        type="button"
        onClick={() =>
          waiting.forEach((u) => {
            download(u.name, u.markdown)
            // A copy is in the writer's hands: it no longer waits here.
            unsaved.saved(u.sectionId)
          })
        }
      >
        Save a copy
      </button>
    </div>
  )
}

/** Only in the library, never on the page: restarting here cannot cut off a sentence (0010). */
function UpdateLine() {
  const restart = useUpdateWaiting()
  if (!restart) return null
  return (
    <div className="line surface" role="status">
      A new version is ready ·
      <button type="button" onClick={restart}>
        Restart
      </button>
    </div>
  )
}

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

function NewPiece({ today, onNew }: { today: string; onNew(kind: Kind): void }) {
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

function Empty({ today, onNew, firstRun }: { today: string; onNew(kind: Kind): void; firstRun: boolean }) {
  const night = theme(useSettings()) === 'night'
  const outlines = {
    book: night ? startBookNight : startBook,
    journal: night ? startJournalNight : startJournal,
    essay: night ? startEssayNight : startEssay,
  }
  const words = { book: 'Start a book', journal: 'Start a journal', essay: 'Start an essay' }
  return (
    <div className="empty-library">
      <div className="empty-mark" aria-hidden="true">
        §
      </div>
      <p className="empty-line">Begin anywhere.</p>
      <div className="starts">
        {(['book', 'journal', 'essay'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={`start ${kind}`}
            style={{ '--start-outline': `url("${outlines[kind]}")` } as CSSProperties}
            onClick={() => onNew(kind)}
          >
            {words[kind]}
            <KindMark kind={kind} today={today} />
          </button>
        ))}
      </div>
      {firstRun && <FirstRun />}
    </div>
  )
}

/** The first-run note: where the writing lives, said once (DESIGN.md, The library; 0010). */
function FirstRun({ atFoot }: { atFoot?: boolean }) {
  // shortcut: no "Connect" until there is a place to connect (sync comes after dogfooding).
  const sentence = safariOutsideHomeScreen()
    ? 'Safari clears this after 7 days away. Add Elbowpatch to your Home Screen, or export now and then.'
    : 'Your writing lives only in this browser, which can clear it. Export now and then to keep a copy.'
  return (
    <div className={atFoot ? 'first-run at-foot' : 'first-run'}>
      <p>{sentence}</p>
      <div className="links">
        <button type="button" className="text-link" onClick={() => update({ firstRunDone: true })}>
          Not now
        </button>
      </div>
    </div>
  )
}

function safariOutsideHomeScreen(): boolean {
  const ua = navigator.userAgent
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(ua)
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return safari && !standalone
}

function excerpt(piece: Piece): string {
  return piece.place?.snippet.trim() || 'Begin anywhere.'
}

function continueMeta(piece: Piece) {
  const section = piece.sections.find((s) => s.sectionId === piece.place?.sectionId)
  if (piece.kind === 'essay') return piece.title.trim() || 'Untitled'
  const part = piece.kind === 'journal' ? dayTitle(section?.title ?? '') : section?.title.trim() || 'Untitled'
  return (
    <>
      <i>{part}</i> · {piece.title.trim() || 'Untitled'}
    </>
  )
}

function meta(piece: Piece, today: string, now: number): string {
  const date = shortDate(piece.updatedAt, now)
  if (piece.kind === 'essay') return `${words(totalWords(piece))} · ${date}`
  if (piece.kind === 'book') {
    const n = piece.sections.length
    return `${n} ${n === 1 ? 'chapter' : 'chapters'} · ${date}`
  }
  const todays = piece.sections.find((s) => s.title === today)
  const days = piece.sections.length
  const todayWords = todays ? (piece.words?.[todays.sectionId] ?? 0) : 0
  return `${number(days)} ${days === 1 ? 'day' : 'days'} · ${todayWords ? `${words(todayWords)} today` : 'nothing yet today'}`
}

/**
 * One piece in the list. Press and hold, right-click, or the menu key / Shift
 * + F10 opens the piece menu over it (DESIGN.md, The library).
 * shortcut: Put away joins the menu with Settings › Put away, its only way back after the Undo line.
 */
function PieceRow(props: {
  piece: Piece
  meta: string
  menuOpen: boolean
  onMenu(open: boolean): void
  onOpen(): void
  onRename(title: string): void
  onExport(): void
}) {
  const { piece, menuOpen, onMenu } = props
  const [renaming, setRenaming] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)

  useEffect(() => {
    if (menuOpen) menu.current?.querySelector('button')?.focus()
  }, [menuOpen])
  useEffect(() => {
    if (!renaming) return
    input.current?.focus()
    input.current?.select()
  }, [renaming])
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) onMenu(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onMenu(false)
      row.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [menuOpen])

  const finishRename = (keep: boolean) => {
    // Enter commits, then the field leaves and blurs: only the first counts, and a missing field renames nothing.
    if (!input.current || !renaming) return
    const title = input.current.value.trim()
    setRenaming(false)
    if (keep && title !== piece.title.trim()) props.onRename(title)
    requestAnimationFrame(() => row.current?.focus())
  }

  return (
    <li className="piece">
      {renaming ? (
        <div className="row pressed">
          <input
            ref={input}
            className="row-title rename"
            autoFocus
            defaultValue={piece.title}
            aria-label="Title"
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename(true)
              if (e.key === 'Escape') finishRename(false)
            }}
            onBlur={() => finishRename(true)}
          />
          <span className="row-meta">{props.meta}</span>
        </div>
      ) : (
        <button
          ref={row}
          type="button"
          className={menuOpen ? 'row pressed' : 'row'}
          aria-haspopup="menu"
          onClick={() => {
            if (held.current) held.current = false
            else props.onOpen()
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            onMenu(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
              e.preventDefault()
              onMenu(true)
            }
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'touch') return
            clearTimeout(hold.current)
            hold.current = setTimeout(() => {
              held.current = true
              onMenu(true)
            }, 500)
          }}
          onPointerUp={() => clearTimeout(hold.current)}
          onPointerCancel={() => clearTimeout(hold.current)}
          onPointerMove={() => clearTimeout(hold.current)}
        >
          <span className="row-title">{piece.title.trim() || 'Untitled'}</span>
          <span className="row-meta">{props.meta}</span>
        </button>
      )}
      {menuOpen && (
        <div
          ref={menu}
          className="bar surface piece-menu"
          role="menu"
          aria-label={piece.title.trim() || 'Untitled'}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (!step) return
            e.preventDefault()
            const items = [...menu.current!.querySelectorAll('button')]
            const at = items.indexOf(document.activeElement as HTMLButtonElement)
            items[(at + step + items.length) % items.length]?.focus()
          }}
          onBlur={(e) => {
            // Tabbing out closes it, as a press elsewhere does. (Safari does not focus a clicked
            // button, so a click inside blurs to nothing: that is not leaving.)
            const to = e.relatedTarget as Node | null
            if (to && !menu.current?.contains(to)) onMenu(false)
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              onMenu(false)
              setRenaming(true)
            }}
          >
            Rename
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={props.onExport}>
            Export
          </button>
          <span className="bar-separator" />
          <IconButton
            icon="close"
            label="Close"
            onClick={() => {
              onMenu(false)
              row.current?.focus()
            }}
          />
        </div>
      )}
    </li>
  )
}
