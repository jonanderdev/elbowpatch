import { describe, expect, it } from 'vitest'
import { memoryStore } from '../../adapters/memory-store'
import { newPiece, openPiece, renameSection, withChapter, write } from '../../domain/pieces'
import { markdownFile } from './markdownFile'

async function book() {
  let n = 0
  const deps = { store: memoryStore(), clock: { now: () => 1000 }, ids: { next: () => `id${++n}` } }
  const piece = newPiece(deps, 'book', 'en')
  const first = piece.sections[0]!.sectionId
  await write(deps, piece, first, 'First.')
  await renameSection(deps, piece, first, 'One')
  const second = withChapter(deps, piece)
  await write(deps, second.piece, second.sectionId, 'Second.')
  await renameSection(deps, second.piece, second.sectionId, 'Two')
  const stored = (await openPiece(deps, piece.id))!.piece
  return { deps, stored, first }
}

describe('the book as one Markdown file, from a chapter not stored yet', () => {
  it('leaves out a chapter with nothing in it', async () => {
    const { deps, stored } = await book()
    const { piece, sectionId } = withChapter(deps, stored)
    const file = await markdownFile(deps, piece, sectionId, '', '')
    expect(file.text).toBe('# Untitled\n\n## One\n\nFirst.\n\n## Two\n\nSecond.\n')
  })

  it('has its words and title as the page holds them, where the draft has it', async () => {
    const { deps, stored, first } = await book()
    const { piece, sectionId } = withChapter(deps, stored, first)
    const file = await markdownFile(deps, piece, sectionId, 'Between.', 'Interlude')
    expect(file.text).toBe('# Untitled\n\n## One\n\nFirst.\n\n## Interlude\n\nBetween.\n\n## Two\n\nSecond.\n')
  })
})
