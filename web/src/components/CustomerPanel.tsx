import { LIMIT, meter, type Limits } from '../rateWindow'
import { useNow } from '../useNow'

const CUSTOMERS = ['alice', 'bob', 'carol']

interface Props {
  customer: string
  onCustomer: (customer: string) => void
  limits: Limits
}

/** Who is standing at the machine. The rate limit is per customer, so it lives here too. */
export function CustomerPanel({ customer, onCustomer, limits }: Props) {
  return (
    <section className="panel" aria-labelledby="customer-heading">
      <header className="panel-head">
        <h2 id="customer-heading">Customer</h2>
        <RateMeter limits={limits} customer={customer.trim()} />
      </header>
      <div className="customers" role="group" aria-labelledby="customer-heading">
        {CUSTOMERS.map((name) => (
          <button
            key={name}
            type="button"
            className="chip"
            aria-pressed={customer === name}
            onClick={() => onCustomer(name)}
          >
            <span className="avatar" aria-hidden>
              {name[0].toUpperCase()}
            </span>
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
    </section>
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
