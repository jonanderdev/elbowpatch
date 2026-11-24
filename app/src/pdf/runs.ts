// Which font file holds each character of a piece (docs/decisions/0019). The fixed fonts come in files by
// script, so a piece fetches only the files its characters need; what none of them holds, such as an emoji,
// Arabic or Japanese, is drawn by the browser and placed as an image. Which file holds what is read from a
// list made with the files (coverage.json), so no font has to be fetched to know.

import coverage from './fonts/coverage.json' with { type: 'json' }
import type { FaceName } from './layout'

export type Script = 'latin' | 'cyrillic' | 'greek'
export type Run = { script: Script | 'image'; text: string }

/** The files are asked in this order, so a character in more than one (a combining accent) stays Latin. */
const SCRIPTS: Script[] = ['latin', 'cyrillic', 'greek']

/** Characters that take no room and draw nothing: left out, never missing. */
const INVISIBLE = /[­​-‍⁠﻿]/gu
const MARK = /\p{M}/u
const PLAIN = /^[ -~]*$/u

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** The name of the font file for a face and a script. The Latin file keeps the face's own name. */
export function fileOf(face: FaceName, script: Script): string {
  return script === 'latin' ? face : `${face}-${script}`
}

const held = new Map<string, number[]>()

/** A file's characters as pairs of first and last code point. */
function rangesOf(file: string): number[] {
  let known = held.get(file)
  if (!known) {
    const list = (coverage as Record<string, string>)[file]
    if (list === undefined) throw new Error(`No list of characters for ${file}`)
    known = list.split(',').flatMap((part) => {
      const [from = 0, to = from] = part.split('-').map((hex) => Number.parseInt(hex, 16))
      return [from, to]
    })
    held.set(file, known)
  }
  return known
}

function holds(file: string, code: number): boolean {
  const ranges = rangesOf(file)
  let low = 0
  let high = ranges.length / 2 - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (code < (ranges[2 * middle] as number)) high = middle - 1
    else if (code > (ranges[2 * middle + 1] as number)) low = middle + 1
    else return true
  }
  return false
}

/** The scripts whose file for this face holds every character of the text. */
function holders(face: FaceName, text: string): Script[] {
  return SCRIPTS.filter((script) => [...text].every((char) => holds(fileOf(face, script), char.codePointAt(0) as number)))
}

/**
 * The text as runs, each in one file or drawn as an image. Taken a letter at a time (a letter and its
 * marks, or an emoji and its joiners, are one), each run as long as one file can hold, so a Russian
 * sentence is one run, with its commas. Decomposed letters are written as the precomposed ones the file
 * holds; a mark that no precomposed letter holds would sit in the wrong place, so that letter is drawn
 * as an image, as the browser set it.
 */
export function splitRuns(face: FaceName, text: string): Run[] {
  if (text === '') return []
  if (PLAIN.test(text)) return [{ script: 'latin', text }]
  const units: { text: string; scripts: Script[] }[] = []
  for (const { segment } of graphemes.segment(text)) {
    const bare = segment.replace(INVISIBLE, '')
    if (bare === '' && segment !== '') continue
    const letter = bare.normalize('NFC')
    const marked = MARK.test(letter.slice(String.fromCodePoint(letter.codePointAt(0) ?? 0).length))
    const scripts = marked ? [] : holders(face, letter)
    // What is drawn as an image keeps its text as it was written, joiners and all.
    units.push({ text: scripts.length ? letter : segment, scripts })
  }
  const runs: Run[] = []
  for (let at = 0; at < units.length; ) {
    let best: Script | undefined
    let length = 0
    for (const script of SCRIPTS) {
      let n = 0
      while (units[at + n]?.scripts.includes(script)) n++
      if (n > length) {
        best = script
        length = n
      }
    }
    const take = best ? length : 1
    const part = units.slice(at, at + take).map((u) => u.text)
    const script = best ?? 'image'
    const last = runs.at(-1)
    if (script === 'image' && last?.script === 'image') last.text += part.join('')
    else runs.push({ script, text: part.join('') })
    at += take
  }
  return runs
}

/** The files a text needs in a face, in the order they are asked. */
export function filesFor(face: FaceName, text: string): string[] {
  const scripts = new Set(splitRuns(face, text).map((run) => run.script))
  return SCRIPTS.filter((script) => scripts.has(script)).map((script) => fileOf(face, script))
}
