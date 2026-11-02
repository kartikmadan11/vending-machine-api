/**
 * What the UI knows about each customer's recent purchase attempts, so it can show how much of
 * the limit is used. The server is what enforces the limit; this only mirrors it for display.
 */

export const LIMIT = 3
export const WINDOW_MS = 5_000

export interface CustomerWindow {
  /** When each attempt the server let through was answered. */
  admitted: number[]
  /** Until when the server's last 429 said to wait. */
  blockedUntil: number
  /** When the last response was recorded. */
  updatedAt: number
}

export type Limits = Record<string, CustomerWindow>

const EMPTY: CustomerWindow = { admitted: [], blockedUntil: 0, updatedAt: 0 }

/**
 * Records one attempt's response. `status` is null when the API could not be reached.
 * The server counts every attempt it lets through, whether the purchase then succeeds or fails,
 * but a 422 never reaches the limiter and a 429 is not counted.
 */
export function recordOutcome(
  limits: Limits,
  customer: string,
  status: number | null,
  now: number,
  retryAfterSeconds: number | null = null,
): Limits {
  if (status === null || status === 422) return limits
  const current = limits[customer] ?? EMPTY
  const admitted = current.admitted.filter((t) => t > now - WINDOW_MS)
  if (status === 429) {
    const blockedUntil = now + (retryAfterSeconds ?? 1) * 1000
    return { ...limits, [customer]: { admitted, blockedUntil, updatedAt: now } }
  }
  return {
    ...limits,
    [customer]: { admitted: [...admitted, now], blockedUntil: current.blockedUntil, updatedAt: now },
  }
}

export interface Meter {
  /** Attempts let through in the last five seconds. */
  used: number
  /** When the limit is used up, how long until the oldest attempt leaves the window. */
  freeInMs: number
  /** How long is left of the wait the server's last 429 gave. */
  blockedMs: number
}

export function meter(limits: Limits, customer: string, clock: number): Meter {
  const { admitted, blockedUntil, updatedAt } = limits[customer] ?? EMPTY
  // A ticking clock can be a moment behind the latest response; it must not overstate the wait.
  const now = Math.max(clock, updatedAt)
  const recent = admitted.filter((t) => t > now - WINDOW_MS)
  const freeInMs = recent.length >= LIMIT ? recent[recent.length - LIMIT] + WINDOW_MS - now : 0
  return { used: recent.length, freeInMs, blockedMs: Math.max(0, blockedUntil - now) }
}
