import { useEffect, useRef, useState } from 'react'
import { type Kind, type Piece } from '../../domain/model'
import { ExportSheet } from '../components/ExportSheet'
import { IconButton } from '../components/Icon'
import { useSettings } from '../stores/settings'
import { Empty, KINDS, NewPiece } from './NewPiece'
import { UnsavedLine, UpdateLine, SafariNote, ExportReminder } from './Notes'
import { excerpt, continueMeta, meta } from './text'
import { PieceRow } from './PieceRow'

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

