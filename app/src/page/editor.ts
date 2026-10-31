import { baseKeymap, chainCommands, exitCode, setBlockType, toggleMark } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { InputRule, inputRules, textblockTypeInputRule, undoInputRule } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { Fragment, type MarkType, Slice } from 'prosemirror-model'
import { type Command, EditorState, Plugin, TextSelection, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { type Block, parse, serialize } from '../domain/markdown'
import { schema, toBlocks, toDoc } from './schema'

export interface EditorOptions {
  content: string
  lang: string
  onChange(markdown: string): void
  /** The editor wants the caret seen: the pager turns to its page. */
  onCaret(view: EditorView): void
  onFocusChange?(focused: boolean): void
  /** False while another window writes this piece. */
  editable?(): boolean
  /** The selection moved or changed: the selection menu follows it. */
  onSelection?(view: EditorView, tr: Transaction): void
  /** A key the page handles first (arrows at a page's edge); true when it did. */
  onKey?(view: EditorView, event: KeyboardEvent): boolean
}

export interface Editor {
  view: EditorView
  /** Which formatting the selection carries, for the pressed state of B, I and the quote. */
  active(): { bold: boolean; italic: boolean; quote: boolean }
  markdown(): string
  focus(): void
  /** Formatting from the selection menu or the writing bar. */
  run(command: 'bold' | 'italic' | 'quote' | 'undo' | 'redo'): void
  destroy(): void
}

export function createEditor(mount: HTMLElement, options: EditorOptions): Editor {
  const state = EditorState.create({
    doc: toDoc(parse(options.content)),
    plugins: [
      inputRules({ rules: markdownRules() }),
      keymap({
        Backspace: undoInputRule,
        'Mod-z': undo,
        'Shift-Mod-z': redo,
        'Mod-b': toggleMark(schema.marks.strong),
        'Mod-i': toggleMark(schema.marks.em),
        'Shift-Enter': chainCommands(exitCode, insertBreak),
        // Return only ever makes a new paragraph, and a pull quote ends with it.
        Enter: chainCommands(leaveQuote, baseKeymap.Enter!),
      }),
      keymap(baseKeymap),
      history({ newGroupDelay: 1000 }),
      placeholder(),
      nightFocus(),
    ],
  })

  // The mount is the text itself, so the pager can lay it out in columns as one box.
  const view = new EditorView(
    { mount },
    {
      state,
      editable: () => options.editable?.() ?? true,
      attributes: { class: 'body', lang: options.lang, spellcheck: 'true', 'aria-label': 'Text', 'aria-multiline': 'true', role: 'textbox' },
      // Pasted plain text is read as Markdown, with the same rules as typing (0003).
      // Markdown outside the v1 marks, headings included, arrives as plain paragraphs.
      clipboardTextParser: (text) => new Slice(Fragment.from(toDoc(parse(text).map(plainIfRaw)).content), 0, 0),
      clipboardTextSerializer: (slice) => serialize(toBlocks(schema.nodes.doc.create(null, slice.content.size ? slice.content : undefined))),
      // The pager turns to the caret; nothing scrolls by itself.
      handleKeyDown: (v, e) => options.onKey?.(v, e) ?? false,
      handleScrollToSelection: (v) => {
        options.onCaret(v)
        return true
      },
      handleDOMEvents: {
        focus: () => void options.onFocusChange?.(true),
        blur: () => void options.onFocusChange?.(false),
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr)
        view.updateState(next)
        if (tr.docChanged) options.onChange(serialize(toBlocks(next.doc)))
        if (tr.selectionSet || tr.docChanged || tr.storedMarksSet) options.onSelection?.(view, tr)
      },
    },
  )

  return {
    view,
    markdown: () => serialize(toBlocks(view.state.doc)),
    active: () => ({
      bold: markActive(view.state, schema.marks.strong),
      italic: markActive(view.state, schema.marks.em),
      quote: view.state.selection.$from.parent.type === schema.nodes.quote,
    }),
    focus: () => view.focus(),
    run(command) {
      const commands: Record<typeof command, Command> = {
        bold: toggleMark(schema.marks.strong),
        italic: toggleMark(schema.marks.em),
        quote: toggleQuote,
        undo,
        redo,
      }
      commands[command](view.state, view.dispatch, view)
      view.focus()
    },
    destroy: () => view.destroy(),
  }
}

function markActive(state: EditorState, type: MarkType): boolean {
  const { from, to, empty, $from } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks())
  return state.doc.rangeHasMark(from, to, type)
}

