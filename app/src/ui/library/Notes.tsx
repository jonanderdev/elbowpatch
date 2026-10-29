import { useState } from 'react'
import { type Piece } from '../../domain/model'
import { number, words } from '../../domain/words'
import { update } from '../stores/settings'
import { download } from '../files/download'
import { lastExport } from '../files/everything'
import { unsaved, useUnsaved } from '../stores/unsaved'
import { useUpdateWaiting } from '../stores/updates'

/** Words a closed page could not store (0010): said here too, since the page that said it is gone. */
export function UnsavedLine() {
  const waiting = useUnsaved()
  if (waiting.length === 0) return null
  return (
    <div className="line surface" role="alert">
      Can't save right now. Your words are still here.
      <button
        type="button"
        onClick={() =>
          waiting.forEach((u) => {
            download(u.name, u.markdown)
            // A copy is in the writer's hands: it no longer waits here.
            unsaved.saved(u.sectionId)
          })
        }
      >
        Save a copy
      </button>
    </div>
  )
}

/** Only in the library, never on the page: restarting here cannot cut off a sentence (0010). */
export function UpdateLine() {
  const restart = useUpdateWaiting()
  if (!restart) return null
  return (
    <div className="line surface" role="status">
      A new version is ready ·
      <button type="button" onClick={restart}>
        Restart
      </button>
    </div>
  )
}

export function SafariNote({ atFoot }: { atFoot?: boolean }) {
  if (!safariOutsideHomeScreen()) return null
  return (
    <div className={atFoot ? 'first-run at-foot' : 'first-run'}>
      <p>Safari clears this after 7 days away. Add Elbowpatch to your Home Screen.</p>
      <div className="links">
        <button type="button" className="text-link" onClick={() => update({ firstRunDone: true })}>
          Not now
        </button>
      </div>
    </div>
  )
}

/** A place to keep a copy can be connected (Settings › Backup & sync). Sync comes after dogfooding. */
const CAN_CONNECT = false

/**
 * A quiet reminder at the library's foot, only after 30 days without a copy:
 * "Last exported 5 weeks ago · Export", and "Connect a place" once there is
 * one to connect (DESIGN.md, The library).
 */
export function ExportReminder({ pieces, onExport, onDone }: { pieces: Piece[]; onExport(): Promise<string>; onDone(line: string): void }) {
  const [busy, setBusy] = useState(false)
  const [, refresh] = useState(0)
  const now = Date.now()
  const last = lastExport()
  const oldest = Math.min(...pieces.map((p) => p.createdAt))
  const since = last ?? oldest
  if (pieces.length === 0 || now - since < 30 * DAY) return null
  return (
    <div className="export-reminder">
      <span>{last ? `Last exported ${ago(now - last)}` : 'Not exported yet'}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="text-link strong"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            onDone(`Everything is in ${await onExport()}.`)
          } catch {
            onDone("Couldn't export just now. Nothing has changed; try again.")
          } finally {
            setBusy(false)
            refresh((n) => n + 1)
          }
        }}
      >
        Export
      </button>
      {CAN_CONNECT && (
        <>
          <span aria-hidden="true">·</span>
          <a className="text-link strong" href="#/settings/sync">
            Connect a place
          </a>
        </>
      )}
    </div>
  )
}


const DAY = 86_400_000

/** "12 days ago", "5 weeks ago", "3 months ago". */
function ago(ms: number): string {
  const days = Math.floor(ms / DAY)
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  const months = Math.floor(days / 30)
  return months < 24 ? `${months} months ago` : `${Math.floor(days / 365)} years ago`
}

function safariOutsideHomeScreen(): boolean {
  const ua = navigator.userAgent
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(ua)
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return safari && !standalone
}

