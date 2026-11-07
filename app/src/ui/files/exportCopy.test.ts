import { describe, expect, it } from 'vitest'
import { pdfNote, savedAs } from './exportCopy'

describe('the words around exporting', () => {
  it('says what a PDF holds by kind of piece', () => {
    expect(pdfNote('essay')).toBe('Numbered pages to print or keep.')
    expect(pdfNote('journal')).toBe('Numbered pages to print or keep, each day on a fresh page.')
    expect(pdfNote('book')).toBe('Numbered pages to print or keep, with contents at the front.')
  })

  it('names the file that was saved', () => {
    expect(savedAs('The Long Winter.pdf')).toBe('Saved as The Long Winter.pdf.')
  })
})
