import type { ReactElement, RefObject } from 'react'
import { pageLine, words as wordsLine } from '../../domain/words'
import { Icon } from '../components/Icon'
import { ToolsBar } from './Tools'

interface PageFootProps {
  /** The page shown, from 1, and the pages; in a book, the book's, each once it is known. */
  page?: number
  count?: number
  words: number
  /** The day on the page, in a journal: its count goes by it. */
  day?: string
  journal: boolean
  /** A book's or a journal's title page, which carries no folio. */
  titlePage: boolean
  tools: boolean
  /** The phone keyboard is up: the foot stands on it, at the screen's foot (see Page). */
  keyboard: boolean
  pageButtonRef: RefObject<HTMLButtonElement | null>
  onOpenTools(): void
  onCloseTools(): void
  onTextSettings(): void
  onExport(): void
  onTimeMachine(): void
  /** A book's count opens Contents, and a journal's Days. */
  onContents?(from: HTMLElement): void
  contentsOpen: boolean
}

/**
 * The foot of the page: the folio, and on a phone the page button, which opens into the tools bar
 * (DESIGN.md, Control). The folio stands aside while the tools bar or the keyboard says the page.
 */
export function PageFoot({
  page,
  count,
  words,
  day,
  journal,
  titlePage,
  tools,
  keyboard,
  pageButtonRef,
  onOpenTools,
  onCloseTools,
  onTextSettings,
  onExport,
  onTimeMachine,
  onContents,
  contentsOpen,
}: PageFootProps): ReactElement {
  const folio = page !== undefined && !journal && !titlePage && !tools && !keyboard
  const said = pageLine(page, count)
  return (
    <>
      {folio && (
        <div className="folio" aria-hidden="true">
          {page}
        </div>
      )}
      <div className={keyboard ? 'foot raised' : 'foot'}>
        {/* The day's words, at the text's left edge, level with the page button; down with the folio
            while the keyboard is up, so they never sit over the text. */}
        {journal && !tools && !keyboard && <span className="day-words">{wordsLine(words)}</span>}
        {tools ? (
          <ToolsBar
            page={page}
            count={count}
            words={words}
            {...(day ? { day } : {})}
            onContents={onContents}
            contentsOpen={contentsOpen}
            onClose={onCloseTools}
            onTextSettings={onTextSettings}
            onExport={onExport}
            onTimeMachine={onTimeMachine}
          />
        ) : (
          <button
            ref={pageButtonRef}
            type="button"
            className="page-button surface"
            aria-label={said ? `${said}. Open tools` : 'Open tools'}
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
