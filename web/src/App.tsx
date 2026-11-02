import { useCallback, useEffect, useRef, useState } from 'react'
import { getMachine, purchase, type MachineState } from './api'
import { statusOf, type Attempt } from './attempts'
import { ActivityLog } from './components/ActivityLog'
import { ChangeTray } from './components/ChangeTray'
import { MachinePanel, type Highlight } from './components/MachinePanel'
import { BURST, PaymentPanel } from './components/PaymentPanel'
import { ProductGrid, type Selection } from './components/ProductGrid'
import { recordOutcome, type Limits } from './rateWindow'
import { diffMachine } from './supply'

const POLL_MS = 2000
const LOG_SIZE = 50

export function App() {
  const [selection, setSelection] = useState<Selection>(null)
  const [customPrice, setCustomPrice] = useState('')
  const [customer, setCustomer] = useState('alice')
  const [inserted, setInserted] = useState<number[]>([])
  const [limits, setLimits] = useState<Limits>({})
  const [latest, setLatest] = useState<Attempt[]>([])
  const [log, setLog] = useState<Attempt[]>([])
  const [machine, setMachine] = useState<MachineState | null>(null)
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const lastMachine = useRef<MachineState | null>(null)
  const nextId = useRef(1)

  const refresh = useCallback(async () => {
    try {
      const next = await getMachine()
      const previous = lastMachine.current
      lastMachine.current = next
      if (previous) {
        const change = diffMachine(previous, next)
        if (change.coins.length > 0 || change.cashBox) setHighlight({ ...change, key: Date.now() })
      }
      setMachine(next)
      setOnline(true)
    } catch {
      setOnline(false)
    }
  }, [])

  // Poll so the panel also shows purchases made elsewhere, such as with curl.
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const item =
    selection?.kind === 'product' ? selection.product.name : selection?.kind === 'custom' ? 'Custom item' : null
  const price =
    selection?.kind === 'product'
      ? selection.product.price
      : selection?.kind === 'custom' && customPrice !== ''
        ? Number(customPrice)
        : null
  const paid = inserted.reduce((total, pence) => total + pence, 0)
  const customerId = customer.trim()
  const canBuy = item !== null && price !== null && customerId !== '' && !pending && online !== false

  async function buy(times: number) {
    if (item === null || price === null) return
    // A burst with nothing inserted pays the exact price each time.
    const amount = times > 1 && paid === 0 ? price : paid
    setPending(true)
    const outcomes = await Promise.all(
      Array.from({ length: times }, () => purchase({ customer_id: customerId, price, paid: amount })),
    )
    const at = Date.now()
    const attempts = outcomes.map(
      (outcome): Attempt => ({ id: nextId.current++, at, customer: customerId, item, price, paid: amount, outcome }),
    )
    setLimits((current) =>
      attempts.reduce(
        (acc, { customer, outcome }) =>
          recordOutcome(
            acc,
            customer,
            statusOf(outcome),
            at,
            outcome.kind === 'rejected' ? outcome.retryAfter : null,
          ),
        current,
      ),
    )
    setLatest(attempts)
    setLog((current) => [...attempts.toReversed(), ...current].slice(0, LOG_SIZE))
    if (outcomes.some((o) => o.kind === 'sold')) setInserted([])
    setPending(false)
    await refresh()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>vending-machine-api</h1>
          <p>Pays out the fewest coins from a supply that is never refilled.</p>
        </div>
        <div className="topbar-actions">
          <span className="status" data-state={online === null ? 'unknown' : online ? 'online' : 'offline'}>
            <span className="status-dot" aria-hidden />
            {online === null ? 'Connecting' : online ? 'API connected' : 'API offline'}
          </span>
          <a className="link" href={`${__API_URL__}/docs`} target="_blank" rel="noreferrer">
            API docs
          </a>
        </div>
      </header>

      <main className="layout">
        <div className="column">
          <ProductGrid
            selection={selection}
            onSelect={setSelection}
            customPrice={customPrice}
            onCustomPrice={setCustomPrice}
          />
          <PaymentPanel
            customer={customer}
            onCustomer={setCustomer}
            limits={limits}
            inserted={inserted}
            onInsert={(pence) => setInserted((current) => [...current, pence])}
            onReturn={() => setInserted([])}
            item={item}
            price={price}
            canBuy={canBuy}
            onBuy={() => void buy(1)}
            onBurst={() => void buy(BURST)}
          />
        </div>
        <div className="column">
          <ChangeTray attempts={latest} />
          <MachinePanel machine={machine} online={online} highlight={highlight} />
          <ActivityLog attempts={log} onClear={() => setLog([])} />
        </div>
      </main>
    </div>
  )
}
