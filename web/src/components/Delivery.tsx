import type { Attempt } from '../attempts'
import { coinSize } from '../money'
import { PRODUCTS } from '../products'
import { Coin } from './Coin'

// What the latest purchase, or each sale of a burst, drops out of the machine. The receipt says
// the same in words, so both are hidden from assistive technology.

/** The flap at the bottom, where what was bought falls. */
export function DeliveryBin({ attempts }: { attempts: Attempt[] }) {
  const sold = attempts.filter((a) => a.outcome.kind === 'sold')
  return (
    <div className="bin" aria-hidden>
      <div className="bin-opening">
        <div className="bin-items">
          {sold.map((attempt) => {
            const product = PRODUCTS.find((p) => p.slot === attempt.slot)
            // Keyed by attempt so it drops in again for every sale.
            return product ? (
              <img key={attempt.id} className="bin-item" src={product.photo.src} alt="" />
            ) : (
              <span key={attempt.id} className="bin-item parcel" />
            )
          })}
        </div>
        <span className="bin-flap">Push</span>
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
