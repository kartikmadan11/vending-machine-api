import { changeText, describe, type Attempt } from '../attempts'
import { formatPence } from '../money'

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function ActivityLog({ attempts, onClear }: { attempts: Attempt[]; onClear: () => void }) {
  return (
    <section className="panel" aria-labelledby="log-heading">
      <header className="panel-head">
        <h2 id="log-heading">Activity</h2>
        <button type="button" className="text-button" onClick={onClear} disabled={attempts.length === 0}>
          Clear
        </button>
      </header>
      {attempts.length === 0 ? (
        <p className="empty">Every request and the API's answer will be listed here.</p>
      ) : (
        <ol className="log">
          {attempts.map((attempt) => {
            const { outcome } = attempt
            const { tone, title, badge } = describe(outcome)
            return (
              <li key={attempt.id} className="log-row">
                <time className="log-time" dateTime={new Date(attempt.at).toISOString()}>
                  {time.format(attempt.at)}
                </time>
                <span className="log-main">
                  <span className="log-title">
                    <span className="log-customer">{attempt.customer}</span> {attempt.product.name},{' '}
                    {formatPence(attempt.product.price)}, paid {formatPence(attempt.paid)}
                  </span>
                  <span className="log-detail">
                    {title}
                    {outcome.kind === 'sold' && `: ${changeText(outcome.sale)}`}
                    {outcome.kind === 'rejected' && `: ${outcome.message}`}
                  </span>
                </span>
                <span className={`badge tone-${tone}`}>{badge}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
