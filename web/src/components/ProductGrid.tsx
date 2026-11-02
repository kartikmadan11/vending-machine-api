import { formatPence } from '../money'
import { PRODUCTS, type Product } from '../products'

export type Selection = { kind: 'product'; product: Product } | { kind: 'custom' } | null

interface Props {
  selection: Selection
  onSelect: (selection: Selection) => void
  customPrice: string
  onCustomPrice: (pence: string) => void
}

export function ProductGrid({ selection, onSelect, customPrice, onCustomPrice }: Props) {
  const customSelected = selection?.kind === 'custom'
  return (
    <section className="card" aria-labelledby="choose-heading">
      <header className="card-head">
        <h2 id="choose-heading">
          <span className="step">1</span>Choose an item
        </h2>
        <p className="hint">Prices arrive already discounted</p>
      </header>
      <div className="products">
        {PRODUCTS.map((product) => (
          <button
            key={product.slot}
            type="button"
            className="product"
            aria-pressed={selection?.kind === 'product' && selection.product.slot === product.slot}
            onClick={() => onSelect({ kind: 'product', product })}
          >
            <span className="product-slot micro">{product.slot}</span>
            <span className="product-price">{formatPence(product.price)}</span>
            <span className="product-name">{product.name}</span>
            <span className="product-detail">{product.detail}</span>
          </button>
        ))}
        <label className="product product-custom" data-selected={customSelected}>
          <span className="product-slot micro">Keypad</span>
          <span className="product-name">Custom price</span>
          <span className="custom-input">
            <input
              inputMode="numeric"
              placeholder="Any whole pence"
              aria-label="Custom price in pence"
              value={customPrice}
              onFocus={() => onSelect({ kind: 'custom' })}
              onChange={(e) => {
                onSelect({ kind: 'custom' })
                onCustomPrice(e.target.value.replace(/\D/g, '').slice(0, 7))
              }}
            />
            <span className="custom-unit">p</span>
          </span>
        </label>
      </div>
    </section>
  )
}
