import chocolate from './assets/products/chocolate.png'
import cola from './assets/products/cola.png'
import cookie from './assets/products/cookie.png'
import crisps from './assets/products/crisps.png'
import flatWhite from './assets/products/flat-white.png'
import mints from './assets/products/mints.png'
import orangeJuice from './assets/products/orange-juice.png'
import water from './assets/products/water.png'

/** Where each licence's terms live, for the credits. Public domain has none. */
export const LICENCES = {
  'Public domain': null,
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
} as const

export interface Photo {
  /** Cut out from its background, trimmed and resized. */
  src: string
  /** Its Wikimedia Commons page, which names the author. */
  page: string
  licence: keyof typeof LICENCES
}

export interface Product {
  /** The code printed beside the row on a real machine, two rows of four. */
  slot: string
  name: string
  detail: string
  /** In pence, already discounted, as the API takes prices. */
  price: number
  photo: Photo
}

const COMMONS = 'https://commons.wikimedia.org/wiki/File:'

// Odd amounts make the change more interesting than round ones.
export const PRODUCTS: Product[] = [
  {
    slot: 'A1',
    name: 'Still water',
    detail: '500 ml',
    price: 85,
    photo: { src: water, page: `${COMMONS}Balipure_bottle_PNG.png`, licence: 'CC BY-SA 4.0' },
  },
  {
    slot: 'A2',
    name: 'Cola',
    detail: '330 ml can',
    price: 120,
    photo: { src: cola, page: `${COMMONS}Diet-Coke-Can.png`, licence: 'Public domain' },
  },
  {
    slot: 'A3',
    name: 'Orange juice',
    detail: '250 ml',
    price: 149,
    photo: { src: orangeJuice, page: `${COMMONS}Orange_juice_2.jpg`, licence: 'Public domain' },
  },
  {
    slot: 'A4',
    name: 'Flat white',
    detail: 'Hot, 8 oz',
    price: 215,
    photo: { src: flatWhite, page: `${COMMONS}Paper_Cups_-_isolated.png`, licence: 'CC0' },
  },
  {
    slot: 'B1',
    name: 'Milk chocolate',
    detail: '45 g bar',
    price: 95,
    photo: { src: chocolate, page: `${COMMONS}Marabou_chocolate.png`, licence: 'CC BY-SA 4.0' },
  },
  {
    slot: 'B2',
    name: 'Sea salt crisps',
    detail: '40 g bag',
    price: 73,
    photo: {
      src: crisps,
      page: `${COMMONS}No_Name_corn_chips_(200_g),_Canada_(obverse),_2026-03-05.jpg`,
      licence: 'Public domain',
    },
  },
  {
    slot: 'B3',
    name: 'Oat cookie',
    detail: 'Single',
    price: 67,
    photo: { src: cookie, page: `${COMMONS}Cookie_with_seeds.png`, licence: 'CC BY-SA 4.0' },
  },
  {
    slot: 'B4',
    name: 'Mints',
    detail: 'Tin of 50',
    price: 38,
    photo: { src: mints, page: `${COMMONS}Cachou_lajaunie.png`, licence: 'CC BY-SA 3.0' },
  },
]
