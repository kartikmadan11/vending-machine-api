import { describe, expect, it } from 'vitest'
import { press } from './keypad'
import { NUMBERS, PRODUCTS, SHELVES } from './products'

function type(...keys: string[]): string {
  return keys.reduce(press, '')
}

describe('press', () => {
  it('starts a code with a shelf letter and finishes it with a number', () => {
    expect(type('A')).toBe('A')
    expect(type('A', '2')).toBe('A2')
  })

  it('starts again on another letter, whether or not the code was finished', () => {
    expect(type('A', 'B')).toBe('B')
    expect(type('A', '2', 'B')).toBe('B')
  })

  it('ignores a number with no letter before it', () => {
    expect(type('2')).toBe('')
  })

  it('ignores a number once the code is finished', () => {
    expect(type('A', '2', '3')).toBe('A2')
  })

  it('ignores a number that names no product', () => {
    expect(type('A', '9')).toBe('A')
  })

  it('has a key for every letter and number in the codes', () => {
    expect(SHELVES).toEqual(['A', 'B'])
    expect(NUMBERS).toEqual(['1', '2', '3', '4'])
    for (const { slot } of PRODUCTS) expect(type(slot[0], slot.slice(1))).toBe(slot)
  })
})
