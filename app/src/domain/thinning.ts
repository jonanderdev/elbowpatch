import type { Deps } from './pieces'

// Thinning (docs/decisions/0005): a section's local history gets sparser with
// age, keeping the last version in each period. It is the one place the app
// deletes history, so the rule is a pure function and the store part is thin.

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

export interface Thinnable {
  id: string
  seq: number
  createdAt: number
  /** Kept moments, the first, the latest, the one before a bring-back: never removed. */
  protected: boolean
}

/** The period a moment falls in, by its age: every one for an hour, then hourly, daily, weekly, monthly. */
function period(createdAt: number, now: number, id: string): string {
  const age = now - createdAt
  // A clock that jumped forward leaves moments "in the future": young, so kept.
  if (age < HOUR) return `each:${id}`
  if (age < DAY) return `hour:${Math.floor(createdAt / HOUR)}`
  if (age < 30 * DAY) return `day:${Math.floor(createdAt / DAY)}`
  if (age < 365 * DAY) return `week:${Math.floor(createdAt / WEEK)}`
  const d = new Date(createdAt)
  return `month:${d.getUTCFullYear()}-${d.getUTCMonth()}`
}

/** Which of one section's versions (or one piece's outlines) thinning removes. */
export function toThin(items: Thinnable[], now: number): Set<string> {
  if (items.length === 0) return new Set()
  const bySeq = [...items].sort((a, b) => a.seq - b.seq)
  const first = bySeq[0]!.id
  const latest = bySeq.at(-1)!.id
  // The last (highest seq) in each period stays.
  const last = new Map<string, Thinnable>()
  for (const item of bySeq) last.set(period(item.createdAt, now, item.id), item)
  const stays = new Set([first, latest, ...[...last.values()].map((i) => i.id)])
  return new Set(bySeq.filter((i) => !i.protected && !stays.has(i.id)).map((i) => i.id))
}

/** Thins every piece's history, one piece per transaction. Safe to run twice; runs when the app is idle (0010). */
export async function thin(deps: Pick<Deps, 'store' | 'clock'>): Promise<number> {
  const now = deps.clock.now()
  const pieces = await deps.store.transaction((tx) => tx.pieces())
  let removed = 0
  for (const { id } of pieces) {
    removed += await deps.store.transaction(async (tx) => {
      const piece = await tx.piece(id)
      if (!piece) return 0
      let n = 0
      const outlines = await tx.outlinesOf(id)
      const sectionIds = new Set([...piece.sections.map((s) => s.sectionId), ...outlines.flatMap((o) => o.sections.map((s) => s.sectionId))])
      for (const sectionId of sectionIds) {
        const versions = await tx.versionsOf(sectionId)
        const working = await tx.working(sectionId)
        const gone = toThin(
          versions.map((v) => ({ ...v, protected: !!v.kept || !!v.beforeBringBack || v.id === working?.baseVersionId })),
          now,
        )
        for (const vid of gone) await tx.deleteVersion(vid)
        n += gone.size
      }
      const gone = toThin(
        outlines.map((o) => ({ ...o, protected: o.id === piece.outlineId })),
        now,
      )
      for (const oid of gone) await tx.deleteOutline(oid)
      return n + gone.size
    })
  }
  return removed
}

const PUT_AWAY_DAYS = 30

/** Put-away pieces wait 30 days, then go for good, history and all (0006). */
export async function forgetPutAway(deps: Pick<Deps, 'store' | 'clock'>): Promise<number> {
  const now = deps.clock.now()
  const pieces = await deps.store.transaction((tx) => tx.pieces())
  const due = pieces.filter((p) => p.putAwayAt !== undefined && now - p.putAwayAt >= PUT_AWAY_DAYS * DAY)
  for (const { id } of due) {
    await deps.store.transaction(async (tx) => {
      const piece = await tx.piece(id)
      // Brought back meanwhile: it stays.
      if (!piece || piece.putAwayAt === undefined || now - piece.putAwayAt < PUT_AWAY_DAYS * DAY) return
      const outlines = await tx.outlinesOf(id)
      const working = await tx.workingOf(id)
      const sectionIds = new Set([
        ...piece.sections.map((s) => s.sectionId),
        ...outlines.flatMap((o) => o.sections.map((s) => s.sectionId)),
        ...working.map((w) => w.sectionId),
      ])
      for (const sectionId of sectionIds) {
        for (const v of await tx.versionsOf(sectionId)) await tx.deleteVersion(v.id)
        await tx.deleteWorking(sectionId)
      }
      for (const o of outlines) await tx.deleteOutline(o.id)
      await tx.deletePiece(id)
    })
  }
  return due.length
}
