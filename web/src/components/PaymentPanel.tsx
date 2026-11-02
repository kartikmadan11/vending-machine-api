import type { CSSProperties } from 'react'
import { formatPence, coinLabel, coinSize, NOTES, UK_COINS } from '../money'
import { LIMIT } from '../rateWindow'
import { Coin } from './Coin'
import type { Selection } from './ProductGrid'

export const BURST = 4

/** The most digits the custom price takes, so a price stays well inside what the API accepts. */
const MAX_DIGITS = 7
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'] as const

interface Props {
  selection: Selection
  online: boolean | null
  customPrice: string
  onCustomPrice: (pence: string) => void
  onSelectCustom: () => void
  inserted: number[]
  onInsert: (pence: number) => void
  onReturn: () => void
  item: string | null
  price: number | null
  canBuy: boolean
  onBuy: () => void
  onBurst: () => void
}

/** The column beside the glass: display, keypad, coin slot, note reader and buttons. */
export function PaymentPanel(props: Props) {
  const { inserted, onInsert, onReturn, item, price, canBuy } = props
  const paid = inserted.reduce((total, pence) => total + pence, 0)

  return (
    <section className="controls" aria-labelledby="pay-heading">
      <h2 id="pay-heading" className="sr-only">
        Pay
      </h2>
      <Display selection={props.selection} online={props.online} paid={paid} price={price} />

      <Keypad
        value={props.customPrice}
        selected={props.selection?.kind === 'custom'}
        onChange={(pence) => {
          props.onSelectCustom()
          props.onCustomPrice(pence.replace(/\D/g, '').slice(0, MAX_DIGITS))
        }}
        onFocus={props.onSelectCustom}
      />

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
          {item === null || price === null ? (
            'Choose an item'
          ) : (
            <>
              Buy {item} for <span className="amount">{formatPence(price)}</span>
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
  selection: Selection
  online: boolean | null
  paid: number
  price: number | null
}

function Display({ selection, online, paid, price }: DisplayProps) {
  const due = price === null ? null : paid - price
  const short = due !== null && due < 0
  const heading =
    online === false
      ? 'Out of service'
      : selection?.kind === 'product'
        ? `${selection.product.slot} ${selection.product.name}, ${selection.product.detail}`
        : selection?.kind === 'custom'
          ? 'Custom price'
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

interface KeypadProps {
  value: string
  selected: boolean
  onChange: (pence: string) => void
  onFocus: () => void
}

/** Any whole number of pence, typed on the keys or into the field. */
function Keypad({ value, selected, onChange, onFocus }: KeypadProps) {
  function press(key: (typeof KEYS)[number]) {
    if (key === 'C') onChange('')
    else if (key === '⌫') onChange(value.slice(0, -1))
    else onChange(value + key)
  }
  return (
    <div className="keypad" data-selected={selected}>
      <label className="keypad-screen">
        <span className="panel-label">Custom price</span>
        <span className="keypad-field">
          <input
            inputMode="numeric"
            placeholder="Any pence"
            aria-label="Custom price in pence"
            value={value}
            onFocus={onFocus}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="keypad-unit">p</span>
        </span>
      </label>
      <div className="keys" role="group" aria-label="Keypad">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`key${key === 'C' || key === '⌫' ? ' key-edit' : ''}`}
            aria-label={key === 'C' ? 'Clear the custom price' : key === '⌫' ? 'Delete the last digit' : undefined}
            onClick={() => press(key)}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  )
}
