import type { CoinCount, MachineState } from './api'

/** Total value of some coins, in pence. */
export function valueOf(coins: CoinCount[]): number {
  return coins.reduce((total, c) => total + c.denomination * c.count, 0)
}

/** What moved between two readings of the machine, so the UI can highlight it. */
export interface MachineChange {
  /** Denominations the machine paid out. */
  coins: number[]
  /** Whether money went into the cash box. */
  cashBox: boolean
}

export function diffMachine(previous: MachineState, next: MachineState): MachineChange {
  const before = new Map(previous.coins.map((c) => [c.denomination, c.count]))
  return {
    coins: next.coins
      .filter((c) => c.count < (before.get(c.denomination) ?? c.count))
      .map((c) => c.denomination),
    cashBox: next.cash_box > previous.cash_box,
  }
}
