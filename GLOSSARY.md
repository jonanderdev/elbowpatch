# Elbowpatch

A quiet place to write journals, essays and books, with a memory. These are the product's words, and the code uses them too (docs/decisions/0009).

## Writing

**Writer**:
The person writing in the app.
_Avoid_: User, author, account

**Piece**:
The unit of writing: one journal, one essay or one book.
_Avoid_: Document, doc, note, file

**Kind**:
What a piece is: a journal, an essay or a book.
_Avoid_: Type, category

**Journal**:
A piece with a fresh page for each day. A writer can keep more than one.

**Essay**:
A piece that is one continuous text.

**Book**:
A piece made of chapters, with a title page.
_Avoid_: Novel, project

**Section**:
The part of a piece that has its own history: a chapter, a day, or the whole of an essay. The writer sees those three words, never this one.
_Avoid_: Part, block

**Chapter**:
A section of a book. It starts on a fresh page and has a title.

**Rejoin**:
Undo putting a chapter born of a split back onto the end of the chapter before it. Only in the session it was split. The writer sees undo, never this word.
_Avoid_: Merge, join

**Day**:
A section of a journal. Its title is its date.
_Avoid_: Entry, post

**Working copy**:
The one changing copy of a section's text, saved moments after typing stops. It protects against a crash, and is not history.
_Avoid_: Autosave, buffer

**Outline**:
A piece's structure: its title and its sections, in order, with their titles.
_Avoid_: Structure, table of contents

**Contents**:
What the writer sees of the outline: the chapters and the page each starts on. A journal's is called Days.
_Avoid_: Index, table of contents

**Your place**:
Where the writer was in a piece: the caret, or the first line on screen.
_Avoid_: Bookmark, cursor position, reading position

## The page

**The Page**:
The writing screen.
_Avoid_: Editor, writing view

**Page**:
One sheet of a piece's text, which fills and turns. A phone's pages and a desktop's differ.

**Running head**:
The line at the top of a page, from the second page on, naming the piece, chapter or date.
_Avoid_: Header

**Folio**:
The page number on a page.
_Avoid_: Page number, footer

## History

**Moment**:
A point in a piece's history that the writer can go back to. Moments are taken automatically as the writer goes.
_Avoid_: Snapshot, commit, checkpoint, revision

**Version**:
One section's full text at a moment, or one outline at a moment. It never changes once written. A moment writes a version only for what changed.
_Avoid_: Commit, revision

**Kept moment**:
A moment the writer chose with "Keep this moment". The whole piece as it stood then is never thinned.
_Avoid_: Label, tag, pin

**Thinning**:
History growing sparser with age, so an old stretch keeps fewer moments. The only way the app removes history from a piece it still holds.
_Avoid_: Pruning, cleanup, garbage collection

**Time Machine**:
The full-screen view of the whole piece as it stood at one moment.
_Avoid_: History view, timeline

**Tape**:
The row of ticks at the foot of the Time Machine, one for each moment the section on screen changed.
_Avoid_: Timeline, slider, scrubber

**Look back**:
Going through a piece as it was, in the Time Machine.

**Bring back**:
Making an old section the current text again, as a new version, so nothing later is lost. Named for its scope: bring chapter, day or essay back.
_Avoid_: Revert, roll back, undo

**Bring part back**:
Inserting a passage from an old moment into the current text. It replaces nothing.
_Avoid_: Merge, paste

**Keep a copy**:
Making a new essay from the section being looked at, starting its own history now, with today's date: the text is that moment's, and the history is new.
_Avoid_: Branch, fork, duplicate

**Draft**:
A piece made by keeping a copy, named for what it came from, like "Salt on the windows, draft 2".
_Avoid_: Branch, alternate version

## The library

**Library**:
Where all of a writer's pieces are listed, by kind.
_Avoid_: Home, dashboard, collection

**Shelf**:
One of the library's two views, beside the list: each kind's pieces as objects in a row.

**Put away**:
What deleting a piece is: out of the library, whole, for 30 days, then gone for good.
_Avoid_: Delete, trash, archive

**Restore**:
Returning a put-away piece to the library. The writer sees it as "Bring back".
_Avoid_: Undelete, recover

## Leaving and arriving

**Export**:
Taking writing out of the app: everything with its history as Markdown, or one piece as Markdown or PDF.
_Avoid_: Backup, download

**Archive**:
The files a full export produces. The writer sees it as "Everything", never this word.
_Avoid_: Backup, bundle

**Import**:
Taking writing in, from an export or from loose Markdown files. It never replaces what is here.
_Avoid_: Restore, sync, upload

**Connected place**:
Somewhere the writer chose to send copies of their writing. There is one at a time, and writing leaves the device for nowhere else.
_Avoid_: Provider, remote, cloud, account

**Connector**:
What reaches a connected place. The writer never sees this word.
_Avoid_: Provider, integration, plugin
