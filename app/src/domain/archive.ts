import { pieceAsMarkdown } from './export'
import type { Kind, Outline, Piece, Version, Working } from './model'
import type { Deps, OpenSection } from './pieces'
import { dayTitle } from './words'

// The full export and import (docs/decisions/0007). Everything leaves as plain
// files: readable `.md` that need no app at all, the kept history as `.md`
// too, and one small index.json that ties the versions together. Import reads
// it back and never overwrites.

export const FORMAT_VERSION = 1

export interface ArchiveFile {
  path: string
  text: string
}

interface Index {
  formatVersion: number
  exportedAt: number
  pieces: Piece[]
  outlines: Outline[]
  versions: (Omit<Version, 'content'> & { file: string })[]
  working: (Omit<Working, 'content'> & { file: string })[]
}

/** Every piece, put-away ones in their own folder, with all the history kept locally. */
export async function exportAll(deps: Pick<Deps, 'store' | 'clock'>): Promise<ArchiveFile[]> {
  const files: ArchiveFile[] = []
  const index: Index = { formatVersion: FORMAT_VERSION, exportedAt: deps.clock.now(), pieces: [], outlines: [], versions: [], working: [] }
  const used = new Set<string>()

  await deps.store.transaction(async (tx) => {
    for (const piece of await tx.pieces()) {
      index.pieces.push(piece)
      const folder = unique(`${piece.putAwayAt !== undefined ? 'Put away/' : ''}${safe(piece.title) || 'Untitled'}`, used)
      const outlines = await tx.outlinesOf(piece.id)
      index.outlines.push(...outlines)

      const sectionIds = [...new Set([...piece.sections.map((s) => s.sectionId), ...outlines.flatMap((o) => o.sections.map((s) => s.sectionId))])]
      const current: OpenSection[] = []
      for (const [i, sectionId] of sectionIds.entries()) {
        const title = piece.sections.find((s) => s.sectionId === sectionId)?.title ?? lastTitle(outlines, sectionId)
        const name = `${String(i + 1).padStart(2, '0')} ${sectionName(piece.kind, title) || 'Untitled'}`
        const working = await tx.working(sectionId)
        const versions = (await tx.versionsOf(sectionId)).sort((a, b) => a.seq - b.seq)
        const text = working?.content ?? versions.at(-1)?.content ?? ''
        if (piece.sections.some((s) => s.sectionId === sectionId)) {
          current.push({ sectionId, title, content: text })
          // A section's file reads well anywhere: a chapter opens with its title (0005).
          const head = piece.kind === 'essay' ? '' : `# ${sectionName(piece.kind, title, true) || 'Untitled'}\n\n`
          if (piece.kind !== 'essay') files.push({ path: `${folder}/${name}.md`, text: head + text + '\n' })
        }
        if (working) {
          const file = `${folder}/history/${name}/working.md`
          files.push({ path: file, text: working.content })
          const { content: _, ...rest } = working
          index.working.push({ ...rest, file })
        }
        for (const v of versions) {
          const file = `${folder}/history/${name}/${String(v.seq).padStart(5, '0')} ${stamp(v.createdAt)}.md`
          files.push({ path: file, text: v.content })
          const { content: _, ...rest } = v
          index.versions.push({ ...rest, file })
        }
      }
      // The whole piece as one file, the same as exporting it alone.
      const whole = pieceAsMarkdown(piece, current)
      files.push({ path: `${folder}/${whole.name}`, text: whole.text })
    }
  })
  files.push({ path: 'index.json', text: JSON.stringify(index, null, 1) })
  return files
}

export type ImportResult =
  | { ok: true; added: number; alreadyHere: number }
  | { ok: false; reason: 'newer-format' | 'not-an-export' | 'incomplete' }

/**
 * Our own export comes back as it was, history included. Never overwrites:
 * a piece already here and identical is skipped; one that differs comes in as
 * a new piece, with new ids, once (importing the same zip again adds nothing).
 * Everything is checked before anything is written: a newer format, or a file
 * the index names that is missing, refuses the whole import.
 */
