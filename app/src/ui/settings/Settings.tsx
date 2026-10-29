import { useEffect, useRef, useState } from 'react'
import { unzip } from '../../adapters/zip'
import { guessKind, importArchive, importMarkdown } from '../../domain/archive'
import { downloadEverything, lastExport } from '../files/everything'
import { WordButton } from '../components/WordButton'
import type { Kind, Piece } from '../../domain/model'
import { restore, type Deps } from '../../domain/pieces'
import { longDate, number, size } from '../../domain/words'

// Settings (DESIGN.md, Settings): opened from the library only. The areas
// here are the ones that work today, Export & import and Put away.
// shortcut: Writing, Appearance, Time Machine, Backup & sync and About & privacy arrive as they are built.

export type Area = 'list' | 'export' | 'put-away'

const DAY = 86_400_000
const KIND_WORD: Record<Kind, string> = { book: 'Book', journal: 'Journal', essay: 'Essay' }

interface Props {
  deps: Deps
  area: Area
  /** Every piece, put-away ones included. */
  pieces: Piece[]
  go(to: string): void
  /** Save the open page first, so an export holds its last words. */
  beforeExport(): Promise<void>
  onChanged(): Promise<void>
}

export function Settings(props: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [props.area])
  const title = props.area === 'export' ? 'Export & import' : props.area === 'put-away' ? 'Put away' : 'Settings'
  return (
    <div className="settings" role="main">
      <div className="settings-head">
        <WordButton word={props.area === 'list' ? 'Library' : 'Settings'} onClick={() => props.go(props.area === 'list' ? '/' : '/settings')} />
      </div>
      <div className="settings-inner">
        <h1 ref={heading} tabIndex={-1} className="settings-title">
          {title}
        </h1>
        {props.area === 'list' && <List {...props} />}
        {props.area === 'export' && <ExportImport {...props} />}
        {props.area === 'put-away' && <PutAway {...props} />}
      </div>
    </div>
  )
}

function List({ pieces, go }: Props) {
  const away = waiting(pieces)
  const last = lastExport()
  return (
    <ul className="rows">
      <li>
        <button type="button" className="row" onClick={() => go('/settings/export')}>
          <span className="row-title">Export &amp; import</span>
          <span className="row-meta">{last ? `Last exported ${longDate(last, Date.now())}` : 'Never exported yet'}</span>
        </button>
      </li>
      <li>
        <button type="button" className="row" onClick={() => go('/settings/put-away')}>
          <span className="row-title">Put away</span>
          <span className="row-meta">
            {away.length === 0 ? 'Nothing put away' : `${number(away.length)} ${away.length === 1 ? 'piece' : 'pieces'} · the next goes ${goesIn(away[0]!)}`}
          </span>
        </button>
      </li>
    </ul>
  )
}

/** One row like a place in Backup & sync: a name, its word at the right, a status line. */
function Row(props: { name: string; action: string; status: string; onAction(): void; busy?: boolean; announce?: boolean }) {
  return (
    <div className="area-row">
      <div className="area-top">
        <span className="area-name">{props.name}</span>
        <button type="button" className="area-action" aria-label={`${props.action} ${props.name}`} onClick={props.onAction} disabled={props.busy}>
          {props.action}
        </button>
      </div>
      {/* Only a result is announced, not what is already there. */}
      <p className="area-status" role={props.announce ? 'status' : undefined}>
        {props.status}
      </p>
    </div>
  )
}

