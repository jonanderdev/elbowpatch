import { type CSSProperties, type ReactElement, useEffect, useRef, useState } from 'react'
import { PdfLoadError } from '../../domain/export'
import { PDF_LINES } from '../files/exportCopy'

/** What a piece's PDF row says before it is tapped, and how to make the file. */
export interface PdfRow {
  note: string
  /** Makes the file and hands it over. Rejects when it cannot be made; the sheet says so. */
  make(): Promise<void>
}

type State = 'ready' | 'working' | 'offline' | 'failed'

export function ExportSheet(props: { title: string; pdf: PdfRow; onMarkdown(): void; onDone(): void; style?: CSSProperties }): ReactElement {
  const first = useRef<HTMLButtonElement>(null)
  const [state, setState] = useState<State>('ready')
  useEffect(() => first.current?.focus(), [])

  const pdfLine: Record<State, string> = { ready: props.pdf.note, working: PDF_LINES.working, offline: PDF_LINES.offline, failed: PDF_LINES.failed }

  // While the file is made, a second tap does nothing.
  async function makePdf(): Promise<void> {
    if (state === 'working') return
    setState('working')
    try {
      await props.pdf.make()
    } catch (error) {
      // Offline is said only when the PDF's code or a font could not be fetched; any other failure is a failure.
      setState(error instanceof PdfLoadError && navigator.onLine === false ? 'offline' : 'failed')
    }
  }

  return (
    <div className="sheet surface" role="dialog" aria-label="Export" style={props.style}>
      <div className="sheet-title">
        <span>Export</span>
        <span className="sheet-aside">{props.title}</span>
      </div>
      <div className="sheet-options">
        <button ref={first} type="button" className="sheet-row" onClick={() => state !== 'working' && props.onMarkdown()}>
          <span className="sheet-row-name">Markdown</span>
          <span className="sheet-row-note">One .md file, plain text any app can open.</span>
        </button>
        <button type="button" className="sheet-row" aria-busy={state === 'working'} onClick={() => void makePdf()}>
          <span className="sheet-row-name">PDF</span>
          <span className="sheet-row-note" role="status">
            {pdfLine[state]}
          </span>
        </button>
      </div>
      <div className="sheet-foot">
        <button type="button" className="text-link" onClick={props.onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
