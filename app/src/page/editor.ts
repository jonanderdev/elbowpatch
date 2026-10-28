import { baseKeymap, chainCommands, exitCode, setBlockType, toggleMark } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { InputRule, inputRules, textblockTypeInputRule, undoInputRule } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { Fragment, Slice, type MarkType } from 'prosemirror-model'
import { EditorState, Plugin, TextSelection, type Command } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { parse, serialize } from '../domain/markdown'
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
}

export interface Editor {
  view: EditorView
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

  const view = new EditorView(mount, {
    state,
    editable: () => options.editable?.() ?? true,
    attributes: { class: 'body', lang: options.lang, spellcheck: 'true', 'aria-label': 'Text', 'aria-multiline': 'true', role: 'textbox' },
    // Pasted plain text is read as Markdown, with the same rules as typing (0003).
    clipboardTextParser: (text) => new Slice(Fragment.from(toDoc(parse(text)).content), 0, 0),
    clipboardTextSerializer: (slice) => serialize(toBlocks(schema.nodes.doc.create(null, slice.content.size ? slice.content : undefined))),
    // The pager turns to the caret; nothing scrolls by itself.
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
    },
  })

  return {
    view,
    markdown: () => serialize(toBlocks(view.state.doc)),
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

const insertBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
  return true
}

const toggleQuote: Command = (state, dispatch) => {
  const inQuote = state.selection.$from.parent.type === schema.nodes.quote
  return setBlockType(inQuote ? schema.nodes.paragraph : schema.nodes.quote)(state, dispatch)
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
