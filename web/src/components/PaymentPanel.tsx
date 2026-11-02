import type { CSSProperties } from 'react'
import { press } from '../keypad'
import { formatPence, coinLabel, coinSize, NOTES, UK_COINS } from '../money'
import { NUMBERS, SHELVES, type Product } from '../products'
import { LIMIT } from '../rateWindow'
import { Coin } from './Coin'

export const BURST = 4

interface Props {
  code: string
  onCode: (code: string) => void
  /** The product the code names, once it is finished. */
  product: Product | null
  online: boolean | null
  inserted: number[]
  onInsert: (pence: number) => void
  onReturn: () => void
  canBuy: boolean
  onBuy: () => void
  onBurst: () => void
}

/** The column beside the glass: display, keypad, coin slot, note reader and buttons. */
export function PaymentPanel(props: Props) {
  const { product, inserted, onInsert, onReturn, canBuy } = props
  const paid = inserted.reduce((total, pence) => total + pence, 0)

  return (
    <section className="controls" aria-labelledby="pay-heading">
      <h2 id="pay-heading" className="sr-only">
        Pay
      </h2>
      <Display code={props.code} product={product} online={props.online} paid={paid} />

      <Keypad code={props.code} onCode={props.onCode} />

      <div className="money" role="group" aria-labelledby="money-label">
        <span className="panel-label" id="money-label">
          Insert money
        </span>
        <div className="coin-entry">
          <span className="coin-slot" aria-hidden />
          <div className="coin-buttons">
            {UK_COINS.map((pence) => (
              <button
                key={pence}
                type="button"
                className="coin-button"
                // The stylesheet sizes the coin from this, so it can shrink them on a phone.
                style={{ '--coin': coinSize(pence, 50) } as CSSProperties}
                aria-label={`Insert ${coinLabel(pence)}`}
                onClick={() => onInsert(pence)}
              >
                <Coin denomination={pence} size={coinSize(pence, 50)} decorative />
              </button>
            ))}
          </div>
        </div>
        <span className="note-slot" aria-hidden />
        <div className="note-buttons">
          {NOTES.map((pence) => (
            <button
              key={pence}
              type="button"
              className={`note note-${pence / 100}`}
              aria-label={`Insert a ${coinLabel(pence)} note`}
              onClick={() => onInsert(pence)}
            >
              <span className="note-value">{coinLabel(pence)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="actions">
        <button type="button" className="vend-button" onClick={props.onBuy} disabled={!canBuy}>
          {product === null ? (
            'Choose an item'
          ) : (
            <>
              Buy {product.name} for <span className="amount">{formatPence(product.price)}</span>
            </>
          )}
        </button>
        <div className="action-row">
          <button type="button" className="panel-button" onClick={onReturn} disabled={paid === 0}>
            Return money
          </button>
          <button
            type="button"
            className="panel-button"
            onClick={props.onBurst}
            disabled={!canBuy}
            title={`Sends ${BURST} purchases at the same moment. Only ${LIMIT} get through in any 5 seconds.`}
          >
            Send {BURST} at once
          </button>
        </div>
      </div>
    </section>
  )
}

interface DisplayProps {
  code: string
  product: Product | null
  online: boolean | null
  paid: number
}

function Display({ code, product, online, paid }: DisplayProps) {
  const price = product?.price ?? null
  const due = price === null ? null : paid - price
  const short = due !== null && due < 0
  const heading =
    online === false
      ? 'Out of service'
      : product
        ? `${product.slot} ${product.name}, ${product.detail}`
        : code !== ''
          ? `Shelf ${code}, now its number`
          : 'Choose an item'
  return (
    <div className="display" aria-live="polite" data-offline={online === false}>
      <span className="display-heading">{heading}</span>
      <span className="display-main">
        <span className="display-label">Inserted</span>
        <span className="display-value">{formatPence(paid)}</span>
      </span>
      <span className="display-row">
        <span className="display-cell">
          <span className="display-label">Price</span>
          <span className="display-small">{price === null ? '-' : formatPence(price)}</span>
        </span>
        <span className="display-cell">
          <span className="display-label">{short ? 'Still to pay' : 'Change due'}</span>
          <span className={`display-small${short ? ' display-short' : ''}`}>
            {due === null ? '-' : formatPence(Math.abs(due))}
          </span>
        </span>
      </span>
    </div>
  )
}

/** Types a product's code: its shelf letter, then its number along the shelf. */
function Keypad({ code, onCode }: { code: string; onCode: (code: string) => void }) {
  return (
    <div className="keypad" data-entered={code !== ''}>
      <div className="keypad-screen">
        <span className="panel-label" id="keypad-label">
          Enter a code
        </span>
        {/* The display above says the same in words. */}
        <span className="keypad-code" aria-hidden>
          {[0, 1].map((i) => (
            <span key={i} className="keypad-char" data-empty={code[i] === undefined}>
              {code[i] ?? '-'}
            </span>
          ))}
        </span>
      </div>
      <div className="keys" role="group" aria-labelledby="keypad-label">
        {SHELVES.map((key) => (
          <button key={key} type="button" className="key" onClick={() => onCode(press(code, key))}>
            {key}
          </button>
        ))}
        <button type="button" className="key key-clear" onClick={() => onCode('')}>
          Clear
        </button>
        {NUMBERS.map((key) => (
          <button key={key} type="button" className="key" onClick={() => onCode(press(code, key))}>
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}
