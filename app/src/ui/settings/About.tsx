import type { ReactElement } from 'react'
import { Part } from './parts'

// About & privacy (DESIGN.md, Settings; docs/decisions/0014): the promises, inside the app so it works offline.
// shortcut: the sentence on a connected place waits for connecting, so the page never describes what isn't there.
const CONNECTING = false
// shortcut: the line on counted visits waits for counting, and follows its switch once that is built.
const VISITS_COUNTED = false

export function About(): ReactElement {
  return (
    <>
      <p className="settings-lead">A quiet place to write journals, essays and books, for people who want to do the writing themselves.</p>
      <Part heading="Your writing">
        <p>It stays on this device.{CONNECTING && ' It leaves only for a place you connect, and that place holds it under its own terms.'}</p>
      </Part>
      <Part heading="Privacy">
        <p>
          No cookies, no fingerprinting, no tracking in the editor.{VISITS_COUNTED && ' Visits to this site are counted, without cookies. Words never are.'}
        </p>
      </Part>
      <Part heading="No warranty">
        <p>
          Elbowpatch is provided as-is, with no warranty. Keep a copy of what matters: <a href="#/settings/export">Export &amp; import</a>.
        </p>
      </Part>
      <Part heading="The project">
        <p>Open source under the MIT License. The main copy runs on a best-effort basis, and anyone can host their own.</p>
      </Part>
      <p className="settings-note">Set in Literata by TypeTogether and EB Garamond by Georg Duffner, both under the SIL Open Font License.</p>
    </>
  )
}
