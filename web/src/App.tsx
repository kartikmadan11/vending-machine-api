import { useCallback, useEffect, useRef, useState } from 'react'
import { getMachine, purchase, type MachineState } from './api'
import { statusOf, type Attempt } from './attempts'
import { ActivityLog } from './components/ActivityLog'
import { CustomerPanel } from './components/CustomerPanel'
import { CoinCup, DeliveryBin } from './components/Delivery'
import { MachinePanel, type Highlight } from './components/MachinePanel'
import { BURST, PaymentPanel } from './components/PaymentPanel'
import { ProductGrid } from './components/ProductGrid'
import { Receipt } from './components/Receipt'
import { LICENCES, PRODUCTS } from './products'
import { recordOutcome, type Limits } from './rateWindow'
import { diffMachine } from './supply'

const POLL_MS = 2000
const LOG_SIZE = 50

export function App() {
  // The code on the keypad is the choice, as on a real machine. Tapping a product types its code.
  const [code, setCode] = useState('')
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
  // Numbers each GET /machine, and the newest that has answered.
  const asked = useRef(0)
  const answered = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++asked.current
    try {
      const next = await getMachine()
      // Over a real network answers can arrive out of order, and an older one must not undo a newer one.
      if (request < answered.current) return
      answered.current = request
      const previous = lastMachine.current
      lastMachine.current = next
      if (previous) {
        const change = diffMachine(previous, next)
        if (change.coins.length > 0 || change.cashBox) setHighlight({ ...change, key: Date.now() })
      }
      setMachine(next)
      setOnline(true)
    } catch {
      if (request < answered.current) return
      answered.current = request
      setOnline(false)
    }
  }, [])

  // Poll so the panel also shows purchases made elsewhere, such as with curl.
  useEffect(() => {
    void refresh()
    // A poll still waiting, as while a sleeping API wakes up, is not joined by another.
    const timer = setInterval(() => {
      if (answered.current === asked.current) void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const product = PRODUCTS.find((p) => p.slot === code) ?? null
  const paid = inserted.reduce((total, pence) => total + pence, 0)
  const customerId = customer.trim()
  const canBuy = product !== null && customerId !== '' && !pending && online !== false

  async function buy(times: number) {
    if (product === null) return
    const { price } = product
    // A burst with nothing inserted pays the exact price each time.
    const amount = times > 1 && paid === 0 ? price : paid
    setPending(true)
    const outcomes = await Promise.all(
      Array.from({ length: times }, () => purchase({ customer_id: customerId, price, paid: amount })),
    )
    const at = Date.now()
    const attempts = outcomes.map(
      (outcome): Attempt => ({
        id: nextId.current++,
        at,
        customer: customerId,
        product,
        paid: amount,
        outcome,
      }),
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

      <main className="scene">
        <section className="machine" aria-label="Vending machine">
          <div className="marquee" aria-hidden>
            <span className="marquee-title">Drinks &amp; Snacks</span>
            <span className="marquee-sub">Change in the fewest coins</span>
          </div>
          <div className="machine-body">
            <ProductGrid code={code} onSelect={setCode} />
            <PaymentPanel
              code={code}
              onCode={setCode}
              product={product}
              online={online}
              inserted={inserted}
              onInsert={(pence) => setInserted((current) => [...current, pence])}
              onReturn={() => setInserted([])}
              canBuy={canBuy}
              onBuy={() => void buy(1)}
              onBurst={() => void buy(BURST)}
            />
            <div className="outlets">
              <DeliveryBin attempts={latest} />
              <CoinCup attempts={latest} />
            </div>
          </div>
          <div className="machine-base" aria-hidden />
        </section>

        <div className="side">
          <CustomerPanel customer={customer} onCustomer={setCustomer} limits={limits} />
          <Receipt attempts={latest} />
          <MachinePanel machine={machine} online={online} highlight={highlight} />
          <ActivityLog attempts={log} onClear={() => setLog([])} />
        </div>
      </main>

      <footer className="credits">
        Product photos from Wikimedia Commons, cut out and resized:{' '}
        {PRODUCTS.map(({ slot, name, photo }, i) => {
          const terms = LICENCES[photo.licence]
          return (
            <span key={slot}>
              {i > 0 && ', '}
              <a href={photo.page} target="_blank" rel="noreferrer">
                {name}
              </a>{' '}
              (
              {terms ? (
                <a href={terms} target="_blank" rel="noreferrer">
                  {photo.licence}
                </a>
              ) : (
                photo.licence
              )}
              )
            </span>
          )
        })}
        .
      </footer>
    </div>
  )
}
