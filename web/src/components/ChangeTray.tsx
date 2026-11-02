import { START_COMMAND } from '../api'
import { changeText, coinCount, describe, type Attempt } from '../attempts'
import { coinSize, formatPence } from '../money'
import { LIMIT } from '../rateWindow'
import { useNow } from '../useNow'
import { Coin } from './Coin'

/** Shows the answer to the latest purchase, or to each request of a burst. */
export function ChangeTray({ attempts }: { attempts: Attempt[] }) {
  return (
    <section className="card" aria-labelledby="change-heading">
      <header className="card-head">
        <h2 id="change-heading">
          <span className="step">3</span>Collect your change
        </h2>
        <p className="hint">Fewest coins it can make</p>
      </header>
      <div aria-live="polite">
        {attempts.length === 0 && <p className="tray tray-empty">Your change will land here.</p>}
        {attempts.length === 1 && <Single attempt={attempts[0]} />}
        {attempts.length > 1 && <Burst attempts={attempts} />}
      </div>
    </section>
  )
}

function Single({ attempt }: { attempt: Attempt }) {
  const { outcome } = attempt
  const { tone, title, badge } = describe(outcome)
  if (outcome.kind === 'sold') {
    const { sale } = outcome
    return (
      <div className="tray">
        <div className="tray-head">
          <span className={`badge tone-${tone}`}>{badge}</span>
          <strong>
            {title}: {attempt.item}
          </strong>
          <span className="tray-meta">
            Paid {formatPence(attempt.paid)},{' '}
            {sale.change_total === 0
              ? 'exact, so no change'
              : `change ${formatPence(sale.change_total)} in ${plural(coinCount(sale), 'coin')}`}
          </span>
        </div>
        {sale.change.length > 0 && (
          // Keyed by attempt so the coins drop in again for every sale.
          <div className="tray-coins" key={attempt.id}>
            {sale.change.flatMap(({ denomination, count }) =>
              Array.from({ length: count }, (_, i) => (
                <Coin
                  key={`${denomination}-${i}`}
                  className="tray-coin"
                  denomination={denomination}
                  size={coinSize(denomination, 52)}
                />
              )),
            )}
          </div>
        )}
      </div>
    )
  }
  return (
    <div className={`callout tone-${tone}`} key={attempt.id}>
      <div className="callout-head">
        <span className={`badge tone-${tone}`}>{badge}</span>
        <strong>{title}</strong>
      </div>
      <p className="callout-body">
        <Explanation attempt={attempt} />
      </p>
      {outcome.kind === 'rejected' && (
        <code className="callout-code">
          {outcome.code}: {outcome.message}
        </code>
      )}
      {outcome.kind === 'offline' && <code className="callout-code">{START_COMMAND}</code>}
    </div>
  )
}

function Explanation({ attempt }: { attempt: Attempt }) {
  const { outcome } = attempt
  if (outcome.kind === 'offline') {
    return <>Run this in another terminal and try again.</>
  }
  if (outcome.kind === 'sold') return null
  switch (outcome.code) {
    case 'insufficient_payment':
      return <>Nothing was taken. Insert {formatPence(attempt.price - attempt.paid)} more and try again.</>
    case 'cannot_make_change':
      return (
        <>
          The coins left cannot make {formatPence(attempt.paid - attempt.price)} exactly, so the sale was
          refused and the machine is unchanged.
        </>
      )
    case 'rate_limited':
      return <Countdown attempt={attempt} seconds={outcome.retryAfter ?? 1} />
    case 'invalid_amount':
      return <>Prices and payments must be zero or more pence.</>
    default:
      return <>The API did not accept the request.</>
  }
}

function Countdown({ attempt, seconds }: { attempt: Attempt; seconds: number }) {
  const now = Math.max(useNow(200), attempt.at)
  const left = Math.ceil((attempt.at + seconds * 1000 - now) / 1000)
  return (
    <>
      {attempt.customer} has made {LIMIT} purchase attempts in the last 5 seconds, so the price was not even
      looked at. {left > 0 ? `Try again in ${left}s.` : 'They can try again now.'}
    </>
  )
}

function Burst({ attempts }: { attempts: Attempt[] }) {
  return (
    <ol className="burst">
      {attempts.map((attempt) => {
        const { tone, title, badge } = describe(attempt.outcome)
        const { outcome } = attempt
        return (
          <li key={attempt.id} className="burst-row">
            <span className={`badge tone-${tone}`}>{badge}</span>
            <span className="burst-title">{title}</span>
            <span className="burst-detail">
              {outcome.kind === 'sold'
                ? changeText(outcome.sale)
                : outcome.kind === 'rejected' && outcome.retryAfter !== null
                  ? `retry after ${outcome.retryAfter}s`
                  : outcome.kind === 'rejected'
                    ? outcome.code
                    : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
