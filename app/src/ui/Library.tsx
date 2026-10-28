import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Kind, Piece } from '../domain/model'
import { totalWords } from '../domain/pieces'
import { dayTitle, number, ordinal, shortDate, words } from '../domain/words'
import { ExportSheet } from './Export'
import { Icon, IconButton } from './Icon'
import { update, useSettings } from './settings'
import { download } from './download'
import { lastExport } from './everything'
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
  onPutAway(piece: Piece): Promise<void>
  onRestore(piece: Piece): Promise<void>
  onSettings(): void
  /** Downloads everything as one zip; gives its file name. */
  onExportEverything(): Promise<string>
}

const KINDS: { kind: Kind; group: string; word: string }[] = [
  { kind: 'book', group: 'Books', word: 'Book' },
  { kind: 'journal', group: 'Journal', word: 'Journal' },
  { kind: 'essay', group: 'Essays', word: 'Essay' },
]

export function Library({ pieces, last, today, onOpen, onNew, onRename, onExport, onPutAway, onRestore, onSettings, onExportEverything }: Props) {
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
  // "Put away for 30 days. Undo", for about 6 seconds; ⌘/Ctrl + Z undoes it too while it shows.
  const [awayNow, setAwayNow] = useState<Piece | null>(null)
  useEffect(() => {
    if (!awayNow) return
    const t = setTimeout(() => setAwayNow(null), 6000)
    const undo = (e: KeyboardEvent) => {
      // In a text field, ⌘/Ctrl + Z is that field's own undo.
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable]')) return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void undoPutAway()
      }
    }
    window.addEventListener('keydown', undo)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', undo)
    }
  }, [awayNow])
  /** The piece menu works the same on Continue and on every row (DESIGN.md, The library). */
  // One menu at a time, by place: the piece in Continue is also in its group.
  const handlers = (piece: Piece, where: 'continue' | 'row') => ({
    piece,
    meta: meta(piece, today, now),
    menuOpen: menuFor === `${where}:${piece.id}`,
    onMenu: (open: boolean) => setMenuFor(open ? `${where}:${piece.id}` : null),
    onOpen: () => onOpen(piece),
    onRename: (title: string) => onRename(piece, title),
    onExport: () => {
      setMenuFor(null)
      setExporting(piece)
    },
    onPutAway: async () => {
      setMenuFor(null)
      // Never asks first: nothing is lost, and Undo is right there (0006).
      await onPutAway(piece)
      setAwayNow(piece)
    },
  })
  const undoPutAway = async () => {
    if (!awayNow) return
    const piece = awayNow
    setAwayNow(null)
    await onRestore(piece)
  }

  return (
    <div className="library" role="main">
      <div className="library-inner">
        <div className="library-head">
          <h1 ref={headingRef} tabIndex={-1}>
            Library
          </h1>
          {/* shortcut: the view switch arrives with the shelf. */}
          <div className="library-actions">
            <IconButton icon="settings" label="Settings" quiet onClick={onSettings} />
          </div>
        </div>

        {empty ? (
          <Empty today={today} onNew={onNew} firstRun={!settings.firstRunDone} />
        ) : (
          <>
            {last && (
              <>
                <div className="continue-heading">Where you left off</div>
                <PieceRow
                  {...handlers(last, 'continue')}
                  card={
                    <>
                      <span className="continue-excerpt">{excerpt(last)}</span>
                      <span className="continue-foot">
                        <span className="continue-meta">{continueMeta(last)}</span>
                        <span className="patch" aria-label={`page ${last.place?.page ?? 1}`}>
                          {last.place?.page ?? 1}
                        </span>
                      </span>
                    </>
                  }
                />
              </>
            )}
            {KINDS.map(({ kind, group }) => {
              // The piece in Continue stays in its group too: every piece is where its kind is.
              const rows = pieces.filter((p) => p.kind === kind)
              if (rows.length === 0) return null
              return (
                <section className="group" key={kind} aria-labelledby={`group-${kind}`}>
                  <h2 className="group-heading" id={`group-${kind}`}>
                    {group}
                  </h2>
                  <ul className="rows">
                    {rows.map((piece) => (
                      <PieceRow key={piece.id} {...handlers(piece, 'row')} />
                    ))}
                  </ul>
                </section>
              )
            })}
            {!settings.firstRunDone && <SafariNote atFoot />}
            <ExportReminder pieces={pieces} onExport={onExportEverything} onDone={setLine} />
          </>
        )}
      </div>
      <NewPiece today={today} onNew={onNew} />
      <div className="library-lines">
        <UnsavedLine />
        <UpdateLine />
        {awayNow && (
          <div className="line surface" role="status">
            <span className="quiet-text">Put away for 30 days.</span>
            <button type="button" onClick={() => void undoPutAway()}>
              Undo
            </button>
          </div>
        )}
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

function Empty({ today, onNew, firstRun }: { today: string; onNew(kind: Kind): void; firstRun: boolean }) {
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
function SafariNote({ atFoot }: { atFoot?: boolean }) {
  if (!safariOutsideHomeScreen()) return null
  return (
    <div className={atFoot ? 'first-run at-foot' : 'first-run'}>
      <p>Safari clears this after 7 days away. Add Elbowpatch to your Home Screen.</p>
      <div className="links">
        <button type="button" className="text-link" onClick={() => update({ firstRunDone: true })}>
          Not now
        </button>
      </div>
    </div>
  )
}

/** A place to keep a copy can be connected (Settings › Backup & sync). Sync comes after dogfooding. */
const CAN_CONNECT = false

/**
 * A quiet reminder at the library's foot, only after 30 days without a copy:
 * "Last exported 5 weeks ago · Export", and "Connect a place" once there is
 * one to connect (DESIGN.md, The library).
 */
function ExportReminder({ pieces, onExport, onDone }: { pieces: Piece[]; onExport(): Promise<string>; onDone(line: string): void }) {
  const [busy, setBusy] = useState(false)
  const [, refresh] = useState(0)
  const now = Date.now()
  const last = lastExport()
  const oldest = Math.min(...pieces.map((p) => p.createdAt))
  const since = last ?? oldest
  if (pieces.length === 0 || now - since < 30 * DAY) return null
  return (
    <div className="export-reminder">
      <span>{last ? `Last exported ${ago(now - last)}` : 'Not exported yet'}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="text-link strong"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            onDone(`Everything is in ${await onExport()}.`)
          } catch {
            onDone("Couldn't export just now. Nothing has changed; try again.")
          } finally {
            setBusy(false)
            refresh((n) => n + 1)
          }
        }}
      >
        Export
      </button>
      {CAN_CONNECT && (
        <>
          <span aria-hidden="true">·</span>
          <a className="text-link strong" href="#/settings/sync">
            Connect a place
          </a>
        </>
      )}
    </div>
  )
}

