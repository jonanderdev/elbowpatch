import { render } from 'react-dom'
import { openStore } from './adapters/idb-store'
import { writerLock } from './adapters/writer-lock'
import { App } from './ui/App'
import { apply } from './ui/settings'
import { watchForUpdates } from './ui/updates'
import './ui/styles.css'

// Wires the adapters to the domain and the UI (docs/decisions/0004).
const deps = {
  store: openStore(),
  clock: { now: () => Date.now() },
  ids: { next: () => crypto.randomUUID() },
}

apply()
watchForUpdates()
render(<App deps={deps} lock={writerLock()} />, document.getElementById('app')!)
