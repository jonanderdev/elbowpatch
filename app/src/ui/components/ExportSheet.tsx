import { type CSSProperties, type ReactElement, useEffect, useRef, useState } from 'react'

/** What a piece's PDF row says before it is tapped, and how to make the file. Left out where a kind has no PDF yet. */
export interface PdfRow {
  note: string
  /** Makes the file and hands it over. Rejects when it cannot be made; the sheet says so. */
  make(): Promise<void>
}

const WORKING = 'Setting your pages…'
const FAILED = 'Couldn’t make the PDF just now. Nothing has changed; try again.'

export function ExportSheet(props: { title: string; pdf?: PdfRow; onMarkdown(): void; onDone(): void; style?: CSSProperties }): ReactElement {
  const first = useRef<HTMLButtonElement>(null)
  const [state, setState] = useState<'ready' | 'working' | 'failed'>('ready')
  useEffect(() => first.current?.focus(), [])

  // While the file is made, a second tap does nothing.
  async function makePdf(): Promise<void> {
    if (state === 'working' || !props.pdf) return
    setState('working')
    try {
      await props.pdf.make()
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="sheet surface" role="dialog" aria-label="Export" style={props.style}>
      <div className="sheet-title">
        <span>Export</span>
        <span className="sheet-aside">{props.title}</span>
      </div>
      <button ref={first} type="button" className="sheet-row" onClick={() => state !== 'working' && props.onMarkdown()}>
        <span className="sheet-row-name">Markdown</span>
        <span className="sheet-row-note">One .md file, plain text any app can open.</span>
      </button>
      {props.pdf && (
        <button type="button" className="sheet-row" aria-busy={state === 'working'} onClick={() => void makePdf()}>
          <span className="sheet-row-name">PDF</span>
          <span className="sheet-row-note" role="status">
            {state === 'working' ? WORKING : state === 'failed' ? FAILED : props.pdf.note}
          </span>
        </button>
      )}
      <div className="sheet-foot">
        <button type="button" className="text-link" onClick={props.onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
