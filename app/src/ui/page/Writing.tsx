import { type ReactElement, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  barRef,
}: {
  editor: Editor
  active: ReturnType<Editor['active']>
  barRef: RefObject<HTMLDivElement | null>
}): ReactElement {
  return (
    <div ref={barRef} className="bar surface writing-bar" role="toolbar" aria-label="Writing" onMouseDown={(e) => e.preventDefault()}>
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
 * Whether the on-screen keyboard is up. The keyboard may shrink the window itself (a phone's browser, and
 * Android with `interactive-widget=resizes-content`) or only the part of it on view (iPhone, installed), so
 * it is told by the visible height falling below the tallest it has been at this width. While it is up,
 * `--visible-height` on the root is the height left above it: the page screen takes that height, so the head
 * and the bars stand at its edges by CSS alone and the page scrolls inside it (DESIGN.md, Control). Written
 * on a resize, never on a scroll: nothing follows the scroll frame by frame.
 */
export function useKeyboard(): boolean {
  const [up, setUp] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let tallest = { width: 0, height: 0 }
    let wasUp = false
    // Installed on iPhone, iOS slides the view up to show the caret behind the keyboard; the screen
    // already ends above it, so it is slid back. A scroll inside the page never moves the view. Only
    // while the keyboard is up, and once as it goes down (iOS may leave the view slid): a pinch zoom
    // moves the view too, and is left where it is.
    const slideBack = (): void => {
      if (vv.offsetTop > 0) window.scrollTo(0, 0)
    }
    const onResize = (): void => {
      const width = root.clientWidth
      // A pinch zoom shrinks the visible height too: measure at scale 1.
      const height = vv.height * vv.scale
      if (width !== tallest.width) tallest = { width, height }
      tallest.height = Math.max(tallest.height, height)
      // A few px of browser chrome is not a keyboard.
      const next = tallest.height - height > 80
      if (next) root.style.setProperty('--visible-height', `${vv.height}px`)
      else root.style.removeProperty('--visible-height')
      if (next || wasUp) slideBack()
      wasUp = next
      setUp(next)
    }
    const onScroll = (): void => {
      if (wasUp) slideBack()
    }
    onResize()
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onScroll)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onScroll)
      root.style.removeProperty('--visible-height')
    }
  }, [])
  return up
}
