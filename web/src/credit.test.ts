import { describe, expect, it } from 'vitest'
import { leftAfter, payEach } from './credit'

describe('payEach', () => {
  it('pays for nothing with nothing inserted', () => {
    expect(payEach(0, 38, 1)).toBeNull()
    expect(payEach(0, 38, 4)).toBeNull()
  })

  it('pays everything inserted for one purchase, even short of the price, so the API can refuse it', () => {
    expect(payEach(200, 120, 1)).toBe(200)
    expect(payEach(100, 215, 1)).toBe(100)
  })

  it('pays the price for each purchase of a burst when what is inserted covers them all', () => {
    expect(payEach(200, 38, 4)).toBe(38)
    expect(payEach(152, 38, 4)).toBe(38)
    expect(payEach(151, 38, 4)).toBeNull()
  })
})

describe('leftAfter', () => {
  it('leaves nothing once one purchase sells, since the API returns the change', () => {
    expect(leftAfter(200, 200, 1)).toBe(0)
  })

  it('leaves everything when nothing sells', () => {
    expect(leftAfter(100, 100, 0)).toBe(100)
  })

  it('leaves what a burst did not spend, including the share of a purchase turned away', () => {
    expect(leftAfter(200, 38, 3)).toBe(86)
  })
})
