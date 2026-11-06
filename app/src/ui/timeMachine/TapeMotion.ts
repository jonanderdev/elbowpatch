import type { PointerEvent as ReactPointerEvent } from 'react'
import { EASE_OUT, reducedMotion } from './motion'
import { glideTime, MAX_THROW, RECENTER, settleOn } from './ruler'

/** A finger or pointer moving less than this is a tap, as on the page. */
const SLOP = 4
/** How far back, in ms, the speed it was let go at is read. */
const SPEED_OVER = 100

type PointerOn = ReactPointerEvent<HTMLElement>

/**
 * The tape in the hand (DESIGN.md, The tape): it follows the finger, and on letting go glides on and settles on a
 * tick. It owns the transform of the layer that holds the ticks. React never writes it, so a drag costs no render:
 * only a long way along does, when the ticks drawn have to follow.
 *
 * Where the tape stands is `x`, its distance in px from the oldest tick; the tick under the hairline is `x / spacing`.
 */
export class TapeMotion {
  layer: HTMLElement | null = null
  spacing = 11
  count = 0
  /** The tick the tape was let go on: the moment to show. */
  onSettle: (tick: number) => void = () => {}
  /** The ticks drawn are those around this one: it is called when the tape has gone far from the last. */
  onCenter: (tick: number) => void = () => {}

  /** Where the tape stands, or is gliding to; none until it is first put. */
  private x: number | undefined
  private center = 0
  private glide: Animation | undefined
  private drag: { id: number; from: number; startX: number; moved: boolean; samples: { t: number; x: number }[] } | undefined
  /** A click follows a drag when it ends over the tape: it is not a tap. */
  private dragged = false

  /** Whether the writer has the tape in the hand. */
  get held(): boolean {
    return !!this.drag?.moved
  }

  /** The tick under the hairline, now. */
  get tick(): number {
    return Math.round(this.where() / this.spacing)
  }

  /** Puts the tape at a tick, going there as a glide if it is a step away. */
  show(tick: number, glides: boolean): void {
    const x = tick * this.spacing
    if (this.x === undefined) {
      this.put(x)
      this.recenter(tick, true)
    } else if (x !== this.x) this.moveTo(x, glides)
  }

  /** Where the tape stands now, in the middle of a glide too. */
  where(): number {
    const el = this.layer
    if (!el || !this.glide) return this.x ?? 0
    return -new DOMMatrixReadOnly(getComputedStyle(el).transform).m41
  }

  private put(x: number): void {
    this.x = x
    if (this.layer) this.layer.style.transform = `translateX(${-x}px)`
  }

  private recenter(tick: number, now = false): void {
    if (now || Math.abs(tick - this.center) > RECENTER) {
      this.center = tick
      this.onCenter(tick)
    }
  }

  /** Goes to `x`. A glide takes it over from where the last one has got to, and cancelling it leaves it nowhere else. */
  moveTo(x: number, glides = true): void {
    const from = this.where()
    this.glide?.cancel()
    this.glide = undefined
    this.put(x)
    const to = Math.round(x / this.spacing)
    this.recenter(to, true)
    const el = this.layer
    const ms = glideTime(x - from)
    // Past a throw's reach the ticks on the way are not drawn: it goes there as it is, which the fade of the moment covers.
    const far = Math.abs(x - from) > MAX_THROW * this.spacing
    if (!el || !glides || ms === 0 || far || reducedMotion() || typeof el.animate !== 'function') return
    const glide = el.animate([{ transform: `translateX(${-from}px)` }, { transform: `translateX(${-x}px)` }], { duration: ms, easing: EASE_OUT })
    glide.onfinish = glide.oncancel = () => {
      if (this.glide === glide) this.glide = undefined
    }
    this.glide = glide
  }

  down = (e: PointerOn): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // A glide still going is stopped where it has got to, and the tape is in the hand from there.
    const x = this.where()
    this.glide?.cancel()
    this.glide = undefined
    this.put(x)
    this.dragged = false
    this.drag = { id: e.pointerId, from: x, startX: e.clientX, moved: false, samples: [{ t: e.timeStamp, x: e.clientX }] }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  move = (e: PointerOn): void => {
    const drag = this.drag
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.startX
    if (!drag.moved && Math.abs(dx) < SLOP) return
    drag.moved = true
    drag.samples.push({ t: e.timeStamp, x: e.clientX })
    if (drag.samples.length > 8) drag.samples.shift()
    // Dragged right, the tape goes right: older moments come in from the left. It stops at the ends.
    const x = Math.max(0, Math.min((this.count - 1) * this.spacing, drag.from - dx))
    this.put(x)
    this.recenter(Math.round(x / this.spacing))
  }

  up = (e: PointerOn): void => {
    const drag = this.drag
    if (!drag || e.pointerId !== drag.id) return
    this.drag = undefined
    if (!drag.moved) return
    this.dragged = true
    // The way it was going, over its last moments; stopped before it was let go, it is still.
    const last = drag.samples.at(-1)!
    const first = drag.samples.find((s) => last.t - s.t <= SPEED_OVER) ?? last
    const still = e.timeStamp - last.t > SPEED_OVER || last.t === first.t
    const velocity = still ? 0 : -(last.x - first.x) / (last.t - first.t)
    const tick = settleOn(this.where(), velocity, this.spacing, this.count)
    this.moveTo(tick * this.spacing)
    this.onSettle(tick)
  }

  cancel = (e: PointerOn): void => {
    if (this.drag?.id !== e.pointerId) return
    const moved = this.drag.moved
    this.drag = undefined
    if (!moved) return
    const tick = this.tick
    this.moveTo(tick * this.spacing)
    this.onSettle(tick)
  }

  /** Whether this click is the end of a drag, which is not a tap. Asked once. */
  endsDrag(): boolean {
    const dragged = this.dragged
    this.dragged = false
    return dragged
  }

  /** Stops what is running when the tape goes. */
  destroy(): void {
    this.glide?.cancel()
    this.glide = undefined
  }
}
