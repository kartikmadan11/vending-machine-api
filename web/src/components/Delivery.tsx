import { useState, type MouseEvent } from 'react'
import type { Attempt } from '../attempts'
import { coinSize } from '../money'
import { Coin } from './Coin'

// What the latest purchase, or each sale of a burst, drops out of the machine. The receipt says
// the same in words, so the cup is hidden from assistive technology. What is in the bin can be
// taken out, so each product there is a button.

/** The flap at the bottom, where what was bought falls. */
export function DeliveryBin({ attempts }: { attempts: Attempt[] }) {
  // The attempts whose product has been taken out. Every attempt has a new id, so a later sale
  // is never hidden by an earlier one.
  const [taken, setTaken] = useState<ReadonlySet<number>>(new Set())
  const sold = attempts.filter((a) => a.outcome.kind === 'sold')

  function take(event: MouseEvent<HTMLButtonElement>, id: number) {
    // The button is about to disappear, so keep focus in the bin if anything is left there.
    const button = event.currentTarget
    const rest = button.parentElement?.querySelectorAll<HTMLButtonElement>('.bin-item:not([data-taken="true"])')
    const next = [...(rest ?? [])].find((other) => other !== button)
    next?.focus()
    setTaken((current) => new Set(current).add(id))
  }

  return (
    <div className="bin">
      <div className="bin-opening">
        <div className="bin-items">
          {/* Keyed by attempt so it drops in again for every sale. One taken out keeps its
              place, so the rest stay where they fell. */}
          {sold.map((attempt) => (
            <button
              key={attempt.id}
              type="button"
              className="bin-item"
              data-taken={taken.has(attempt.id)}
              aria-label={`Take the ${attempt.product.name.toLowerCase()} from the bin`}
              onClick={(event) => take(event, attempt.id)}
            >
              <img src={attempt.product.photo.src} alt="" />
            </button>
          ))}
        </div>
        <span className="bin-flap" aria-hidden>
          Push
        </span>
      </div>
    </div>
  )
}

/** The cup beside it, where the change lands, every coin to scale. */
export function CoinCup({ attempts }: { attempts: Attempt[] }) {
  const coins = attempts.flatMap((attempt) =>
    attempt.outcome.kind === 'sold'
      ? attempt.outcome.sale.change.flatMap(({ denomination, count }) =>
          Array.from({ length: count }, (_, i) => ({ key: `${attempt.id}-${denomination}-${i}`, denomination })),
        )
      : [],
  )
  // A big payout piles up rather than overflowing the cup.
  const largest = coins.length <= 12 ? 40 : coins.length <= 24 ? 32 : 26
  return (
    <div className="cup" aria-hidden>
      <span className="cup-label">Change</span>
      <div className="cup-opening">
        {coins.map(({ key, denomination }) => (
          <Coin key={key} className="cup-coin" denomination={denomination} size={coinSize(denomination, largest)} decorative />
        ))}
      </div>
    </div>
  )
}
