import { describe, expect, it } from 'vitest'
import { fieldHistory } from './fieldHistory'

describe('a title field’s history', () => {
  it('stops at the text the field opened with', () => {
    const h = fieldHistory('Salt')
    h.note('Salt and', 0)
    expect(h.undo()).toBe('Salt')
    expect(h.undo()).toBeNull()
  })

  it('takes a run of typing as one step, and a pause as the start of the next', () => {
    const h = fieldHistory('')
    h.note('S', 0)
    h.note('Sa', 500)
    h.note('Sal', 900)
    h.note('Salt', 2000)
    expect(h.undo()).toBe('Sal')
    expect(h.undo()).toBe('')
  })

  it('redoes what was undone, until something new is typed', () => {
    const h = fieldHistory('')
    h.note('Salt', 0)
    h.undo()
    expect(h.redo()).toBe('Salt')
    expect(h.redo()).toBeNull()
    h.undo()
    h.note('Sea', 5000)
    expect(h.redo()).toBeNull()
    expect(h.undo()).toBe('')
  })

  it('takes typing soon after an undo as a step of its own', () => {
    const h = fieldHistory('')
    h.note('Salt', 0)
    h.note('Salty', 2000)
    h.undo()
    h.note('Salt!', 2100)
    expect(h.undo()).toBe('Salt')
  })

  it('does not count the text an undo put back as a change', () => {
    const h = fieldHistory('')
    h.note('Salt', 0)
    h.note('Salty', 2000)
    h.note(h.undo()!, 2100)
    expect(h.redo()).toBe('Salty')
  })
})