export async function importArchive(deps: Deps, files: ArchiveFile[]): Promise<ImportResult> {
  const indexFile = files.find((f) => f.path === 'index.json' || f.path.endsWith('/index.json'))
  if (!indexFile) return { ok: false, reason: 'not-an-export' }
  let index: Index
  try {
    index = JSON.parse(indexFile.text)
  } catch {
    return { ok: false, reason: 'not-an-export' }
  }
  if (typeof index?.formatVersion !== 'number') return { ok: false, reason: 'not-an-export' }
  // A newer format is refused whole, never half-imported.
  if (index.formatVersion > FORMAT_VERSION) return { ok: false, reason: 'newer-format' }
  if (![index.pieces, index.outlines, index.versions, index.working].every(Array.isArray)) return { ok: false, reason: 'not-an-export' }

  // Unzipping and zipping again can change how accented names are spelt (NFC/NFD): compare them alike.
  const key = (path: string) => path.normalize('NFC')
  const root = key(indexFile.path).slice(0, -'index.json'.length)
  const text = new Map(files.map((f) => [key(f.path).slice(root.length), f.text]))
  const named = [...index.versions, ...index.working].map((x) => key(x.file))
  // A missing file would come in as empty text, without a word: refuse instead.
  if (named.some((f) => !text.has(f))) return { ok: false, reason: 'incomplete' }

  let added = 0
  let alreadyHere = 0
  const now = deps.clock.now()
  for (const incoming of index.pieces) {
    const outlines = index.outlines.filter((o) => o.pieceId === incoming.id)
    const versions = index.versions.filter((v) => v.pieceId === incoming.id).map((v) => ({ ...v, content: text.get(key(v.file))! }))
    const working = index.working.filter((w) => w.pieceId === incoming.id).map((w) => ({ ...w, content: text.get(key(w.file))! }))
    const print = fingerprint(incoming, versions, working)
    const result = await deps.store.transaction(async (tx) => {
      const here = await tx.piece(incoming.id)
      let ids = (id: string) => id
      if (here) {
        if (await identical(tx, incoming, outlines, versions, working)) return 'skipped'
        // A copy of this very export was added before.
        if ((await tx.pieces()).some((p) => p.copyOf === print)) return 'skipped'
        // Different: a new piece beside the one here, with every id new.
        const map = new Map<string, string>()
        ids = (id: string) => map.get(id) ?? (map.set(id, deps.ids.next()), map.get(id)!)
      }
      await tx.putPiece({
        ...incoming,
        id: ids(incoming.id),
        outlineId: incoming.outlineId && ids(incoming.outlineId),
        sections: incoming.sections.map((s) => ({ ...s, sectionId: ids(s.sectionId) })),
        place: incoming.place && { ...incoming.place, sectionId: ids(incoming.place.sectionId) },
        words: incoming.words && Object.fromEntries(Object.entries(incoming.words).map(([k, n]) => [ids(k), n])),
        // Put away when it was exported: it waits a fresh 30 days, rather than arriving already due to go.
        ...(incoming.putAwayAt !== undefined ? { putAwayAt: now } : {}),
        ...(here ? { copyOf: print } : {}),
      })
      for (const o of outlines)
        await tx.putOutline({ ...o, id: ids(o.id), pieceId: ids(o.pieceId), parentId: o.parentId && ids(o.parentId), sections: o.sections.map((s) => ({ ...s, sectionId: ids(s.sectionId) })) })
      for (const { file: _, ...v } of versions)
        await tx.putVersion({ ...v, id: ids(v.id), pieceId: ids(v.pieceId), sectionId: ids(v.sectionId), parentId: v.parentId && ids(v.parentId) })
      for (const { file: _, ...w } of working)
        await tx.putWorking({ ...w, sectionId: ids(w.sectionId), pieceId: ids(w.pieceId), baseVersionId: w.baseVersionId && ids(w.baseVersionId) })
      return 'added'
    })
    if (result === 'added') added++
    else alreadyHere++
  }
  return { ok: true, added, alreadyHere }
}

/** Here already, word for word: the same texts, the same title, chapters and order, and every outline. */
async function identical(
  tx: Parameters<Parameters<Deps['store']['transaction']>[0]>[0],
  incoming: Piece,
  outlines: Outline[],
  versions: Version[],
  working: Working[],
): Promise<boolean> {
  const here = await tx.piece(incoming.id)
  if (!here || here.title !== incoming.title) return false
  const sections = (p: Piece) => p.sections.map((s) => `${s.sectionId}\u0000${s.title}`).join('\u0001')
  if (sections(here) !== sections(incoming)) return false
  for (const o of outlines) if (!(await tx.outline(o.id))) return false
  for (const v of versions) if ((await tx.version(v.id))?.content !== v.content) return false
  for (const w of working) if ((await tx.working(w.sectionId))?.content !== w.content) return false
  return true
}

