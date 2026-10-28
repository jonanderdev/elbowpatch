import { render } from 'react-dom'
import { openStore } from './adapters/idb-store'
import { App } from './ui/App'
import { apply } from './ui/settings'
import './ui/styles.css'

// Wires the adapters to the domain and the UI (docs/decisions/0004).
const deps = {
  store: openStore(),
  clock: { now: () => Date.now() },
  ids: { next: () => crypto.randomUUID() },
}

apply()
render(<App deps={deps} />, document.getElementById('app')!)