/**
 * A line break inside a paragraph. Markdown cannot hold one at a paragraph's
 * start or two in a row (they would read back as a new paragraph), so those
 * are refused. One left at the end with nothing after it is only space.
 */
const insertBreak: Command = (state, dispatch) => {
  const { $from, $to } = state.selection
  if ($from.parent.type === schema.nodes.raw) return false
  const before = $from.nodeBefore
  const after = $to.nodeAfter
  if (!before || before.type === schema.nodes.hard_break || after?.type === schema.nodes.hard_break) return true
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
  return true
}

function plainIfRaw(block: Block): Block {
  return block.type === 'raw' ? { type: 'paragraph', spans: [{ text: block.text, marks: [] }] } : block
}

/** Only the selected words become the pull quote: their paragraph splits around them. */
export const toggleQuote: Command = (state, dispatch) => {
  const { $from, $to, empty } = state.selection
  const inQuote = $from.parent.type === schema.nodes.quote
  if (inQuote || empty) return setBlockType(inQuote ? schema.nodes.paragraph : schema.nodes.quote)(state, dispatch)
  if (!setBlockType(schema.nodes.quote)(state)) return false
  if (dispatch) {
    const tr = state.tr
    // The end first, so the start's position still holds. The space between the quote and the words
    // around it goes with the split.
    if ($to.parent.type === schema.nodes.paragraph) {
      const rest = $to.parent.textBetween($to.parentOffset, $to.parent.content.size, undefined, '￼')
      const space = rest.length - rest.trimStart().length
      tr.delete($to.pos, $to.pos + space)
      if (space < rest.length) tr.split($to.pos)
    }
    if ($from.parent.type === schema.nodes.paragraph) {
      const lead = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
      const space = lead.length - lead.trimEnd().length
      tr.delete($from.pos - space, $from.pos)
      if (space < lead.length) tr.split($from.pos - space)
    }
    const from = tr.mapping.map($from.pos, 1)
    const to = tr.mapping.map($to.pos, -1)
    tr.setBlockType(from, to, schema.nodes.quote)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, from, to)).scrollIntoView())
  }
  return true
}

/** Return at the end of a pull quote starts a plain paragraph after it. */
const leaveQuote: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type !== schema.nodes.quote || $from.parentOffset !== $from.parent.content.size) return false
  if (dispatch) {
    const after = $from.after()
    const tr = state.tr.insert(after, schema.nodes.paragraph.create())
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView())
  }
  return true
}

function markdownRules(): InputRule[] {
  return [
    markRule(/\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, schema.marks.strong),
    markRule(/(?<![*\\])\*([^*\s](?:[^*]*[^*\s])?)\*$/, schema.marks.em),
    textblockTypeInputRule(/^>\s$/, schema.nodes.quote),
  ]
}

/** `*word*` becomes italic as you type the closing star. */
function markRule(pattern: RegExp, type: MarkType): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    // Markdown kept as written stays as written.
    if (state.doc.resolve(start).parent.type === schema.nodes.raw) return null
    const inner = match[1]!
    const tr = state.tr.replaceWith(start, end, schema.text(inner, [...state.doc.resolve(start).marks(), type.create()]))
    return tr.removeStoredMark(type)
  })
}

/** "Untitled" belongs to the title; the empty body says "Begin anywhere." (DESIGN.md). */
function placeholder(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const doc = state.doc
        const only = doc.firstChild
        if (doc.childCount !== 1 || !only || only.content.size > 0) return null
        return DecorationSet.create(doc, [Decoration.node(0, only.nodeSize, { class: 'empty', 'data-placeholder': 'Begin anywhere.' })])
      },
    },
  })
}

/** At night, paragraphs before the one being written dim (DESIGN.md, Behaviour). CSS decides when it shows. */
function nightFocus(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const index = state.selection.$head.index(0)
        if (index === 0) return null
        const decorations: Decoration[] = []
        state.doc.forEach((node, offset, i) => {
          if (i < index) decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'earlier' }))
        })
        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}

/** Where a selection is on screen, for the selection menu; null for a caret, or while not writing. */
export function selectionBox(view: EditorView): DOMRect | null {
  const { from, to, empty } = view.state.selection
  if (empty || !view.hasFocus()) return null
  const a = view.coordsAtPos(from)
  const b = view.coordsAtPos(to)
  const top = Math.min(a.top, b.top)
  return new DOMRect(Math.min(a.left, b.left), top, Math.abs(b.right - a.left), Math.max(a.bottom, b.bottom) - top)
}
