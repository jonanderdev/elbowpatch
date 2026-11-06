import { type ReactElement, useEffect, useState } from 'react'
import type { Passage } from '../../page/passage'
import { useFloatingAt } from '../components/useFloatingAt'
import type { SelectedPart } from './usePart'

interface MenuProps {
  /** Where the selected words are, on the page in view. */
  rect: DOMRect
  /** Whether the passage can go back into the section: false offers *Copy* alone. */
  canBring: boolean
  onBring(): void
  onCopy(): void
}

/**
 * The selection bar of the Time Machine (DESIGN.md): bring the selected passage back, where it stood and
 * replacing nothing, or copy it. Pressing leaves the selection where it is.
 */
export function PartMenu({ rect, canBring, onBring, onCopy }: MenuProps): ReactElement {
  const { ref, style } = useFloatingAt(rect)
  return (
    <div ref={ref} className="bar surface part-menu" role="toolbar" aria-label="Selected words" style={style}>
      {canBring ? (
        <>
          <button type="button" className="part-action" onMouseDown={(e) => e.preventDefault()} onClick={onBring}>
            Bring part back
          </button>
          <span className="bar-separator" />
        </>
      ) : null}
      <button type="button" className="part-action" onMouseDown={(e) => e.preventDefault()} onClick={onCopy}>
        Copy
      </button>
    </div>
  )
}

interface Props {
  /** The words selected in the old text, or none. */
  part: SelectedPart | null
  /** Whether the passage can go back into the section; *Copy* is always there. */
  canBring: boolean
  onBring(passage: Passage): void
}

/** What the selection in old text offers, and says when it copied: the clipboard gets the passage as Markdown, as copying on the page does. */
export function Part({ part, canBring, onBring }: Props): ReactElement {
  const [copied, setCopied] = useState(false)
  const there = !!part
  // Said once, for the words that were copied: a new selection starts afresh.
  useEffect(() => {
    if (!there) setCopied(false)
  }, [there])

  function copy(passage: Passage): void {
    void navigator.clipboard
      ?.writeText(passage.markdown)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return (
    <>
      {part ? <PartMenu rect={part.rect} canBring={canBring} onBring={() => onBring(part.passage)} onCopy={() => copy(part.passage)} /> : null}
      <div className="visually-hidden" aria-live="polite">
        {copied ? 'Copied' : ''}
      </div>
    </>
  )
}
