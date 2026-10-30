import type { ReactElement, RefObject } from 'react'
import { emptied } from './fields'

// The page's title fields. They are uncontrolled: their text is filled when a section opens
// (fillTitleFields) and read when saving, so typing in them never re-renders the page.

interface TitlePageProps {
  nameRef: RefObject<HTMLHeadingElement | null>
  subtitleRef: RefObject<HTMLParagraphElement | null>
  kind: 'book' | 'journal'
  readOnly: boolean
  /** Shows the title page (the fields can take focus while another page is in view). */
  onFocus(): void
  onInput(): void
  /** Return in the subtitle: on to what follows, on the next page. */
  onDone(): void
}

/**
 * A book's or journal's title page, as in a printed book: its name and an optional subtitle,
 * centred in the upper third; chapter 1 or the first day begins on the next page
 * (DESIGN.md, Books and chapters; The journal).
 */
export function TitlePage({ nameRef, subtitleRef, kind, readOnly, onFocus, onInput, onDone }: TitlePageProps): ReactElement {
  const editable = readOnly ? undefined : ('plaintext-only' as const)
  return (
    <div className="title-page">
      <h1
        ref={nameRef}
        className="book-title"
        contentEditable={editable}
        aria-label={readOnly ? undefined : kind === 'book' ? 'Book title' : 'Journal name'}
        data-placeholder="Untitled"
        spellcheck
        onFocus={onFocus}
        onInput={(e) => {
          emptied(e.currentTarget)
          onInput()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          // Return goes on to the subtitle.
          e.preventDefault()
          subtitleRef.current?.focus()
        }}
      />
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: contentEditable makes it an editable text field, which a label names. */}
      <p
        ref={subtitleRef}
        className="subtitle"
        contentEditable={editable}
        aria-label={readOnly ? undefined : 'Subtitle'}
        data-placeholder="Subtitle"
        spellcheck
        onFocus={onFocus}
        onInput={(e) => {
          emptied(e.currentTarget)
          onInput()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          onDone()
        }}
      />
    </div>
  )
}

interface SectionTitleProps {
  titleRef: RefObject<HTMLHeadingElement | null>
  /** False for a journal day, whose title is its date, and while another window writes. */
  editable: boolean
  placeholder: string
  /** Opens on a fresh page after a title page. */
  afterTitlePage: boolean
  onFocus(el: HTMLElement): void
  onInput(text: string): void
  /** Return: on to the text. */
  onDone(): void
}

/** An essay's title, a chapter's, or a journal day's date, at the top of its first page. */
export function SectionTitle({ titleRef, editable, placeholder, afterTitlePage, onFocus, onInput, onDone }: SectionTitleProps): ReactElement {
  return (
    <h1
      ref={titleRef}
      className={afterTitlePage ? 'title chapter-opening' : 'title'}
      contentEditable={editable ? 'plaintext-only' : undefined}
      aria-label={editable ? 'Title' : undefined}
      data-placeholder={placeholder}
      spellcheck
      onFocus={(e) => onFocus(e.currentTarget)}
      onInput={(e) => {
        emptied(e.currentTarget)
        onInput(e.currentTarget.textContent ?? '')
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        onDone()
      }}
    />
  )
}
