import type { ReactElement, RefObject } from 'react'
import { words as wordsLine } from '../../domain/words'
import { Icon } from '../components/Icon'
import { ToolsBar } from './Tools'

interface PageFootProps {
  page: number
  count: number
  words: number
  journal: boolean
  /** A book's or a journal's title page, which carries no folio. */
  titlePage: boolean
  tools: boolean
  /** While the phone keyboard is up, how far the foot rises to stand on it; null when it is down. */
  keyboard: number | null
  pageButtonRef: RefObject<HTMLButtonElement | null>
  onOpenTools(): void
  onCloseTools(): void
  onTextSettings(): void
  onExport(): void
}

/**
 * The foot of the page: the folio, and on a phone the page button, which opens into the tools bar
 * (DESIGN.md, Control). The folio stands aside while the tools bar or the keyboard says the page.
 */
export function PageFoot({
  page,
  count,
  words,
  journal,
  titlePage,
  tools,
  keyboard,
  pageButtonRef,
  onOpenTools,
  onCloseTools,
  onTextSettings,
  onExport,
}: PageFootProps): ReactElement {
  const folio = !journal && !titlePage && !tools && keyboard === null
  return (
    <>
      {folio && (
        <div className="folio" aria-hidden="true">
          {page + 1}
        </div>
      )}
      <div className={keyboard !== null ? 'foot raised' : 'foot'} style={keyboard !== null ? { bottom: keyboard } : undefined}>
        {/* The day's words, at the text's left edge, level with the page button. */}
        {journal && !tools && <span className="day-words">{wordsLine(words)}</span>}
        {tools ? (
          <ToolsBar page={page + 1} count={count} words={words} onClose={onCloseTools} onTextSettings={onTextSettings} onExport={onExport} />
        ) : (
          <button
            ref={pageButtonRef}
            type="button"
            className="page-button surface"
            aria-label={`Page ${page + 1} of ${count}. Open tools`}
            onClick={onOpenTools}
          >
            <Icon name="asterisk" />
          </button>
        )}
      </div>
    </>
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
