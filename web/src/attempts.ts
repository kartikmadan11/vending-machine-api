import type { PurchaseOutcome, Sale } from './api'
import { coinLabel } from './money'

/** One purchase attempt and how the API answered it. */
export interface Attempt {
  id: number
  at: number
  customer: string
  /** The product's slot, or null for a custom price. */
  slot: string | null
  item: string
  price: number
  paid: number
  outcome: PurchaseOutcome
}

export type Tone = 'success' | 'warning' | 'danger' | 'limit' | 'neutral'

export interface Description {
  tone: Tone
  title: string
  /** Shown as a badge: the HTTP status, or "offline". */
  badge: string
}

export function statusOf(outcome: PurchaseOutcome): number | null {
  return outcome.kind === 'offline' ? null : outcome.status
}

const REJECTIONS: Record<string, { tone: Tone; title: string }> = {
  insufficient_payment: { tone: 'warning', title: 'Not enough money' },
  invalid_amount: { tone: 'warning', title: 'Invalid amount' },
  cannot_make_change: { tone: 'danger', title: "Can't make exact change" },
  rate_limited: { tone: 'limit', title: 'Turned away' },
  validation_error: { tone: 'neutral', title: 'Request rejected' },
}

export function describe(outcome: PurchaseOutcome): Description {
  if (outcome.kind === 'offline') return { tone: 'neutral', title: "Can't reach the API", badge: 'offline' }
  const badge = String(outcome.status)
  if (outcome.kind === 'sold') return { tone: 'success', title: 'Sold', badge }
  const known = REJECTIONS[outcome.code] ?? { tone: 'neutral', title: 'Request failed' }
  return { ...known, badge }
}

/** The coins in a sale as text, largest first: "£2, 50p, 3 × 2p". */
export function changeText(sale: Sale): string {
  if (sale.change.length === 0) return 'no change'
  return sale.change
    .map(({ denomination, count }) =>
      count === 1 ? coinLabel(denomination) : `${count} × ${coinLabel(denomination)}`,
    )
    .join(', ')
}

export function coinCount(sale: Sale): number {
  return sale.change.reduce((total, c) => total + c.count, 0)
}
