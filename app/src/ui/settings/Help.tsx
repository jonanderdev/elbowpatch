import type { ReactElement } from 'react'
import { safariOutsideHomeScreen } from '../library/Notes'
import { Part } from './parts'

// Help (DESIGN.md, Settings): short answers, inside the app so it works offline.
// shortcut: Going back and the Time Machine's keys wait for the Time Machine, so Help never describes what isn't there.
const TIME_MACHINE = false
// shortcut: the line on exported pages waits for PDF export, the only export with pages.
const PDF = false

const KEYS: [string, string][] = [
  ['Turn the page', 'Page Up / Page Down, or Alt + Left / Right'],
  ['Undo', '⌘/Ctrl + Z'],
  ['Redo', '⌘/Ctrl + Shift + Z'],
  ...(TIME_MACHINE ? ([['Time Machine', '⌘/Ctrl + Alt + Z']] as [string, string][]) : []),
  ['Piece menu', 'Menu key, or Shift + F10'],
]

export function Help(): ReactElement {
  return (
    <>
      <p className="settings-lead">How Elbowpatch works, in short.</p>
      <Part heading="Where your writing lives">
        <p>
          In this browser, on this device. There is no save button: your words are saved as you write. Clearing the browser's data clears your writing too, so
          keep a copy: <a href="#/settings/export">Export &amp; import</a>.
        </p>
      </Part>
      {TIME_MACHINE && (
        <Part heading="Going back">
          <p>The Time Machine shows a piece as it was at any moment kept, and brings back a chapter, a day or a passage. Nothing later is lost.</p>
        </Part>
      )}
      <Part heading="Page numbers">
        <p>
          A phone's page holds fewer words than a desktop's, so a piece has more pages on a phone. Find your way by chapter or by date.
          {PDF && ' Exported pages keep fixed numbers.'}
        </p>
      </Part>
      {/* Where the library shows its Safari note, and only there. */}
      {safariOutsideHomeScreen() && (
        <Part heading="On an iPhone or iPad">
          <p>
            Write from your Home Screen and Safari won't clear your words. <a href="#/settings/help/home-screen">Show me how</a>
          </p>
        </Part>
      )}
      <section className="help-part help-keys">
        <h2>Keys</h2>
        <dl className="key-rows">
          {KEYS.map(([action, keys]) => (
            <div key={action}>
              <dt>{action}</dt>
              <dd>{keys}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}

/** Where Show me how lands. A Home Screen app starts empty (0010), so the writing is carried across first. */
export function HomeScreen(): ReactElement {
  return (
    <>
      <p className="settings-lead">
        Write from your Home Screen and your words stay. Here in Safari, they may be cleared if you don't open Elbowpatch for a week.
      </p>
      <Part heading="Bring your writing with you">
        <p>The Home Screen app starts with its own empty library. If you have written here in Safari, export everything first.</p>
        <ol>
          <li>In Settings › Export &amp; import, tap Export.</li>
          <li>In Safari, tap Share, then Add to Home Screen.</li>
          <li>Open Elbowpatch from your Home Screen.</li>
          <li>In Settings › Export &amp; import, tap Import and choose the file.</li>
        </ol>
      </Part>
    </>
  )
}