function ExportImport({ deps, beforeExport, onChanged }: Props) {
  const [used, setUsed] = useState<number | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [loose, setLoose] = useState<{ name: string; text: string; kind: Kind; guess: Kind }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsed(e.usage ?? null)).catch(() => {})
  }, [])

  const last = lastExport()
  const exportLine = exportStatus ?? capital([used !== null ? size(used) : null, last ? `last exported ${longDate(last, Date.now())}` : 'never exported yet'].filter(Boolean).join(' · '))

  const exportEverything = async () => {
    setBusy(true)
    try {
      await exportNow()
    } catch {
      setExportStatus("Couldn't export just now. Nothing has changed; try again.")
    } finally {
      setBusy(false)
    }
  }
  const exportNow = async () => {
    await beforeExport()
    setExportStatus(`Everything is in ${await downloadEverything(deps)}.`)
  }

  const chosen = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    let added = 0
    let here = 0
    const refused: string[] = []
    const md: { name: string; text: string; kind: Kind; guess: Kind }[] = []
    try {
      for (const file of [...files]) {
        try {
          const bytes = await file.arrayBuffer()
          // A zip by its first bytes, not its name: a renamed export is still an export.
          if (isZip(bytes)) {
            // Our own export comes in as it was, kinds and history included, with no question.
            const result = await importArchive(deps, await unzip(bytes))
            if (result.ok) {
              added += result.added
              here += result.alreadyHere
            } else refused.push(refusal(result.reason, file.name))
          } else {
            const text = new TextDecoder().decode(bytes)
            const guess = guessKind(text)
            md.push({ name: file.name, text, kind: guess, guess })
          }
        } catch {
          refused.push(`${file.name} could not be read. Nothing from it was added.`)
        }
      }
      if (md.length) setLoose(md)
      const said = added || here || !refused.length ? [result(added, here)] : []
      setImportStatus([...said, ...refused].join(' '))
    } finally {
      // Whatever came in shows in the library, even when another file was refused.
      if (added) await onChanged()
      setBusy(false)
      if (picker.current) picker.current.value = ''
    }
  }

  const importLoose = async () => {
    if (!loose) return
    setBusy(true)
    let n = 0
    try {
      for (const f of loose) {
        await importMarkdown(deps, f.name, f.text, f.kind, navigator.language || 'en')
        n++
      }
      setImportStatus((s) => [s && !s.startsWith('0 pieces') ? s : null, result(n, 0)].filter(Boolean).join(' '))
      setLoose(null)
    } catch {
      setImportStatus(`${result(n, 0)} The rest could not be added.`)
    } finally {
      if (n) await onChanged()
      setBusy(false)
    }
  }
  const sheet = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!loose) return
    ;(sheet.current?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setLoose(null)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [!!loose])

  return (
    <>
      <p className="settings-lead">Everything you have written, as plain .md files any app can open, with every moment kept and the pieces put away.</p>
      <div className="area-rows">
        <Row name="Everything" action="Export" status={exportLine} onAction={() => void exportEverything()} busy={busy} announce={!!exportStatus} />
        <Row
          name="Files"
          action="Import"
          status={importStatus ?? 'An Elbowpatch export, or loose .md files. Nothing here is ever replaced.'}
          onAction={() => picker.current?.click()}
          busy={busy}
          announce={!!importStatus}
        />
      </div>
      <input
        ref={picker}
        type="file"
        accept=".zip,.md,.markdown,.txt"
        multiple
        hidden
        onChange={(e) => void chosen((e.target as HTMLInputElement).files)}
      />
      <p className="settings-note">To export one piece, use the export button on its page, or press and hold it in the library.</p>
      {loose && (
        <div ref={sheet} className="sheet surface import-sheet" role="dialog" aria-modal="true" aria-label="Import">
          <div className="sheet-title">
            <span>Import</span>
            <span className="sheet-aside">
              {loose.length} {loose.length === 1 ? 'file' : 'files'}
            </span>
          </div>
          {loose.map((f, i) => (
            <div className="import-file" key={f.name + i}>
              <span className="import-name">{titleOf(f)}</span>
              <span className="import-meta">{f.name}{headingsNote(f.text)}</span>
              <div className="segments" role="radiogroup" aria-label={`Kind of ${titleOf(f)}`}>
                {(['book', 'journal', 'essay'] as const)
                  // Journal only when the headings are dates.
                  .filter((k) => k !== 'journal' || f.guess === 'journal')
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={f.kind === k}
                      tabIndex={f.kind === k ? 0 : -1}
                      className="segment"
                      onClick={() => setLoose(loose.map((x, j) => (j === i ? { ...x, kind: k } : x)))}
                      onKeyDown={(e) => {
                        const kinds = (['book', 'journal', 'essay'] as const).filter((x) => x !== 'journal' || f.guess === 'journal')
                        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
                        if (!step) return
                        e.preventDefault()
                        const next = kinds[(kinds.indexOf(f.kind) + step + kinds.length) % kinds.length]!
                        const group = (e.currentTarget as HTMLElement).parentElement
                        setLoose(loose.map((x, j) => (j === i ? { ...x, kind: next } : x)))
                        requestAnimationFrame(() => (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus())
                      }}
                    >
                      {KIND_WORD[k]}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div className="sheet-foot import-foot">
            <button type="button" className="text-link" onClick={() => setLoose(null)}>
              Cancel
            </button>
            <button type="button" className="text-link strong" onClick={() => void importLoose()} disabled={busy}>
              Import
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function PutAway({ deps, pieces, onChanged }: Props) {
  const [line, setLine] = useState<string | null>(null)
  useEffect(() => {
    if (!line) return
    const t = setTimeout(() => setLine(null), 4000)
    return () => clearTimeout(t)
  }, [line])
  const away = waiting(pieces)
  return (
    <>
      <p className="settings-lead">
        Pieces you put away wait here for 30 days, then go for good. Bringing one back returns it to the library as it was, with all its moments.
      </p>
      {away.length === 0 ? (
        <p className="settings-lead quiet">Nothing is put away.</p>
      ) : (
        <div className="area-rows">
          {away.map((p) => (
            <Row
              key={p.id}
              name={p.title.trim() || 'Untitled'}
              action="Bring back"
              status={`${KIND_WORD[p.kind]} · put away ${longDate(p.putAwayAt!, Date.now())} · ${left(p)}`}
              onAction={async () => {
                await restore(deps, p.id)
                await onChanged()
                setLine('Brought back to the library.')
              }}
            />
          ))}
        </div>
      )}
      <p className="settings-note">Every full export includes what is put away, so a copy outlives the 30 days.</p>
      {line && (
        <div className="library-lines">
          <div className="line surface" role="status">
            {line}
          </div>
        </div>
      )}
    </>
  )
}

/** Put-away pieces, the one going soonest first. */
function waiting(pieces: Piece[]): Piece[] {
  return pieces.filter((p) => p.putAwayAt !== undefined).sort((a, b) => a.putAwayAt! - b.putAwayAt!)
}

function daysLeft(p: Piece): number {
  return Math.max(0, Math.ceil((p.putAwayAt! + 30 * DAY - Date.now()) / DAY))
}

/** "25 days left", and in its last week "goes in 4 days". */
function left(p: Piece): string {
  const n = daysLeft(p)
  if (n > 7) return `${n} days left`
  return `goes ${goesIn(p)}`
}

function goesIn(p: Piece): string {
  const n = daysLeft(p)
  return n <= 1 ? 'in a day' : `in ${n} days`
}

function refusal(reason: 'newer-format' | 'not-an-export' | 'incomplete', name: string): string {
  if (reason === 'newer-format') return 'This export is from a newer Elbowpatch. Update the app and try again. Nothing was added.'
  if (reason === 'incomplete') return `${name} is missing some of its files. Nothing from it was added.`
  return `${name} is not an Elbowpatch export. Nothing from it was added.`
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function result(added: number, here: number): string {
  const a = `${number(added)} ${added === 1 ? 'piece' : 'pieces'} added.`
  return here ? `${a} ${number(here)} ${here === 1 ? 'was' : 'were'} already here.` : a
}

function titleOf(f: { name: string; text: string }): string {
  const first = f.text.split('\n').find((l) => l.trim())
  if (first?.startsWith('# ') && guessKind(f.text) === 'essay') return first.slice(2).trim()
  return f.name.replace(/\.(md|markdown|txt)$/i, '')
}

function headingsNote(text: string): string {
  const n = text.split('\n').filter((l) => l.startsWith('# ')).length
  if (n < 2) return ''
  return guessKind(text) === 'journal' ? ` · ${number(n)} dated headings` : ` · ${number(n)} headings`
}

function isZip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
}


