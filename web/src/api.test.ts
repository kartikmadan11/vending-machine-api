import { describe, expect, it, vi } from 'vitest'
import { getMachine, purchase } from './api'

const request = { request_id: '6f1c2e0a-4b7d-4c1e-9a3f-2d8b5e7c9a10', customer_id: 'alice', price: 120, paid: 200 }

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return vi.fn<typeof fetch>(async () => new Response(text, { status, headers }))
}

describe('purchase', () => {
  it('posts the request as JSON to the proxied API', async () => {
    const fetchFn = respond(200, { change: [], change_total: 0 })
    await purchase(request, fetchFn)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('/api/purchases')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual(request)
  })

  it('returns the sale', async () => {
    const sale = { change: [{ denomination: 50, count: 1 }, { denomination: 20, count: 1 }], change_total: 70 }
    expect(await purchase(request, respond(200, sale))).toEqual({ kind: 'sold', status: 200, sale })
  })

  it('returns the code and message of a rejection', async () => {
    const body = { detail: { code: 'cannot_make_change', message: 'cannot make 3p of change from the coins left' } }
    expect(await purchase(request, respond(409, body))).toEqual({
      kind: 'rejected',
      status: 409,
      code: 'cannot_make_change',
      message: 'cannot make 3p of change from the coins left',
      retryAfter: null,
    })
  })

  it('reads Retry-After from a 429', async () => {
    const body = { detail: { code: 'rate_limited', message: 'too many purchases; try again in 2.50s' } }
    const outcome = await purchase(request, respond(429, body, { 'Retry-After': '3' }))
    expect(outcome).toMatchObject({ kind: 'rejected', status: 429, code: 'rate_limited', retryAfter: 3 })
  })

  it('joins the fields of a 422 into one message', async () => {
    const body = {
      detail: [
        { type: 'int_type', loc: ['body', 'price'], msg: 'Input should be a valid integer' },
        { type: 'missing', loc: ['body'], msg: 'Field required' },
      ],
    }
    expect(await purchase(request, respond(422, body))).toMatchObject({
      kind: 'rejected',
      status: 422,
      code: 'validation_error',
      message: 'price: Input should be a valid integer; body: Field required',
    })
  })

  it('treats a network error as offline', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await purchase(request, fetchFn)).toEqual({ kind: 'offline' })
  })

  it("treats the dev proxy's empty 500 as offline", async () => {
    expect(await purchase(request, respond(500, ''))).toEqual({ kind: 'offline' })
  })

  it("treats a deployed proxy's gateway error as offline, even with a body", async () => {
    for (const status of [502, 503, 504]) {
      expect(await purchase(request, respond(status, 'An error occurred with this application.'))).toEqual({
        kind: 'offline',
      })
    }
  })

  it('reports a server error that has a body as a rejection, not as offline', async () => {
    expect(await purchase(request, respond(500, 'Internal Server Error'))).toEqual({
      kind: 'rejected',
      status: 500,
      code: 'http_error',
      message: 'HTTP 500',
      retryAfter: null,
    })
  })
})

describe('getMachine', () => {
  it('returns the machine state', async () => {
    const state = { coins: [{ denomination: 1, count: 10 }], cash_box: 0 }
    const fetchFn = respond(200, state)
    expect(await getMachine(fetchFn)).toEqual(state)
    expect(fetchFn.mock.calls[0][0]).toBe('/api/machine')
  })

  it('throws when the API does not answer with the state', async () => {
    await expect(getMachine(respond(500, ''))).rejects.toThrow('GET /machine returned 500')
  })
})
