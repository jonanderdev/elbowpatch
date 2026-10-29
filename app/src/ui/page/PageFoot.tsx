import type { RefObject, ReactElement } from 'react'
import { words as wordsLine } from '../../domain/words'
import { ToolsBar } from './Tools'

interface PageFootProps {
  page: number
  count: number
  words: number
  journal: boolean
  tools: boolean
  /** "Your tools are here", until the tools are first opened on this device (DESIGN.md, Control). */
  showWayIn: boolean
  /** The phone keyboard's height: the foot rides above it. */
  keyboard: number
  pageButtonRef: RefObject<HTMLButtonElement | null>
  onOpenTools(): void
  onCloseTools(): void
  onTextSettings(): void
  onExport(): void
}

/** The foot of the page: the page button, which opens into the tools bar. */
export function PageFoot({ page, count, words, journal, tools, showWayIn, keyboard, pageButtonRef, onOpenTools, onCloseTools, onTextSettings, onExport }: PageFootProps): ReactElement {
  return (
    <div className={keyboard > 0 ? 'foot raised' : 'foot'} style={keyboard > 0 ? { bottom: keyboard } : undefined}>
      {/* The day's words, at the text's left edge, level with the page button. */}
      {journal && !tools && <span className="day-words">{wordsLine(words)}</span>}
      {tools ? (
        <ToolsBar page={page + 1} count={count} words={words} onClose={onCloseTools} onTextSettings={onTextSettings} onExport={onExport} />
      ) : (
        <>
          {showWayIn && (
            <span className="way-in" aria-hidden="true">
              Your tools are here
            </span>
          )}
          <button ref={pageButtonRef} type="button" className="page-button surface" aria-label={`Page ${page + 1} of ${count}. Open tools`} onClick={onOpenTools}>
            {page + 1}
          </button>
        </>
      )}
    </div>
  )
}

interface StatusLineProps {
  writer: 'waiting' | 'here' | 'elsewhere'
  failed: boolean
  /** A calm line for a few seconds ("Saved as …"). */
  line: string | null
  onWriteHere(): void
  onSaveCopy(): void
}

/** One line at the foot, most important first: another window writes, a save failed, or a calm note. */
export function StatusLine({ writer, failed, line, onWriteHere, onSaveCopy }: StatusLineProps): ReactElement | null {
  if (writer === 'elsewhere')
    return (
      <div className="line surface" role="status">
        Open in another window ·
        <button type="button" onClick={onWriteHere}>
          Write here
        </button>
      </div>
    )
  if (failed)
    return (
      <div className="line surface" role="alert">
        Can't save right now. Your words are still here.
        <button type="button" onClick={onSaveCopy}>
          Save a copy
        </button>
      </div>
    )
  if (!line) return null
  return (
    <div className="line surface" role="status">
      {line}
    </div>
  )
}
