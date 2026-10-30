import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react'
import { pieceAsMarkdown } from '../../domain/export'
import type { Kind, Piece } from '../../domain/model'
import { type Deps, library, newPiece, openPiece, putAway, recover, rename, restore, withDay } from '../../domain/pieces'
import type { WriterLock } from '../../domain/ports'
import { forgetPutAway, thin } from '../../domain/thinning'
import { isoDay } from '../../domain/words'
import { download } from '../files/download'
import { downloadEverything } from '../files/everything'
import { Library } from '../library/Library'
import { type Opened, Page } from '../page/Page'
import { Settings } from '../settings/Settings'
import { readLast, writeLast } from '../stores/last'
import { askToPersist } from './persist'
import { replayJournal } from './replay'
import { useRoute } from './useRoute'
import { useWriterLock } from './useWriterLock'

/** Counts the sections read from storage, so each reading opens a new page. */
let reads = 0
/** The least time the launch screen shows, from the page's start, in ms. */
const MIN_LAUNCH = 1000

export function App({ deps, lock }: { deps: Deps; lock: WriterLock }): ReactElement | null {
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
        // At the writer's place, if its section is still there; else the first chapter.
        const place = piece.place
        const placed = place !== undefined && piece.sections.some((s) => s.sectionId === place.sectionId)
        sectionId = placed ? place.sectionId : piece.sections[0]!.sectionId
      }
      const section = found.sections.find((s) => s.sectionId === sectionId)
      return { piece, sectionId, content: section?.content ?? '', updatedAt: section?.updatedAt, readAt: ++reads }
    },
    [deps],
  )

  // Startup (0010): open the store and run its migrations, bring back text a
  // crash left, lay out the last piece behind the library, wait for the fonts,
  // then let the launch screen go.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per app load, with what it was started with.
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
      // The launch screen stays a moment even when everything is ready at once: a flash reads as a glitch.
      await new Promise((r) => setTimeout(r, Math.max(0, MIN_LAUNCH - performance.now())))
      setReady(true)
      document.getElementById('launch')?.setAttribute('hidden', '')
      // Thinning and the end of put-away pieces' 30 days run afterwards, when idle (0010).
      const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 3000))
      idle(
        () =>
          void forgetPutAway(deps)
            .then(() => thin(deps))
            .catch(() => {}),
      )
    })()
  }, [])

  // Following the route: a piece opens, or the library comes back over the page.
  const openedId = opened?.piece.id
  useEffect(() => {
    if (!ready) return
    if (route === '/' || route.startsWith('/settings')) {
      void refresh()
      return
    }
    const id = route.startsWith('/p/') ? route.slice(3) : ''
    if (openedId === id) return
    void open(id).then((next) => {
      if (next) setOpened(next)
      else go('/')
    })
  }, [route, ready, openedId, open, refresh, go])

  useEffect(() => {
    if (openedId) writeLast(openedId)
  }, [openedId])

  // The open page's save, for whoever needs it first (another window, an export, the library);
  // and its last save as it closes, which the lock is let go only after.
  const flushPage = useRef<(() => Promise<void>) | null>(null)
  const closing = useRef<Promise<void>>(Promise.resolve())
  const { writer, writeHere } = useWriterLock(lock, opened?.piece.id, flushPage, closing)

  const startNew = (kind: Kind) => {
    let piece = newPiece(deps, kind, navigator.language || 'en')
    let sectionId = piece.sections[0]?.sectionId ?? ''
    if (kind === 'journal') ({ piece, sectionId } = withDay(deps, piece, today))
    setOpened({ piece, sectionId, content: '', fresh: true, readAt: ++reads })
    go(`/p/${piece.id}`)
  }

  if (!ready) return null
  const inSettings = route.startsWith('/settings')
  // The library stays over the page until the piece asked for is the one open: never a frame
  // of the piece open before it.
  const wanted = route.startsWith('/p/') ? route.slice(3) : null
  const inLibrary = (!wanted || opened?.piece.id !== wanted) && !inSettings
  const last = pieces.find((p) => p.id === readLast() && p.place)

  return (
    <>
      {opened && (
        <Page
          // A new page for each section opened, and again when it is read anew (Write here, a rename).
          key={`${opened.piece.id}:${opened.sectionId}:${opened.readAt}`}
          deps={deps}
          opened={opened}
          writer={writer}
          onWriteHere={() =>
            // The other window has saved: start from what it left.
            void writeHere(async () => {
              const fresh = opened && (await open(opened.piece.id))
              if (fresh) setOpened(fresh)
            })
          }
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
          onExportEverything={async () => {
            await flushPage.current?.()
            return downloadEverything(deps)
          }}
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
            else
              void open(piece.id).then((next) => {
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
