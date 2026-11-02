import { describe, expect, it } from 'vitest'
import { LIMIT, meter, recordOutcome, WINDOW_MS, type Limits } from './rateWindow'

function admit(times: number[], status = 200, customer = 'alice'): Limits {
  return times.reduce<Limits>((limits, at) => recordOutcome(limits, customer, status, at), {})
}

describe('recordOutcome and meter', () => {
  it('counts attempts the server let through, whether they sold or not', () => {
    let limits = admit([0], 200)
    limits = recordOutcome(limits, 'alice', 400, 10)
    limits = recordOutcome(limits, 'alice', 409, 20)
    expect(meter(limits, 'alice', 30).used).toBe(3)
  })

  it('ignores a 422 and an unreachable API, which the limiter never sees', () => {
    const limits = admit([0])
    expect(recordOutcome(limits, 'alice', 422, 10)).toBe(limits)
    expect(recordOutcome(limits, 'alice', null, 10)).toBe(limits)
  })

  it('says when the oldest attempt leaves a full window', () => {
    const limits = admit([0, 1000, 2000])
    expect(meter(limits, 'alice', 2500)).toEqual({ used: LIMIT, freeInMs: WINDOW_MS - 2500, blockedMs: 0 })
  })

  it('drops attempts older than the window', () => {
    const limits = admit([0, 1000, 2000])
    expect(meter(limits, 'alice', WINDOW_MS).used).toBe(2)
    expect(meter(limits, 'alice', WINDOW_MS + 2000).used).toBe(0)
  })

  it('does not count a 429 but waits as long as Retry-After says', () => {
    const limits = recordOutcome(admit([0, 1, 2]), 'alice', 429, 100, 5)
    expect(meter(limits, 'alice', 100)).toMatchObject({ used: LIMIT, blockedMs: 5000 })
    expect(meter(limits, 'alice', 5100).blockedMs).toBe(0)
  })

  it('waits one second when a 429 has no Retry-After', () => {
    const limits = recordOutcome({}, 'alice', 429, 0)
    expect(meter(limits, 'alice', 0).blockedMs).toBe(1000)
  })

  it('does not overstate the wait when the clock is a moment behind the response', () => {
    const limits = recordOutcome(admit([0, 1, 2]), 'alice', 429, 1000, 5)
    expect(meter(limits, 'alice', 800)).toMatchObject({ freeInMs: 4000, blockedMs: 5000 })
  })

  it('keeps each customer separate', () => {
    const limits = admit([0, 1, 2], 200, 'alice')
    expect(meter(limits, 'bob', 3)).toEqual({ used: 0, freeInMs: 0, blockedMs: 0 })
  })
})