/** What a piece in an export is, compactly: so the same export imported twice adds one copy, not two. */
function fingerprint(piece: Piece, versions: Version[], working: Working[]): string {
  const all = [piece.id, piece.title, ...piece.sections.map((s) => s.title), ...versions.map((v) => v.id).sort(), ...working.map((w) => w.content)].join('\u0000')
  let h = 0x811c9dc5
  for (let i = 0; i < all.length; i++) h = Math.imul(h ^ all.charCodeAt(i), 0x01000193)
  return `${piece.id}:${(h >>> 0).toString(36)}`
}

/**
 * The kind a loose .md file probably is (DESIGN.md, Export & import): two or
 * more `# ` headings a book; headings that all read as dates a journal;
 * anything else an essay.
 */
export function guessKind(markdown: string): Kind {
  const headings = markdown.split('\n').filter((l) => l.startsWith('# ')).map((l) => l.slice(2).trim())
  if (headings.length > 0 && headings.every((h) => readDay(h))) return 'journal'
  return headings.length >= 2 ? 'book' : 'essay'
}

/** "Monday 26 October 2026" (or without the weekday) to "2026-10-26". */
export function readDay(heading: string): string | undefined {
  const m = heading.match(/^(?:[A-Za-z]+,? )?(\d{1,2}) ([A-Za-z]+),? (\d{4})$/)
  if (!m) return undefined
  const month = MONTHS.indexOf(m[2]!.toLowerCase()) + 1
  if (month === 0) return undefined
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** A loose .md file as a new piece of the chosen kind; always new, never merged into one here (0007). */
export async function importMarkdown(deps: Deps, fileName: string, markdown: string, kind: Kind, lang: string): Promise<Piece> {
  const now = deps.clock.now()
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let title = fileName.replace(/\.(md|markdown|txt)$/i, '')
  const parts: { title: string; lines: string[] }[] = []

  if (kind === 'essay') {
    // An essay keeps its text whole; an opening `# ` line is its title.
    const first = lines.findIndex((l) => l.trim() !== '')
    if (first >= 0 && lines[first]!.startsWith('# ')) title = lines.splice(first, 1)[0]!.slice(2).trim()
    parts.push({ title: '', lines })
  } else {
    // A book or a journal: each `# ` starts a chapter or a day; text before the first is a section of its own.
    for (const line of lines) {
      if (line.startsWith('# ')) parts.push({ title: line.slice(2).trim(), lines: [] })
      else if (parts.length === 0) parts.push({ title: '', lines: [line] })
      else parts.at(-1)!.lines.push(line)
    }
  }

  const trim = (ls: string[]) => ls.join('\n').replace(/^\n+|\n+$/g, '')
  const sections = parts
    .filter((p) => p.title !== '' || trim(p.lines) !== '' || kind === 'essay')
    .map((p) => ({ sectionId: deps.ids.next(), title: kind === 'journal' ? (readDay(p.title) ?? p.title) : p.title, content: trim(p.lines) }))
  if (sections.length === 0) sections.push({ sectionId: deps.ids.next(), title: '', content: '' })

  const piece: Piece = {
    id: deps.ids.next(),
    kind,
    lang,
    createdAt: now,
    updatedAt: now,
    title: kind === 'journal' ? title || 'Journal' : title,
    sections: sections.map(({ sectionId, title }) => ({ sectionId, title })),
    outlineId: null,
  }
  await deps.store.transaction(async (tx) => {
    await tx.putPiece(piece)
    for (const s of sections) await tx.putWorking({ sectionId: s.sectionId, pieceId: piece.id, content: s.content, baseVersionId: null, updatedAt: now })
  })
  return piece
}

function sectionName(kind: Kind, title: string, withYear = false): string {
  return kind === 'journal' && /^\d{4}-\d{2}-\d{2}$/.test(title) ? dayTitle(title, withYear) : title.trim()
}

function lastTitle(outlines: Outline[], sectionId: string): string {
  const sorted = [...outlines].sort((a, b) => b.seq - a.seq)
  for (const o of sorted) {
    const s = o.sections.find((x) => x.sectionId === sectionId)
    if (s) return s.title
  }
  return ''
}

function safe(name: string): string {
  // No path parts: a title of ".." must not climb out of the export's folder.
  return name.replace(/[\\/:*?"<>|]/g, '').trim().replace(/^\.+/, '').trim()
}

/** Unique ignoring case: "Notes" and "notes" are one folder on most disks. */
function unique(name: string, used: Set<string>): string {
  let candidate = name
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`
  used.add(candidate.toLowerCase())
  return candidate
}

function stamp(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')
}
