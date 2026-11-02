import type { CSSProperties } from 'react'
import { formatPence, coinLabel, coinSize, NOTES, UK_COINS } from '../money'
import { LIMIT, meter, type Limits } from '../rateWindow'
import { useNow } from '../useNow'
import { Coin } from './Coin'

const CUSTOMERS = ['alice', 'bob', 'carol']
export const BURST = 4

interface Props {
  customer: string
  onCustomer: (customer: string) => void
  limits: Limits
  inserted: number[]
  onInsert: (pence: number) => void
  onReturn: () => void
  item: string | null
  price: number | null
  canBuy: boolean
  onBuy: () => void
  onBurst: () => void
}

export function PaymentPanel(props: Props) {
  const { customer, onCustomer, inserted, onInsert, onReturn, item, price, canBuy } = props
  const paid = inserted.reduce((total, pence) => total + pence, 0)

  return (
    <section className="card" aria-labelledby="pay-heading">
      <header className="card-head">
        <h2 id="pay-heading">
          <span className="step">2</span>Pay
        </h2>
        <p className="hint">Coins and notes go into a sealed cash box</p>
      </header>

      <div className="pay-section">
        <div className="section-row">
          <span className="field-label" id="customer-label">
            Customer
          </span>
          <RateMeter limits={props.limits} customer={customer.trim()} />
        </div>
        <div className="customers" role="group" aria-labelledby="customer-label">
          {CUSTOMERS.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              aria-pressed={customer === name}
              onClick={() => onCustomer(name)}
            >
              {name}
            </button>
          ))}
          <input
            className="chip-input"
            aria-label="Customer id"
            placeholder="Other id"
            maxLength={64}
            value={CUSTOMERS.includes(customer) ? '' : customer}
            onChange={(e) => onCustomer(e.target.value)}
          />
        </div>
      </div>

      <div className="pay-section">
        <span className="field-label">Insert money</span>
        <div className="money-slot">
          <div className="coin-buttons">
            {UK_COINS.map((pence) => (
              <button
                key={pence}
                type="button"
                className="coin-button"
                // The stylesheet sizes the coin from this, so it can shrink them on a phone.
                style={{ '--coin': coinSize(pence, 54) } as CSSProperties}
                aria-label={`Insert ${coinLabel(pence)}`}
                onClick={() => onInsert(pence)}
              >
                <Coin denomination={pence} size={coinSize(pence, 54)} decorative />
              </button>
            ))}
          </div>
          <div className="note-buttons">
            {NOTES.map((pence) => (
              <button
                key={pence}
                type="button"
                className={`note note-${pence / 100}`}
                aria-label={`Insert a ${coinLabel(pence)} note`}
                onClick={() => onInsert(pence)}
              >
                {coinLabel(pence)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Display paid={paid} item={item} price={price} />

      <div className="actions">
        <button type="button" className="button" onClick={onReturn} disabled={paid === 0}>
          Return money
        </button>
        <button type="button" className="button button-primary" onClick={props.onBuy} disabled={!canBuy}>
          {item === null || price === null ? (
            'Choose an item'
          ) : (
            <>
              Buy {item} for <span className="amount">{formatPence(price)}</span>
            </>
          )}
        </button>
        <button
          type="button"
          className="button button-ghost"
          onClick={props.onBurst}
          disabled={!canBuy}
          title={`Sends ${BURST} purchases at the same moment. Only ${LIMIT} get through in any 5 seconds.`}
        >
          Send {BURST} at once
        </button>
      </div>
    </section>
  )
}

function Display({ paid, item, price }: { paid: number; item: string | null; price: number | null }) {
  const due = price === null ? null : paid - price
  return (
    <div className="display" aria-live="polite">
      <div className="display-cell display-main">
        <span className="display-label">Inserted</span>
        <span className="display-value">{formatPence(paid)}</span>
      </div>
      <div className="display-cell">
        <span className="display-label">{item ?? 'Price'}</span>
        <span className="display-value">{price === null ? '-' : formatPence(price)}</span>
      </div>
      <div className="display-cell">
        <span className="display-label">{due !== null && due < 0 ? 'Still to pay' : 'Change due'}</span>
        <span className={`display-value${due !== null && due < 0 ? ' display-short' : ''}`}>
          {due === null ? '-' : formatPence(Math.abs(due))}
        </span>
      </div>
    </div>
  )
}

function RateMeter({ limits, customer }: { limits: Limits; customer: string }) {
  const now = useNow(200)
  const { used, freeInMs, blockedMs } = meter(limits, customer, now)
  const state = blockedMs > 0 ? 'blocked' : used >= LIMIT ? 'full' : 'open'
  const text =
    state === 'blocked'
      ? `Turned away, try in ${Math.ceil(blockedMs / 1000)}s`
      : state === 'full'
        ? `Limit used, next in ${Math.ceil(freeInMs / 1000)}s`
        : `${used} of ${LIMIT} in the last 5s`
  return (
    <span className="meter" data-state={state} aria-live="polite">
      <span className="pips" aria-hidden>
        {Array.from({ length: LIMIT }, (_, i) => (
          <span key={i} className={i < used ? 'pip on' : 'pip'} />
        ))}
      </span>
      {text}
    </span>
  )
}
