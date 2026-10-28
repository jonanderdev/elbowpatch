import type { Outline, Piece, Version, Working } from '../domain/model'
import type { Store, Tx } from '../domain/ports'

/**
 * The store in memory, for tests. A transaction works on a copy and only
 * replaces the data when it finishes, so a throw inside one changes nothing,
 * as in IndexedDB.
 */
export function memoryStore(): Store & { failNext(error: Error): void } {
  let data = empty()
  let failure: Error | undefined
  let queue: Promise<unknown> = Promise.resolve()

  return {
    failNext(error) {
      failure = error
    },
    transaction(fn) {
      const run = queue.then(async () => {
        if (failure) {
          const error = failure
          failure = undefined
          throw error
        }
        const draft = clone(data)
        const result = await fn(txOver(draft))
        data = draft
        return structuredClone(result)
      })
      queue = run.catch(() => {})
      return run
    },
  }
}

interface Data {
  pieces: Map<string, Piece>
  working: Map<string, Working>
  versions: Map<string, Version>
  outlines: Map<string, Outline>
}

const empty = (): Data => ({ pieces: new Map(), working: new Map(), versions: new Map(), outlines: new Map() })
const clone = (d: Data): Data => structuredClone(d)
const copy = <T>(v: T): T => structuredClone(v)

function txOver(d: Data): Tx {
  return {
    piece: async (id) => copy(d.pieces.get(id)),
    pieces: async () => copy([...d.pieces.values()]),
    putPiece: async (p) => void d.pieces.set(p.id, copy(p)),
    working: async (id) => copy(d.working.get(id)),
    workingOf: async (pieceId) => copy([...d.working.values()].filter((w) => w.pieceId === pieceId)),
    putWorking: async (w) => void d.working.set(w.sectionId, copy(w)),
    version: async (id) => copy(d.versions.get(id)),
    versionsOf: async (sectionId) => copy([...d.versions.values()].filter((v) => v.sectionId === sectionId)),
    putVersion: async (v) => void d.versions.set(v.id, copy(v)),
    outline: async (id) => copy(d.outlines.get(id)),
    outlinesOf: async (pieceId) => copy([...d.outlines.values()].filter((o) => o.pieceId === pieceId)),
    putOutline: async (o) => void d.outlines.set(o.id, copy(o)),
    deleteVersion: async (id) => void d.versions.delete(id),
    deleteOutline: async (id) => void d.outlines.delete(id),
    deleteWorking: async (id) => void d.working.delete(id),
    deletePiece: async (id) => void d.pieces.delete(id),
  }
}
