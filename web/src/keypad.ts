import { PRODUCTS, SHELVES } from './products'

/**
 * The code on the keypad after a key is pressed. A shelf letter starts a new code and a number
 * then finishes it, as on a real machine. A number that would not name a product is ignored, so
 * the code is always empty, a single letter or a product's slot.
 */
export function press(code: string, key: string): string {
  if (SHELVES.includes(key)) return key
  const next = code + key
  return code.length === 1 && PRODUCTS.some((p) => p.slot === next) ? next : code
}
