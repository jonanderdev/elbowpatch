import { type ReactElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { INKS, type Ink } from '../../domain/markdown'
import type { Editor } from '../../page/editor'
import { Icon, IconButton } from '../components/Icon'

type Command = Parameters<Editor['run']>[0]

function Mark({ label, glyph, pressed, onClick }: { label: string; glyph: 'B' | 'I'; pressed: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      aria-pressed={pressed}
      // Keep the selection: a press must not move focus out of the text.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <span className={glyph === 'B' ? 'glyph bold' : 'glyph italic'} aria-hidden="true">
        {glyph}
      </span>
    </button>
  )
}

function Formatting({ editor, active, onInks }: { editor: Editor; active: ReturnType<Editor['active']>; onInks(): void }) {
  const run = (c: Command) => editor.run(c)
  const highlight = () => {
    // One press marks the words in the last ink, then shows the inks to change it.
    if (!active.ink) editor.highlight(editor.lastInk())
    onInks()
  }
  return (
    <>
      <Mark label="Bold" glyph="B" pressed={active.bold} onClick={() => run('bold')} />
      <Mark label="Italic" glyph="I" pressed={active.italic} onClick={() => run('italic')} />
      <IconButton icon="highlight" label="Highlight" pressed={active.ink !== null} onClick={highlight} keepFocus />
      <IconButton icon="quote" label="Pull quote" pressed={active.quote} onClick={() => run('quote')} keepFocus />
    </>
  )
}

const INK_NAMES: Record<Ink, string> = { amber: 'Amber', citron: 'Citron', sage: 'Sage', coral: 'Coral', iris: 'Iris', sky: 'Sky' }

/** The six inks in place of the bar's buttons (DESIGN.md, Control). Pressing the chosen one takes the highlight off. */
function Inks({ editor, ink, onClose }: { editor: Editor; ink: Ink | null; onClose(): void }) {
  return (
    <>
      {INKS.map((i) => (
        <button
          key={i}
          type="button"
          className="icon-button ink-swatch"
          data-ink={i}
          aria-label={`${INK_NAMES[i]} highlight`}
          aria-pressed={ink === i}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.highlight(ink === i ? null : i)}
        />
      ))}
      <span className="bar-separator" />
      <IconButton icon="close" label="Close highlight inks" onClick={onClose} keepFocus />
    </>
  )
}

/** Marks the text while the inks are open, so the selected words show their ink untinted. A data attribute, since ProseMirror rewrites the class. */
function useChoosingInk(editor: Editor, on: boolean): void {
  useEffect(() => {
    if (!on) return
    const dom = editor.view.dom
    dom.dataset.choosingInk = ''
    return () => {
      delete dom.dataset.choosingInk
    }
  }, [editor, on])
}

/**
 * The selection menu: the same rounded bar, floating over the selected words
 * (DESIGN.md, Control). § waits for chapters.
 */
export function SelectionMenu({
  editor,
  rect,
  active,
  onKeep,
}: {
  editor: Editor
  rect: DOMRect
  active: ReturnType<Editor['active']>
  onKeep(): void
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [inks, setInks] = useState(false)
  useChoosingInk(editor, inks)
  // Placed before paint, so the bar never shows a frame at the wrong spot.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `inks` changes the bar's width, which is measured here.
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const w = bar.offsetWidth
    const h = bar.offsetHeight
    const edge = 16
    const left = Math.max(edge, Math.min(window.innerWidth - w - edge, rect.left + rect.width / 2 - w / 2))
    // Above the words if there is room, else below them.
    const top = rect.top - h - 10 > edge ? rect.top - h - 10 : rect.bottom + 10
    setPos({ left, top })
  }, [rect.left, rect.top, rect.width, rect.bottom, inks])
  return (
    <div
      ref={ref}
      className="bar surface selection-menu"
      role="toolbar"
      aria-label="Formatting"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
    >
      {inks ? (
        <Inks editor={editor} ink={active.ink} onClose={() => setInks(false)} />
      ) : (
        <>
          <Formatting editor={editor} active={active} onInks={() => setInks(true)} />
          <span className="bar-separator" />
          <IconButton icon="keep" label="Keep this moment" onClick={onKeep} keepFocus />
        </>
      )}
    </div>
  )
}

/**
 * Above the phone keyboard: undo, redo, then the formatting, then hide
 * keyboard. A phone has no reliable undo of its own (DESIGN.md, Control).
 */
export function WritingBar({ editor, active, keyboard }: { editor: Editor; active: ReturnType<Editor['active']>; keyboard: number }): ReactElement {
  const [inks, setInks] = useState(false)
  useChoosingInk(editor, inks)
  return (
    <div className="bar surface writing-bar" role="toolbar" aria-label="Writing" style={{ bottom: keyboard + 8 }} onMouseDown={(e) => e.preventDefault()}>
      {inks ? (
        <Inks editor={editor} ink={active.ink} onClose={() => setInks(false)} />
      ) : (
        <>
          <IconButton icon="undo" label="Undo" onClick={() => editor.run('undo')} />
          <IconButton icon="redo" label="Redo" onClick={() => editor.run('redo')} />
          <span className="bar-separator" />
          <Formatting editor={editor} active={active} onInks={() => setInks(true)} />
          <span className="bar-separator" />
          <button type="button" className="icon-button" aria-label="Hide keyboard" onClick={() => editor.view.dom.blur()}>
            <Icon name="keyboard" />
          </button>
        </>
      )}
    </div>
  )
}

/** How much of the screen the on-screen keyboard covers, in px (0 when it is down). */
export function useKeyboard(): number {
  const [covered, setCovered] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const on = () => {
      const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // A few px of browser chrome is not a keyboard.
      setCovered(hidden > 80 ? hidden : 0)
    }
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
    }
  }, [])
  return covered
}
