import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'
import type { Outline, Piece, Version, Working } from '../domain/model'
import type { Store, Tx } from '../domain/ports'

interface Schema extends DBSchema {
  pieces: { key: string; value: Piece }
  working: { key: string; value: Working; indexes: { pieceId: string } }
  versions: { key: string; value: Version; indexes: { sectionId: string } }
  outlines: { key: string; value: Outline; indexes: { pieceId: string } }
}

type Stores = 'pieces' | 'working' | 'versions' | 'outlines'
const STORES: Stores[] = ['pieces', 'working', 'versions', 'outlines']

/**
 * Ordered schema steps; step i takes the database from version i to i + 1.
 * Never edit a shipped step: add the next one, with its own test (0010).
 */
export const migrations: ((db: IDBPDatabase<Schema>) => void)[] = [
  (db) => {
    db.createObjectStore('pieces', { keyPath: 'id' })
    db.createObjectStore('working', { keyPath: 'sectionId' }).createIndex('pieceId', 'pieceId')
    db.createObjectStore('versions', { keyPath: 'id' }).createIndex('sectionId', 'sectionId')
    db.createObjectStore('outlines', { keyPath: 'id' }).createIndex('pieceId', 'pieceId')
  },
]

export const SCHEMA_VERSION: number = migrations.length

export function openStore(name = 'elbowpatch'): Store & { close(): void } {
  let db: Promise<IDBPDatabase<Schema>> | undefined

  const connect = () =>
    (db ??= openDB<Schema>(name, SCHEMA_VERSION, {
      upgrade(database, from) {
        for (let v = from; v < SCHEMA_VERSION; v++) migrations[v]!(database)
      },
      // Another window wants a newer schema: step aside rather than block it.
      blocking() {
        void db?.then((d) => d.close())
        db = undefined
      },
      terminated() {
        db = undefined
      },
    }).catch((error) => {
      db = undefined
      throw error
    }))

  async function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const tx = (await connect()).transaction(STORES, 'readwrite')
    let result: T
    try {
      result = await fn(txOver(tx))
    } catch (error) {
      // A throw does not abort IndexedDB by itself: the writes made so far would commit.
      try {
        tx.abort()
      } catch {}
      tx.done.catch(() => {})
      throw error
    }
    await tx.done
    return result
  }

  // Safari can drop the connection while the app is in the background: reopen
  // and try once more. Every write is safe to run twice (0010).
  async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await run(fn)
    } catch (error) {
      if (!isConnectionLost(error)) throw error
      db = undefined
      return run(fn)
    }
  }

  return {
    transaction,
    close() {
      void db?.then((d) => d.close())
      db = undefined
    },
  }
}

function isConnectionLost(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'InvalidStateError' || error.name === 'UnknownError')
}

function txOver(tx: IDBPTransaction<Schema, Stores[], 'readwrite'>): Tx {
  const s = (name: Stores) => tx.objectStore(name)
  return {
    piece: (id) => tx.objectStore('pieces').get(id),
    pieces: () => tx.objectStore('pieces').getAll(),
    putPiece: async (p) => void (await s('pieces').put(p)),
    working: (id) => tx.objectStore('working').get(id),
    workingOf: (pieceId) => tx.objectStore('working').index('pieceId').getAll(pieceId),
    putWorking: async (w) => void (await s('working').put(w)),
    version: (id) => tx.objectStore('versions').get(id),
    versionsOf: (sectionId) => tx.objectStore('versions').index('sectionId').getAll(sectionId),
    putVersion: async (v) => void (await s('versions').put(v)),
    outline: (id) => tx.objectStore('outlines').get(id),
    outlinesOf: (pieceId) => tx.objectStore('outlines').index('pieceId').getAll(pieceId),
    putOutline: async (o) => void (await s('outlines').put(o)),
    deleteVersion: async (id) => void (await s('versions').delete(id)),
    deleteOutline: async (id) => void (await s('outlines').delete(id)),
    deleteWorking: async (id) => void (await s('working').delete(id)),
    deletePiece: async (id) => void (await s('pieces').delete(id)),
  }
}
