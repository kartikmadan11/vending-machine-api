export interface Product {
  /** The code printed beside the row on a real machine, two rows of four. */
  slot: string
  name: string
  detail: string
  /** In pence, already discounted, as the API takes prices. */
  price: number
}

// Odd amounts make the change more interesting than round ones.
export const PRODUCTS: Product[] = [
  { slot: 'A1', name: 'Still water', detail: '500 ml', price: 85 },
  { slot: 'A2', name: 'Cola', detail: '330 ml can', price: 120 },
  { slot: 'A3', name: 'Orange juice', detail: '250 ml', price: 149 },
  { slot: 'A4', name: 'Flat white', detail: 'Hot, 8 oz', price: 215 },
  { slot: 'B1', name: 'Milk chocolate', detail: '45 g bar', price: 95 },
  { slot: 'B2', name: 'Sea salt crisps', detail: '40 g bag', price: 73 },
  { slot: 'B3', name: 'Oat cookie', detail: 'Single', price: 67 },
  { slot: 'B4', name: 'Mints', detail: 'Tin of 50', price: 38 },
]
