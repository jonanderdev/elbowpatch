import { describe, expect, it } from 'vitest'
import { memoryStore } from '../../adapters/memory-store'
import { newPiece, openPiece, withChapter, write } from '../../domain/pieces'
import type { WriterLock } from '../../domain/ports'
import { unsaved } from '../stores/unsaved'
import { replayJournal } from './replay'

const lock = { hold: async () => ({ release() {} }) } as unknown as WriterLock

describe('a draft chapter kept in the unsaved journal', () => {
  it('comes back by its title alone, even when the book was written in after it', async () => {
    let t = 1000
    let n = 0
    const deps = { store: memoryStore(), clock: { now: () => t }, ids: { next: () => `id${++n}` } }
    const piece = newPiece(deps, 'book', 'en')
    const first = piece.sections[0]!.sectionId
    await write(deps, piece, first, 'First.')
    const { piece: draft, sectionId } = withChapter(deps, piece)
    unsaved.keep({ piece: draft, pieceId: piece.id, sectionId, name: 'x.md', markdown: '', title: 'Kept title', bookTitle: null, subtitle: null })
    // The journal stamps entries by the real clock: the book was written in after this one.
    t = Date.now() + 60_000
    await write(deps, piece, first, 'First, and more.')

    await replayJournal(deps, lock)

    const open = (await openPiece(deps, piece.id))!
    expect(open.sections.map((s) => s.title)).toEqual(['', 'Kept title'])
    expect(open.sections[0]!.content).toBe('First, and more.')
    expect(unsaved.get(sectionId)).toBeUndefined()
  })
})
