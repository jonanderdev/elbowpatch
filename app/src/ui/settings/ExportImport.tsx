import { type ReactElement, useEffect, useRef, useState } from 'react'
import { unzip } from '../../adapters/zip'
import { guessKind, importArchive, importMarkdown } from '../../domain/archive'
import type { Kind } from '../../domain/model'
import type { Deps } from '../../domain/pieces'
import { longDate, number, size } from '../../domain/words'
import { downloadEverything, lastExport } from '../files/everything'
import { KIND_WORD, Row } from './parts'

interface Props {
  deps: Deps
  /** Save the open page first, so an export holds its last words. */
  beforeExport(): Promise<void>
  onChanged(): Promise<void>
}

export function ExportImport({ deps, beforeExport, onChanged }: Props): ReactElement {
  const [used, setUsed] = useState<number | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [loose, setLoose] = useState<{ name: string; text: string; kind: Kind; guess: Kind }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => setUsed(e.usage ?? null))
      .catch(() => {})
  }, [])

  const last = lastExport()
  const exportLine =
    exportStatus ??
    capital([used !== null ? size(used) : null, last ? `last exported ${longDate(last, Date.now())}` : 'never exported yet'].filter(Boolean).join(' · '))

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
  const sheetOpen = loose !== null
  useEffect(() => {
    if (!sheetOpen) return
    ;(sheet.current?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus()
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLoose(null)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [sheetOpen])

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
      <input ref={picker} type="file" accept=".zip,.md,.markdown,.txt" multiple hidden onChange={(e) => void chosen((e.target as HTMLInputElement).files)} />
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
              <span className="import-meta">
                {f.name}
                {headingsNote(f.text)}
              </span>
              <div className="segments" role="radiogroup" aria-label={`Kind of ${titleOf(f)}`}>
                {(['book', 'journal', 'essay'] as const)
                  // Journal only when the headings are dates.
                  .filter((k) => k !== 'journal' || f.guess === 'journal')
                  .map((k) => (
                    // biome-ignore lint/a11y/useSemanticElements: a segmented control: buttons with radio semantics, in one bar.
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
