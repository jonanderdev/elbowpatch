import { useEffect, useRef, useState, type ReactNode, type ReactElement } from 'react'
import type { Piece } from '../../domain/model'
import { IconButton } from '../components/Icon'

/**
 * One piece in the list, or the Continue card. Press and hold, right-click, or
 * the menu key / Shift + F10 opens the piece menu over it (DESIGN.md, The library).
 */
export function PieceRow(props: {
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
}): ReactElement {
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
  // The parent's onMenu as it is now, for the listeners below (attached while the menu is open).
  const onMenuNow = useRef(onMenu)
  onMenuNow.current = onMenu
  useEffect(() => {
    if (!menuOpen) return
    const away = (e: Event): void => {
      if (!menu.current?.contains(e.target as Node)) onMenuNow.current(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      onMenuNow.current(false)
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
            const box = menu.current
            if (!box) return
            const items = [...box.querySelectorAll('button')]
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
