import { useEffect, useRef, type ReactNode } from 'react'
import { number } from '../domain/words'
import { Icon, IconButton } from './Icon'
import { theme, update, useSettings, type Settings } from './settings'

export function ToolsBar(props: { page: number; count: number; words: number; onClose(): void; onTextSettings(): void; onExport(): void }) {
  const settings = useSettings()
  const night = theme(settings) === 'night'
  const ref = useRef<HTMLDivElement>(null)
  const full = `${props.page} of ${props.count}  ·  ${number(props.words)} words`

  // Opened from the page button: focus moves into the bar, and Escape folds it back.
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
  }, [])

  // On a narrow phone a long count drops its last word; the label still says it in full.
  const short = typeof window !== 'undefined' && window.innerWidth < 400 && full.length > 22
  return (
    <div ref={ref} className="bar surface tools" role="toolbar" aria-label="Tools">
      <span className="count">
        <span aria-hidden="true">{short ? `${props.page} of ${props.count}  ·  ${number(props.words)}` : full}</span>
        <span className="visually-hidden">{`Page ${props.page} of ${props.count}, ${number(props.words)} words`}</span>
      </span>
      <span className="bar-separator" />
      <IconButton icon="export" label="Export" onClick={props.onExport} />
      <button type="button" className="icon-button" aria-label="Text settings" onClick={props.onTextSettings}>
        <span className="aa" aria-hidden="true">Aa</span>
      </button>
      <IconButton icon={night ? 'sun' : 'moon'} label={night ? 'Paper' : 'Night'} onClick={() => update({ theme: night ? 'paper' : 'night' })} />
      <span className="bar-separator" />
      <IconButton icon="close" label="Close tools" onClick={props.onClose} />
    </div>
  )
}

function Segments<K extends keyof Settings>(props: {
  legend: string
  setting: K
  options: { value: Settings[K]; label: string; content?: ReactNode }[]
}) {
  const settings = useSettings()
  return (
    <div className="setting" role="radiogroup" aria-label={props.legend}>
      <span className="setting-label" aria-hidden="true">{props.legend}</span>
      <div className="segments">
        {props.options.map((o) => {
          const checked = settings[props.setting] === o.value
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={o.label}
              tabIndex={checked ? 0 : -1}
              className="segment"
              onClick={() => update({ [props.setting]: o.value } as Partial<Settings>)}
              onKeyDown={(e) => arrowsMove(e, props.options.map((x) => x.value), settings[props.setting], (v) => update({ [props.setting]: v } as Partial<Settings>))}
            >
              {o.content ?? o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Arrow keys move the choice within a radio group. */
function arrowsMove<T>(e: KeyboardEvent, values: T[], current: T, set: (v: T) => void) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  e.preventDefault()
  const next = values[(values.indexOf(current) + step + values.length) % values.length]!
  const group = (e.currentTarget as HTMLElement).parentElement
  set(next)
  requestAnimationFrame(() => (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus())
}

function Toggle(props: { label: string; setting: 'dropcap' | 'indent' }) {
  const settings = useSettings()
  const on = settings[props.setting]
  return (
    <label className="toggle">
      {props.label}
      <button type="button" role="switch" aria-checked={on} className="switch" aria-label={props.label} onClick={() => update({ [props.setting]: !on })} />
    </label>
  )
}

/** Text settings: a sheet over the page, applied live (DESIGN.md, Control). */
export function TextSettings(props: { onDone(): void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ;(ref.current?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus()
  }, [])
  return (
    <div ref={ref} className="sheet surface" role="dialog" aria-label="Text settings">
      <Segments
        legend="Text size"
        setting="size"
        options={[
          { value: 's', label: 'Small', content: <span style={{ fontSize: 14 }}>A</span> },
          { value: 'm', label: 'Medium', content: <span style={{ fontSize: 18 }}>A</span> },
          { value: 'l', label: 'Large', content: <span style={{ fontSize: 23 }}>A</span> },
        ]}
      />
      <Segments
        legend="Line spacing"
        setting="leading"
        options={[
          { value: 'tight', label: 'Tight' },
          { value: 'normal', label: 'Normal' },
          { value: 'loose', label: 'Loose' },
        ]}
      />
      <Segments
        legend="Alignment"
        setting="align"
        options={[
          { value: 'left', label: 'Left', content: <Icon name="alignLeft" /> },
          { value: 'justify', label: 'Justified', content: <Icon name="justify" /> },
        ]}
      />
      <ThemeSegments />
      <Segments
        legend="Width"
        setting="measure"
        options={[
          { value: 'narrow', label: 'Narrow' },
          { value: 'wide', label: 'Wide' },
        ]}
      />
      <Toggle label="Drop cap" setting="dropcap" />
      <Toggle label="Indent paragraphs" setting="indent" />
      <div className="sheet-foot">
        <button type="button" className="text-link" onClick={props.onDone}>
          Done
        </button>
      </div>
    </div>
  )
}

/** The theme row shows what is in use, even while it still follows the system. */
function ThemeSegments() {
  const current = theme(useSettings())
  const options = [
    { value: 'paper' as const, label: 'Paper' },
    { value: 'night' as const, label: 'Night' },
  ]
  return (
    <div className="setting" role="radiogroup" aria-label="Page">
      <span className="setting-label" aria-hidden="true">Page</span>
      <div className="segments">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={current === o.value}
            tabIndex={current === o.value ? 0 : -1}
            className="segment"
            onClick={() => update({ theme: o.value })}
            onKeyDown={(e) => arrowsMove(e, ['paper', 'night'] as const, current, (v) => update({ theme: v }))}
          >
            <span className={`swatch ${o.value}`} aria-hidden="true" />
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