const DAY = 86_400_000

/** "12 days ago", "5 weeks ago", "3 months ago". */
function ago(ms: number): string {
  const days = Math.floor(ms / DAY)
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  const months = Math.floor(days / 30)
  return months < 24 ? `${months} months ago` : `${Math.floor(days / 365)} years ago`
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
 * One piece in the list, or the Continue card. Press and hold, right-click, or
 * the menu key / Shift + F10 opens the piece menu over it (DESIGN.md, The library).
 */
function PieceRow(props: {
  /** The Continue card's body; a list row when absent. */
  card?: ReactNode
  piece: Piece
  meta: string
  menuOpen: boolean
  onMenu(open: boolean): void
  onOpen(): void
  onRename(title: string): void
  onExport(): void
  onPutAway(): void
}) {
  const { piece, menuOpen, onMenu, card } = props
  const [renaming, setRenaming] = useState(false)
  const Wrap = card ? 'div' : 'li'
  const look = card ? 'continue surface' : 'row'
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
    <Wrap className={card ? 'piece continue-piece' : 'piece'}>
      {renaming ? (
        <div className={`${look} pressed renaming`}>
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
          className={menuOpen ? `${look} pressed` : look}
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
          {card ?? (
            <>
              <span className="row-title">{piece.title.trim() || 'Untitled'}</span>
              <span className="row-meta">{props.meta}</span>
            </>
          )}
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
          <span className="tooltip-anchor">
            <button type="button" role="menuitem" className="menu-item" aria-describedby={`away-${piece.id}`} onClick={props.onPutAway}>
              Put away
            </button>
            <span role="tooltip" id={`away-${piece.id}`} className="tooltip surface">
              Hidden for 30 days. Bring it back from Settings.
            </span>
          </span>
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
    </Wrap>
  )
}
