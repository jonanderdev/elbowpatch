import { type ReactElement, useEffect, useRef, useState } from 'react'
import type { Kind, Piece } from '../../domain/model'
import { screenOf } from '../../page/pager'
import { ExportSheet } from '../components/ExportSheet'
import { IconButton } from '../components/Icon'
import { update, useSettings } from '../stores/settings'
import { Colophon } from './Colophon'
import { Empty, KINDS, NewPiece } from './NewPiece'
import { ExportReminder, SafariNote, UnsavedLine, UpdateLine } from './Notes'
import { PieceRow } from './PieceRow'
import { continueMeta, excerpt, meta, shelfMeta } from './text'

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

export function Library({
  pieces,
  last,
  today,
  onOpen,
  onNew,
  onRename,
  onExport,
  onPutAway,
  onRestore,
  onSettings,
  onExportEverything,
}: Props): ReactElement | null {
  const settings = useSettings()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  const empty = pieces.length === 0
  const onShelf = settings.libraryView === 'shelf'
  const now = Date.now()
  // A book's pages are those of this screen's page: a phone and a desktop count them apart (DESIGN.md, Layout).
  const screen = screenOf(document.documentElement.clientWidth)
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
  // The undo as it is now, for the key listener below (made once per put-away, not per render).
  const undoNow = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (!awayNow) return
    const t = setTimeout(() => setAwayNow(null), 6000)
    const undo = (e: KeyboardEvent) => {
      // In a text field, ⌘/Ctrl + Z is that field's own undo.
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable]')) return
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void undoNow.current()
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
    meta: onShelf && where === 'row' ? shelfMeta(piece, screen) : meta(piece, today, now, screen),
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
  const undoPutAway = async (): Promise<void> => {
    if (!awayNow) return
    const piece = awayNow
    setAwayNow(null)
    await onRestore(piece)
  }
  undoNow.current = undoPutAway

  return (
    <main className="library">
      <div className="library-inner">
        <div className="library-head">
          <h1 ref={headingRef} tabIndex={-1}>
            Library
          </h1>
          <div className="library-actions">
            {/* The switch shows the view it leads to; an empty library has none. */}
            {!empty && (
              <IconButton
                icon={onShelf ? 'viewList' : 'viewShelf'}
                label={onShelf ? 'Show as a list' : 'Show as a shelf'}
                quiet
                onClick={() => update({ libraryView: onShelf ? 'list' : 'shelf' })}
              />
            )}
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
                        <span className="patch">
                          <span className="visually-hidden">page </span>
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
                  {/* On a phone the shelf scrolls sideways: the piece menu floats over this box, not inside it. */}
                  <div className={onShelf ? 'shelf-row' : undefined}>
                    <ul className={onShelf ? 'shelf' : 'rows'}>
                      {rows.map((piece) => (
                        <PieceRow key={piece.id} {...handlers(piece, 'row')} onShelf={onShelf} />
                      ))}
                    </ul>
                  </div>
                </section>
              )
            })}
            {!settings.firstRunDone && <SafariNote atFoot />}
            <ExportReminder pieces={pieces} onExport={onExportEverything} onDone={setLine} />
            <Colophon />
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
    </main>
  )
}
