/** Client for the vending machine API. Requests go to /api, which Vite forwards to FastAPI. */

export interface CoinCount {
  denomination: number
  count: number
}

export interface MachineState {
  coins: CoinCount[]
  cash_box: number
}

export interface Sale {
  change: CoinCount[]
  change_total: number
}

export interface PurchaseRequest {
  customer_id: string
  price: number
  paid: number
}

export type PurchaseOutcome =
  | { kind: 'sold'; status: number; sale: Sale }
  | { kind: 'rejected'; status: number; code: string; message: string; retryAfter: number | null }
  | { kind: 'offline' }

const BASE = '/api'

/**
 * What to run when the API is down, shown wherever the page says so.
 * Null when the API is not on this computer, as on a deployed site, where there is nothing to run.
 */
export const START_COMMAND: string | null = isLocal(__API_URL__) ? 'uv run uvicorn vending.api:app' : null

/** What a proxy answers when nothing is behind it. The API itself never sends these. */
const GATEWAY_ERRORS = new Set([502, 503, 504])

export async function purchase(
  request: PurchaseRequest,
  fetchFn: typeof fetch = fetch,
): Promise<PurchaseOutcome> {
  let response: Response
  let text: string
  try {
    response = await fetchFn(`${BASE}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    text = await response.text()
  } catch {
    return { kind: 'offline' }
  }
  // The dev server's proxy answers with an empty 5xx when the API is not running, and Vercel
  // answers with a 502, 503 or 504 and a page of its own.
  if ((text === '' && response.status >= 500) || GATEWAY_ERRORS.has(response.status)) {
    return { kind: 'offline' }
  }
  const body = parseJson(text)
  if (response.ok) return { kind: 'sold', status: response.status, sale: body as Sale }
  const retryAfter = Number(response.headers.get('Retry-After'))
  return {
    kind: 'rejected',
    status: response.status,
    ...errorOf(body, response.status),
    retryAfter: retryAfter > 0 ? retryAfter : null,
  }
}

export async function getMachine(fetchFn: typeof fetch = fetch): Promise<MachineState> {
  const response = await fetchFn(`${BASE}/machine`)
  if (!response.ok) throw new Error(`GET /machine returned ${response.status}`)
  return (await response.json()) as MachineState
}

function isLocal(url: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

interface FieldError {
  loc?: (string | number)[]
  msg?: string
}

function errorOf(body: unknown, status: number): { code: string; message: string } {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (detail && typeof detail === 'object' && 'code' in detail && 'message' in detail) {
    return { code: String(detail.code), message: String(detail.message) }
  }
  if (Array.isArray(detail)) {
    // FastAPI's 422 lists each field that failed validation, with "body" first in its path.
    const message = (detail as FieldError[])
      .map((e) => `${(e.loc ?? []).slice(1).join('.') || 'body'}: ${e.msg ?? 'invalid'}`)
      .join('; ')
    return { code: 'validation_error', message }
  }
  return { code: 'http_error', message: `HTTP ${status}` }
}
