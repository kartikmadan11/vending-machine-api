import { describe, expect, it } from 'vitest'
import type { PurchaseOutcome } from './api'
import { changeText, coinCount, describe as describeOutcome, statusOf } from './attempts'

const sale = {
  change: [
    { denomination: 200, count: 1 },
    { denomination: 50, count: 1 },
    { denomination: 2, count: 3 },
  ],
  change_total: 256,
}

function rejected(status: number, code: string): PurchaseOutcome {
  return { kind: 'rejected', status, code, message: '', retryAfter: null }
}

describe('describe', () => {
  it('describes a sale', () => {
    expect(describeOutcome({ kind: 'sold', status: 200, sale })).toEqual({
      tone: 'success',
      title: 'Sold',
      badge: '200',
    })
  })

  it.each([
    [400, 'insufficient_payment', 'warning', 'Not enough money'],
    [400, 'invalid_amount', 'warning', 'Invalid amount'],
    [409, 'cannot_make_change', 'danger', "Can't make exact change"],
    [429, 'rate_limited', 'limit', 'Turned away'],
    [422, 'validation_error', 'neutral', 'Request rejected'],
    [500, 'http_error', 'neutral', 'Request failed'],
  ])('describes a %i %s', (status, code, tone, title) => {
    expect(describeOutcome(rejected(status, code))).toEqual({ tone, title, badge: String(status) })
  })

  it('describes an unreachable API', () => {
    expect(describeOutcome({ kind: 'offline' })).toEqual({
      tone: 'neutral',
      title: "Can't reach the API",
      badge: 'offline',
    })
  })
})

describe('statusOf', () => {
  it('is the HTTP status, or null when there was no response', () => {
    expect(statusOf(rejected(429, 'rate_limited'))).toBe(429)
    expect(statusOf({ kind: 'offline' })).toBeNull()
  })
})

describe('changeText and coinCount', () => {
  it('lists the coins largest first, with a count for repeats', () => {
    expect(changeText(sale)).toBe('£2, 50p, 3 × 2p')
    expect(coinCount(sale)).toBe(5)
  })

  it('says when there is no change', () => {
    expect(changeText({ change: [], change_total: 0 })).toBe('no change')
  })
})
