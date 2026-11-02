/** UK coins in pence, smallest first, as the API lists them. */
export const UK_COINS = [1, 2, 5, 10, 20, 50, 100, 200] as const

/** Notes a customer can pay with. They go into the cash box, so they are never given as change. */
export const NOTES = [500, 1000, 2000] as const

/** How many of each coin the machine starts with. It is never refilled. */
export const STARTING_COUNT = 10

/** Real diameters in millimetres, so coins on screen keep their true relative sizes. */
const DIAMETER_MM: Record<number, number> = {
  1: 20.3,
  2: 25.9,
  5: 18,
  10: 24.5,
  20: 21.4,
  50: 27.3,
  100: 23.43,
  200: 28.4,
}

const pounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

/** Writes an amount the way UK prices are written: 85 is "85p", 120 is "£1.20". */
export function formatPence(pence: number): string {
  return Math.abs(pence) < 100 ? `${pence}p` : pounds.format(pence / 100)
}

/** The label stamped on a coin or note: 50 is "50p", 200 is "£2". */
export function coinLabel(pence: number): string {
  return pence >= 100 ? `£${pence / 100}` : `${pence}p`
}

/** On-screen diameter of a coin, scaled so that a £2 coin is `largest` pixels across. */
export function coinSize(pence: number, largest: number): number {
  return Math.round((largest * DIAMETER_MM[pence]) / DIAMETER_MM[200])
}

export type Metal = 'copper' | 'silver' | 'gold'

/** The colour of a coin's outer metal. £1 and £2 have a gold-coloured outer ring. */
export function metalOf(pence: number): Metal {
  if (pence <= 2) return 'copper'
  if (pence <= 50) return 'silver'
  return 'gold'
}
