import { type ReactElement, useEffect, useRef } from 'react'

// shortcut: Markdown only. The PDF row waits for the print stylesheet, which DESIGN.md (Gaps) says to try in Safari and Chrome first.
export function ExportSheet(props: { title: string; onMarkdown(): void; onDone(): void }): ReactElement {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  return (
    <div className="sheet surface" role="dialog" aria-label="Export">
      <div className="sheet-title">
        <span>Export</span>
        <span className="sheet-aside">{props.title}</span>
      </div>
      <button ref={first} type="button" className="sheet-row" onClick={props.onMarkdown}>
        <span className="sheet-row-name">Markdown</span>
        <span className="sheet-row-note">One .md file, plain text any app can open.</span>
      </button>
      <div className="sheet-foot">
        <button type="button" className="text-link" onClick={props.onDone}>
          Done
        </button>
      </div>
    </div>
  )
}
