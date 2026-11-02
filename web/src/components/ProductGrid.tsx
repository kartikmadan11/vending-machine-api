import { formatPence } from '../money'
import { PRODUCTS, type Product } from '../products'

export type Selection = { kind: 'product'; product: Product } | { kind: 'custom' } | null

interface Props {
  selection: Selection
  onSelect: (selection: Selection) => void
}

const SHELVES = [...new Set(PRODUCTS.map((p) => p.slot[0]))]

/** The glass front: one shelf per row letter, each product sitting in its spiral. */
export function ProductGrid({ selection, onSelect }: Props) {
  return (
    <section className="window" aria-labelledby="choose-heading">
      <h2 id="choose-heading" className="sr-only">
        Choose an item
      </h2>
      <div className="window-inner">
        {SHELVES.map((row) => (
          <div key={row} className="shelf">
            {PRODUCTS.filter((p) => p.slot[0] === row).map((product) => (
              <button
                key={product.slot}
                type="button"
                className="slot"
                aria-pressed={selection?.kind === 'product' && selection.product.slot === product.slot}
                aria-label={`${product.slot}, ${product.name}, ${product.detail}, ${formatPence(product.price)}`}
                onClick={() => onSelect({ kind: 'product', product })}
              >
                <span className="slot-stage" aria-hidden>
                  <Coil depth="back" />
                  {/* The next one in the spiral, further back. */}
                  <img className="slot-image slot-image-behind" src={product.photo.src} alt="" />
                  <img className="slot-image" src={product.photo.src} alt="" />
                  <Coil depth="front" />
                </span>
                <span className="slot-label" aria-hidden>
                  <span className="slot-tag">
                    <span className="slot-code">{product.slot}</span>
                    <span className="slot-price">{formatPence(product.price)}</span>
                  </span>
                  <span className="slot-name">{product.name}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
        <span className="glass" aria-hidden />
      </div>
    </section>
  )
}

const TURNS = [0, 1, 2]

/**
 * The wire spiral, seen nearly end on from a little above, so each turn further back sits a
 * little higher. The product stands inside the first turn, so that turn is drawn over it and the
 * turns behind are drawn under it.
 */
function Coil({ depth }: { depth: 'front' | 'back' }) {
  const turns = depth === 'front' ? TURNS.slice(0, 1) : TURNS.slice(1)
  return (
    <svg className={`coil coil-${depth}`} viewBox="0 0 100 60" preserveAspectRatio="none">
      {turns.map((k) => {
        const rx = 46 - k * 3
        const ry = 25 - k * 2
        const cy = 33 - k * 6
        const d = `M ${50 - rx} ${cy} A ${rx} ${ry} 0 1 1 ${50 + rx} ${cy} A ${rx} ${ry} 0 1 1 ${50 - rx} ${cy}`
        return (
          <g key={k} className={`coil-turn coil-turn-${k}`}>
            <path className="coil-wire" d={d} />
            <path className="coil-shine" d={d} />
          </g>
        )
      })}
    </svg>
  )
}
