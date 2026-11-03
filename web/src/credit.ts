/**
 * How the money inserted pays for a purchase, or for a burst of them, and what is left inserted.
 *
 * One purchase pays everything inserted and the API returns the change, as on a real machine. A
 * burst pays the exact price for each purchase out of what is inserted, so it needs enough for all
 * of them, and what the sales do not use stays inserted, to be spent or returned.
 */

/** What each of `times` purchases pays, or null when what is inserted cannot pay for them. */
export function payEach(inserted: number, price: number, times: number): number | null {
  if (inserted <= 0) return null
  if (times === 1) return inserted
  return inserted >= price * times ? price : null
}

/** What is still inserted after `sold` purchases that each paid `each`. */
export function leftAfter(inserted: number, each: number, sold: number): number {
  return inserted - each * sold
}
