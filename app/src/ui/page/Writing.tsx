import { type ReactElement, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { caretRect, liftFor } from '../../page/caret'
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

function Formatting({ editor, active }: { editor: Editor; active: ReturnType<Editor['active']> }) {
  const run = (c: Command) => editor.run(c)
  return (
    <>
      <Mark label="Bold" glyph="B" pressed={active.bold} onClick={() => run('bold')} />
      <Mark label="Italic" glyph="I" pressed={active.italic} onClick={() => run('italic')} />
      <IconButton icon="quote" label="Pull quote" pressed={active.quote} onClick={() => run('quote')} keepFocus />
    </>
  )
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
  }, [rect.left, rect.top, rect.width, rect.bottom])
  return (
    <div
      ref={ref}
      className="bar surface selection-menu"
      role="toolbar"
      aria-label="Formatting"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
    >
      <Formatting editor={editor} active={active} />
      <span className="bar-separator" />
      <IconButton icon="keep" label="Keep this moment" onClick={onKeep} keepFocus />
    </div>
  )
}

/**
 * Above the phone keyboard: undo, redo, then the formatting, then hide
 * keyboard. A phone has no reliable undo of its own (DESIGN.md, Control).
 */
export function WritingBar({
  editor,
  active,
  keyboard,
  barRef,
}: {
  editor: Editor
  active: ReturnType<Editor['active']>
  keyboard: number
  barRef: RefObject<HTMLDivElement | null>
}): ReactElement {
  return (
    <div
      ref={barRef}
      className="bar surface writing-bar"
      role="toolbar"
      aria-label="Writing"
      style={{ bottom: keyboard + 12 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <IconButton icon="undo" label="Undo" onClick={() => editor.run('undo')} />
      <IconButton icon="redo" label="Redo" onClick={() => editor.run('redo')} />
      <span className="bar-separator" />
      <Formatting editor={editor} active={active} />
      <span className="bar-separator" />
      <button type="button" className="icon-button" aria-label="Hide keyboard" onClick={() => editor.view.dom.blur()}>
        <Icon name="keyboard" />
      </button>
    </div>
  )
}

/**
 * While the on-screen keyboard is up, how far above the foot of the window fixed controls must sit to
 * stand on it, in px; null when it is down. The keyboard may shrink the window itself (iPhone, and
 * Android with `interactive-widget=resizes-content`), leaving 0 to rise, so it is told by the visible
 * height falling below the tallest it has been at this width.
 */
export function useKeyboard(): number | null {
  const [covered, setCovered] = useState<number | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let tallest = { width: 0, height: 0 }
    const on = () => {
      const width = document.documentElement.clientWidth
      // A pinch zoom shrinks the visible height too: measure at scale 1.
      const height = vv.height * vv.scale
      if (width !== tallest.width) tallest = { width, height }
      tallest.height = Math.max(tallest.height, height)
      // A few px of browser chrome is not a keyboard.
      const up = tallest.height - height > 80
      setCovered(up ? Math.max(0, document.documentElement.clientHeight - vv.height - vv.offsetTop) : null)
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

/**
 * While writing with the phone keyboard up, the text is lifted so the caret stays in view, between the
 * head and the writing bar: the page keeps its height, so the keyboard covers its foot. Runs on every
 * render, as the page renders on each caret move. True while the text is lifted, so the head stands on
 * its strip.
 */
export function useCaretInView(
  editor: Editor | null,
  writing: boolean,
  keyboard: number | null,
  text: RefObject<HTMLElement | null>,
  head: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
): boolean {
  const lift = useRef(0)
  const [lifted, setLifted] = useState(false)
  useLayoutEffect(() => {
    const el = text.current
    const vv = window.visualViewport
    if (!el) return
    let next = 0
    const caret = editor && writing && keyboard !== null && vv ? caretRect(editor.view) : null
    if (caret && vv) {
      const margin = 16
      const top = Math.max(head.current?.getBoundingClientRect().bottom ?? 0, vv.offsetTop) + margin
      const bottom = Math.min(bar.current?.getBoundingClientRect().top ?? Infinity, vv.offsetTop + vv.height) - margin
      next = liftFor(caret, lift.current, { top, bottom })
    }
    if (next !== lift.current) {
      lift.current = next
      el.style.transform = next ? `translateY(${-next}px)` : ''
    }
    setLifted(next > 0)
  })
  return lifted
}
