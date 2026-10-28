import { useCallback, useEffect, useRef, useState } from 'react'
import type { Kind, Piece } from '../domain/model'
import { pieceAsMarkdown } from '../domain/export'
import { forgetPutAway, thin } from '../domain/thinning'
import { library, newPiece, openPiece, putAway, recover, rename, renameSection, restore, withDay, write, type Deps } from '../domain/pieces'
import type { Held, WriterLock } from '../domain/ports'
import { Library } from './Library'
import { download } from './download'
import { Page, type Opened } from './Page'
import { Settings } from './SettingsView'
import { unsaved } from './unsaved'

const LAST = 'elbowpatch.last'

/** URLs use the hash, so any static host works (0011): #/ is the library, #/p/<id> a piece. */
function useRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const on = () => setRoute(location.hash.slice(1) || '/')
    window.addEventListener('hashchange', on)
    // A change between the first read and now would otherwise be missed.
    on()
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((to: string) => {
    // Follow at once; hashchange arrives a tick later and finds nothing to do.
    setRoute(to)
    if (location.hash.slice(1) !== to) location.hash = to
  }, [])
  return [route, go]
}

export function App({ deps, lock }: { deps: Deps; lock: WriterLock }) {
  const [route, go] = useRoute()
  const [ready, setReady] = useState(false)
  const [pieces, setPieces] = useState<Piece[]>([])
  const [opened, setOpened] = useState<Opened | null>(null)
  const today = isoDay(new Date())

  const [everything, setEverything] = useState<Piece[]>([])
  const refresh = useCallback(async () => {
    setPieces(await library(deps))
    setEverything(await deps.store.transaction((tx) => tx.pieces()))
  }, [deps])

  const open = useCallback(
    async (pieceId: string): Promise<Opened | null> => {
      const found = await openPiece(deps, pieceId)
      // A put-away piece waits in Settings; a URL or the Back button does not open it.
      if (!found || found.piece.putAwayAt !== undefined) return null
      let piece = found.piece
      let sectionId: string
      if (piece.kind === 'journal') {
        // The journal opens on today.
        ;({ piece, sectionId } = withDay(deps, piece, isoDay(new Date())))
      } else {
        const placed = piece.place && piece.sections.some((s) => s.sectionId === piece.place!.sectionId)
        sectionId = placed ? piece.place!.sectionId : piece.sections[0]!.sectionId
      }
      const section = found.sections.find((s) => s.sectionId === sectionId)
      return { piece, sectionId, content: section?.content ?? '', updatedAt: section?.updatedAt }
    },
    [deps],
  )

  // Startup (0010): open the store and run its migrations, bring back text a
  // crash left, lay out the last piece behind the library, wait for the fonts,
  // then let the launch screen go.
  useEffect(() => {
    void (async () => {
      try {
        await recover(deps)
        await replayJournal(deps, lock)
      } catch {
        // Nothing to recover is not a reason to stop; a store that cannot open shows on the first save.
      }
      await refresh().catch(() => {})
      const wanted = route.startsWith('/p/') ? route.slice(3) : readLast()
      if (wanted) setOpened(await open(wanted).catch(() => null))
      await document.fonts.ready
      setReady(true)
      document.getElementById('launch')?.setAttribute('hidden', '')
      // Thinning and the end of put-away pieces' 30 days run afterwards, when idle (0010).
      const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 3000))
      idle(() => void forgetPutAway(deps).then(() => thin(deps)).catch(() => {}))
    })()
    // Once, at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Following the route: a piece opens, or the library comes back over the page.
  useEffect(() => {
    if (!ready) return
    if (route === '/' || route.startsWith('/settings')) {
      void refresh()
      return
    }
    const id = route.startsWith('/p/') ? route.slice(3) : ''
    if (opened?.piece.id === id) return
    void open(id).then((next) => {
      if (next) setOpened(next)
      else go('/')
    })
  }, [route, ready])

  useEffect(() => {
    if (opened) writeLast(opened.piece.id)
  }, [opened?.piece.id])

  // One window writes a piece (0010). The lock follows the piece, not the page,
  // so reopening the same piece never locks this window out.
  // Waiting for the lock, writing, or another window writes it.
  // Kept with the piece it is about, so a newly opened piece is never taken for one already held.
  const [writerOf, setWriterOf] = useState<{ pieceId?: string; state: 'waiting' | 'here' | 'elsewhere' }>({ state: 'waiting' })
  const held = useRef<Held | null>(null)
  const flushPage = useRef<(() => Promise<void>) | null>(null)
  const closing = useRef<Promise<void>>(Promise.resolve())
  const pieceId = opened?.piece.id
  const writer = writerOf.pieceId === pieceId ? writerOf.state : 'waiting'
  const setWriter = useCallback((state: 'waiting' | 'here' | 'elsewhere', id = pieceIdNow.current) => setWriterOf({ pieceId: id, state }), [])
  const pieceIdNow = useRef(pieceId)
  pieceIdNow.current = pieceId
  const onAsked = useCallback(async () => {
    await flushPage.current?.()
    setWriter('elsewhere')
  }, [])
  const follow = useCallback((h: Held) => {
    held.current = h
    setWriter('here')
    void h.lost.then(() => {
      if (held.current === h) {
        held.current = null
        setWriter('elsewhere')
      }
    })
  }, [])
  useEffect(() => {
    if (!pieceId) return
    let alive = true
    setWriter('waiting')
    void (async () => {
      let h = await lock.hold(pieceId, onAsked)
      // Back to a piece this window just left: its lock goes once the last save there settles.
      if (!h && alive) {
        await settled(closing.current)
        if (alive) h = await lock.hold(pieceId, onAsked)
      }
      if (!alive) return h?.release()
      if (h) follow(h)
      else setWriter('elsewhere')
    })()
    return () => {
      alive = false
      const h = held.current
      held.current = null
      // Let go after the closing page's last save, so no other window writes alongside it,
      // but never wait on a stuck save for long. (A timeout: the page's cleanup, which sets
      // `closing`, runs after this one.)
      setTimeout(() => void settled(closing.current).then(() => h?.release()), 0)
    }
  }, [pieceId])

  const writeHere = async () => {
    const id = pieceId
    if (!id) return
    const h = await lock.take(id, onAsked)
    // Moved on to another piece while waiting: this one is not needed now.
    if (pieceIdNow.current !== id) return h.release()
    // The other window has saved: start from what it left.
    const fresh = await open(id)
    follow(h)
    if (fresh) setOpened(fresh)
  }

  const startNew = (kind: Kind) => {
    let piece = newPiece(deps, kind, navigator.language || 'en')
    let sectionId = piece.sections[0]?.sectionId ?? ''
    if (kind === 'journal') ({ piece, sectionId } = withDay(deps, piece, today))
    setOpened({ piece, sectionId, content: '', fresh: true })
    go(`/p/${piece.id}`)
  }

  if (!ready) return null
  // shortcut: Save a copy here holds the unsaved section only, not the whole piece.
  const inSettings = route.startsWith('/settings')
  const inLibrary = (route === '/' || !opened) && !inSettings
  const last = pieces.find((p) => p.id === readLast() && p.place)

  return (
    <>
      {opened && (
        <Page
          key={`${opened.piece.id}:${opened.sectionId}`}
          deps={deps}
          opened={opened}
          writer={writer}
          onWriteHere={() => void writeHere()}
          flushRef={flushPage}
          closingRef={closing}
          covered={inLibrary || inSettings}
          onLibrary={async () => {
            // Save first, so the library already lists what was just written; never wait long for it.
            // The first save also opens the database; a stuck one never holds the writer on the page for long.
            await Promise.race([flushPage.current?.(), new Promise((r) => setTimeout(r, 1500))])
            await refresh().catch(() => {})
            go('/')
          }}
          onChange={(piece) => {
            askToPersist()
            setPieces((all) => {
              // A closing page may report a piece just put away: it leaves the library, not comes back.
              if (piece.putAwayAt !== undefined) return all.filter((p) => p.id !== piece.id)
              return all.some((p) => p.id === piece.id) ? all.map((p) => (p.id === piece.id ? piece : p)) : [piece, ...all]
            })
          }}
        />
      )}
      {inSettings && (
        <Settings
          deps={deps}
          area={route === '/settings/export' ? 'export' : route === '/settings/put-away' ? 'put-away' : 'list'}
          pieces={everything}
          go={go}
          beforeExport={async () => {
            await flushPage.current?.()
          }}
          onChanged={refresh}
        />
      )}
      {inLibrary && (
        <Library
          pieces={pieces}
          last={last}
          today={today}
          onNew={startNew}
          onRename={async (piece, title) => {
            await rename(deps, piece, title)
            await refresh()
            // The page behind holds the old title: open it again, or its next save would put it back.
            if (opened?.piece.id === piece.id) {
              await flushPage.current?.()
              const fresh = await open(piece.id)
              if (fresh) setOpened(fresh)
            }
          }}
          onSettings={() => go('/settings')}
          onPutAway={async (piece) => {
            if (opened?.piece.id === piece.id) await flushPage.current?.()
            await putAway(deps, piece.id)
            // The page behind was this piece: it goes with it; Continue moves on.
            // (Continue still points at it, so Undo brings it back as it was; it cannot be opened meanwhile.)
            if (opened?.piece.id === piece.id) setOpened(null)
            await refresh()
          }}
          onRestore={async (piece) => {
            await restore(deps, piece.id)
            await refresh()
          }}
          onExport={async (piece) => {
            if (opened?.piece.id === piece.id) await flushPage.current?.()
            const found = await openPiece(deps, piece.id)
            if (!found) return undefined
            const file = pieceAsMarkdown(found.piece, found.sections)
            download(file.name, file.text)
            return file.name
          }}
          onOpen={(piece) => {
            // The piece behind the library is already laid out: Continue is instant.
            if (opened?.piece.id === piece.id) go(`/p/${piece.id}`)
            else void open(piece.id).then((next) => {
              if (!next) return
              setOpened(next)
              go(`/p/${piece.id}`)
            })
          }}
        />
      )}
    </>
  )
}

