import { START_COMMAND, type MachineState } from '../api'
import { coinLabel, formatPence, metalOf, STARTING_COUNT, UK_COINS } from '../money'
import { valueOf, type MachineChange } from '../supply'
import { Coin } from './Coin'

export type Highlight = MachineChange & { key: number }

interface Props {
  machine: MachineState | null
  online: boolean | null
  highlight: Highlight | null
}

/** The coins left for change and the sealed cash box, as GET /machine reports them. */
export function MachinePanel({ machine, online, highlight }: Props) {
  const counts = new Map(machine?.coins.map((c) => [c.denomination, c.count]))
  const largestFirst = [...UK_COINS].reverse()

  return (
    <section className="card" aria-labelledby="machine-heading">
      <header className="card-head">
        <h2 id="machine-heading">Inside the machine</h2>
        <p className="hint">Never refilled until the API restarts</p>
      </header>

      {online === false && (
        <div className="callout tone-danger offline">
          <strong>The API is not running</strong>
          <p className="callout-body">Run this in another terminal, and the page reconnects.</p>
          <code className="callout-code">{START_COMMAND}</code>
        </div>
      )}

      <ul className="supply" aria-label="Coins left for change">
        {largestFirst.map((pence) => {
          const count = counts.get(pence)
          const flashed = highlight?.coins.includes(pence)
          return (
            <li key={pence} className="supply-row">
              {flashed && <span key={highlight?.key} className="supply-flash" aria-hidden />}
              <Coin denomination={pence} size={28} decorative />
              <span className="supply-label">{coinLabel(pence)}</span>
              <span className="supply-pips" aria-hidden>
                {Array.from({ length: Math.max(STARTING_COUNT, count ?? 0) }, (_, i) => (
                  <span
                    key={i}
                    className={count !== undefined && i < count ? `supply-pip on ${metalOf(pence)}` : 'supply-pip'}
                  />
                ))}
              </span>
              <span className={count === 0 ? 'supply-count supply-empty' : 'supply-count'}>
                {count === undefined ? '-' : count === 0 ? 'Empty' : `${count} left`}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="totals">
        <div className="total">
          <span className="total-label">Coins for change</span>
          <span className="total-value">{machine ? formatPence(valueOf(machine.coins)) : '-'}</span>
        </div>
        <div className="total">
          {highlight?.cashBox && <span key={highlight.key} className="supply-flash" aria-hidden />}
          <span className="total-label">Cash box, sealed</span>
          <span className="total-value">{machine ? formatPence(machine.cash_box) : '-'}</span>
        </div>
      </div>
    </section>
  )
}
