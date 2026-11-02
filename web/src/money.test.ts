import { describe, expect, it } from 'vitest'
import { coinLabel, coinSize, formatPence, metalOf, UK_COINS } from './money'

describe('formatPence', () => {
  it.each([
    [0, '0p'],
    [85, '85p'],
    [100, '£1.00'],
    [120, '£1.20'],
    [2000, '£20.00'],
  ])('writes %i as %s', (pence, text) => {
    expect(formatPence(pence)).toBe(text)
  })
})

describe('coinLabel', () => {
  it.each([
    [1, '1p'],
    [50, '50p'],
    [100, '£1'],
    [200, '£2'],
    [1000, '£10'],
  ])('labels %i as %s', (pence, label) => {
    expect(coinLabel(pence)).toBe(label)
  })
})

describe('coinSize', () => {
  it('draws the £2 coin at the largest size', () => {
    expect(coinSize(200, 54)).toBe(54)
  })

  it('keeps the real order of sizes, so 5p is the smallest and 50p is bigger than £1', () => {
    const bySize = [...UK_COINS].sort((a, b) => coinSize(a, 540) - coinSize(b, 540))
    expect(bySize).toEqual([5, 1, 20, 100, 10, 2, 50, 200])
  })
})

describe('metalOf', () => {
  it('colours coins by their outer metal', () => {
    expect(UK_COINS.map(metalOf)).toEqual(['copper', 'copper', 'silver', 'silver', 'silver', 'silver', 'gold', 'gold'])
  })
})
