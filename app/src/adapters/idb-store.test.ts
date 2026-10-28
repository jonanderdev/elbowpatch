import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { newPiece, openPiece, takeMoment, write } from '../domain/pieces'
import { openStore, SCHEMA_VERSION } from './idb-store'

let n = 0
const ids = { next: () => `id${++n}` }
const clock = { now: () => 1_000 }

describe('idb store', () => {
  it('creates the schema from nothing', async () => {
    const store = openStore('fresh')
    await store.transaction((tx) => tx.pieces())
    store.close()
    const req = indexedDB.open('fresh')
    const db = await new Promise<IDBDatabase>((ok) => (req.onsuccess = () => ok(req.result)))
    expect(db.version).toBe(SCHEMA_VERSION)
    expect([...db.objectStoreNames].sort()).toEqual(['outlines', 'pieces', 'versions', 'working'])
    db.close()
  })

  it('keeps writing after the connection is lost', async () => {
    const store = openStore('reopen')
    const deps = { store, clock, ids }
    const piece = newPiece(deps, 'essay', 'en')
    const section = piece.sections[0]!.sectionId
    await write(deps, piece, section, 'Before.')
    // As Safari does in the background: the connection we hold stops working.
    const original = IDBDatabase.prototype.transaction
    let thrown = 0
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<typeof original>) {
      if (thrown++ === 0) throw new DOMException('The database connection is closing.', 'InvalidStateError')
      return original.apply(this, args)
    } as typeof original
    try {
      await write(deps, piece, section, 'After.')
    } finally {
      IDBDatabase.prototype.transaction = original
    }
    expect(thrown).toBe(2)
    expect(await takeMoment(deps, piece.id)).toBeGreaterThan(0)
    expect((await openPiece(deps, piece.id))?.sections[0]?.content).toBe('After.')
  })

  it('a throw inside a transaction writes nothing', async () => {
    const store = openStore('atomic')
    const deps = { store, clock, ids }
    const piece = newPiece(deps, 'essay', 'en')
    await expect(
      store.transaction(async (tx) => {
        await tx.putPiece(piece)
        throw new Error('halfway')
      }),
    ).rejects.toThrow('halfway')
    expect(await store.transaction((tx) => tx.pieces())).toEqual([])
  })
})
