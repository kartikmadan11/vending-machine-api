import { describe, expect, it } from 'vitest'
import type { MachineState } from './api'
import { STARTING_COUNT, UK_COINS } from './money'
import { diffMachine, valueOf } from './supply'

function machine(counts: Partial<Record<number, number>> = {}, cashBox = 0): MachineState {
  return {
    coins: UK_COINS.map((denomination) => ({ denomination, count: counts[denomination] ?? STARTING_COUNT })),
    cash_box: cashBox,
  }
}

describe('valueOf', () => {
  it('adds up a full machine to £38.80', () => {
    expect(valueOf(machine().coins)).toBe(3880)
  })
})

describe('diffMachine', () => {
  it('finds the coins paid out and the money paid in', () => {
    expect(diffMachine(machine(), machine({ 50: 9, 20: 9 }, 200))).toEqual({ coins: [20, 50], cashBox: true })
  })

  it('finds nothing when the machine did not change', () => {
    expect(diffMachine(machine(), machine())).toEqual({ coins: [], cashBox: false })
  })

  it('ignores counts going up, as when the API restarts', () => {
    expect(diffMachine(machine({ 1: 0 }, 500), machine())).toEqual({ coins: [], cashBox: false })
  })
})