export function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readLast(): string | undefined {
  try {
    return localStorage.getItem(LAST) || undefined
  } catch {
    return undefined
  }
}

function writeLast(id: string) {
  try {
    localStorage.setItem(LAST, id)
  } catch {}
}

/**
 * Asks the browser to keep this site's storage, once there is something to keep.
 * Not at launch: some browsers ask the writer, and a first visit is no time for it (0010).
 */
let asked = false
function askToPersist() {
  if (asked) return
  asked = true
  void navigator.storage?.persist?.().catch(() => {})
}

/**
 * Words the last session could not store before it closed (see Page, journal)
 * go into the database first, under the piece's lock (one writer, 0010). An
 * entry already stored is dropped. One older than its section's stored copy
 * was overtaken elsewhere: it is not applied, and waits for Save a copy.
 */
async function replayJournal(deps: Deps, lock: WriterLock) {
  for (const u of unsaved.all()) {
    const stored = await deps.store.transaction(async (tx) => ({ working: await tx.working(u.sectionId), piece: await tx.piece(u.pieceId) }))
    const sameText = stored.working?.content === u.markdown
    const sameTitle = u.title === null || titleIn(stored.piece, u.sectionId) === u.title
    if (sameText && sameTitle) {
      unsaved.saved(u.sectionId)
      continue
    }
    if (stored.working && stored.working.updatedAt > u.at) continue
    const held = await lock.hold(u.pieceId, async () => {})
    if (!held) continue // another window writes it now; the words wait for Save a copy
    try {
      // The journal's piece is only a draft: write() keeps what is stored and adds a section it lacks.
      await write(deps, u.piece, u.sectionId, u.markdown)
      // A title only if it changed here and nothing renamed the piece since.
      if (u.title !== null && (!stored.piece || stored.piece.updatedAt <= u.at)) {
        if (u.piece.kind === 'essay') await rename(deps, u.piece, u.title)
        else await renameSection(deps, u.piece, u.sectionId, u.title)
      }
      unsaved.saved(u.sectionId)
    } finally {
      held.release()
    }
  }
}

function titleIn(piece: Piece | undefined, sectionId: string): string | undefined {
  if (!piece) return undefined
  return piece.kind === 'essay' ? piece.title : piece.sections.find((s) => s.sectionId === sectionId)?.title
}

/** A promise that settled, or two seconds, whichever comes first; never rejects. */
function settled(p: Promise<unknown>): Promise<void> {
  return Promise.race([p.then(() => {}, () => {}), new Promise<void>((r) => setTimeout(r, 2000))])
}
