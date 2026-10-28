import { useCallback, useEffect, useRef, useState } from 'react'
import type { Kind, Piece } from '../domain/model'
import { library, newPiece, openPiece, recover, withDay, type Deps } from '../domain/pieces'
import type { Held, WriterLock } from '../domain/ports'
import { Library } from './Library'
import { Page, type Opened } from './Page'

const LAST = 'elbowpatch.last'

/** URLs use the hash, so any static host works (0011): #/ is the library, #/p/<id> a piece. */
function useRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const on = () => setRoute(location.hash.slice(1) || '/')
    window.addEventListener('hashchange', on)
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

  const refresh = useCallback(async () => setPieces(await library(deps)), [deps])

  const open = useCallback(
    async (pieceId: string): Promise<Opened | null> => {
      const found = await openPiece(deps, pieceId)
      if (!found) return null
      let piece = found.piece
      let sectionId: string
      if (piece.kind === 'journal') {
        // The journal opens on today.
        ;({ piece, sectionId } = withDay(deps, piece, isoDay(new Date())))
      } else {
        const placed = piece.place && piece.sections.some((s) => s.sectionId === piece.place!.sectionId)
        sectionId = placed ? piece.place!.sectionId : piece.sections[0]!.sectionId
      }
      const content = found.sections.find((s) => s.sectionId === sectionId)?.content ?? ''
      return { piece, sectionId, content }
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
      } catch {
        // Nothing to recover is not a reason to stop; a store that cannot open shows on the first save.
      }
      await refresh().catch(() => {})
      const wanted = route.startsWith('/p/') ? route.slice(3) : readLast()
      if (wanted) setOpened(await open(wanted).catch(() => null))
      await document.fonts.ready
      setReady(true)
      document.getElementById('launch')?.setAttribute('hidden', '')
    })()
    // Once, at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Following the route: a piece opens, or the library comes back over the page.
  useEffect(() => {
    if (!ready) return
    if (route === '/') {
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
  const [writer, setWriter] = useState<'waiting' | 'here' | 'elsewhere'>('waiting')
  const held = useRef<Held | null>(null)
  const flushPage = useRef<(() => Promise<void>) | null>(null)
  const pieceId = opened?.piece.id
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
    void lock.hold(pieceId, onAsked).then((h) => {
      if (!alive) return h?.release()
      if (h) follow(h)
      else setWriter('elsewhere')
    })
    return () => {
      alive = false
      held.current?.release()
      held.current = null
    }
  }, [pieceId])

  const writeHere = async () => {
    if (!pieceId) return
    const h = await lock.take(pieceId, onAsked)
    // The other window has saved: start from what it left.
    const fresh = await open(pieceId)
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
  const inLibrary = route === '/' || !opened
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
          covered={inLibrary}
          onLibrary={() => go('/')}
          onChange={(piece) => {
            askToPersist()
            setPieces((all) => (all.some((p) => p.id === piece.id) ? all.map((p) => (p.id === piece.id ? piece : p)) : [piece, ...all]))
          }}
        />
      )}
      {inLibrary && (
        <Library
          pieces={pieces}
          last={last}
          today={today}
          onNew={startNew}
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
    return localStorage.getItem(LAST) ?? undefined
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
