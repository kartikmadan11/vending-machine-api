# vending-machine-api

A vending machine API that pays out the fewest coins it can, using only the coins it still holds.
It starts with ten of each UK coin and is never refilled, payments go into a sealed cash box, and each customer gets at most three purchase attempts in any five seconds.
Selected machines can run a stricter policy instead, of three attempts in any 60 seconds.

A web client in `web/` drives it, and both run live at <https://vending-machine-lime.vercel.app>.
The API there sleeps after 15 minutes without a request, so the first visit after that can wait a minute for it to wake.

## Running it

The API needs Python 3.11 or newer and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
uv run uvicorn vending.api:app     # http://127.0.0.1:8000, interactive docs at /docs
```

The web client is optional and needs Node 20.19 or 22.12 or newer.
In a second terminal:

```sh
cd web
npm ci
npm run dev                        # http://localhost:5173, proxying /api to the API
```

To run a machine under another rate limit policy, name it when starting the API:

```sh
VENDING_RATE_LIMIT_POLICY=rolling-minute uv run uvicorn vending.api:app
```

The policies are defined in `rate_limit.py`: `default` allows three attempts in any five seconds, and `rolling-minute` three in any 60 seconds.
Without the variable a machine runs `default`, and an unknown name stops the API from starting.

The machine and the limiter live in memory, so run a single worker, which is the default, and expect a restart to refill the machine.
Without uv, create a virtual environment and run `pip install -e . httpx2 pytest`.

All amounts are whole pence, so £1.20 is `120`:

```sh
curl -X POST http://127.0.0.1:8000/purchases \
  -H 'Content-Type: application/json' \
  -d '{"customer_id": "alice", "price": 120, "paid": 200}'
```

```json
{
  "change": [
    {"denomination": 50, "count": 1},
    {"denomination": 20, "count": 1},
    {"denomination": 10, "count": 1}
  ],
  "change_total": 80
}
```

## Tests

```sh
uv run pytest                  # the API
uv run ruff check .            # lint
uv run ruff format --check .   # formatting
cd web && npm run check        # the client: typecheck, lint, palette and tests
```

The API tests are organised around the hard problems, not around files:

- `test_change.py` compares the change-maker with a brute-force search over random small supplies.
- `test_machine.py` races threads at one machine and checks no coin is paid out twice.
- `test_rate_limit.py` drives the window with a fake clock, and races threads through the sweep of idle customers.
- `test_api.py` checks that the limiter turns a customer away before a bad price is even read.
- `test_server.py` starts a real uvicorn and sends 40 customers at it at once.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/purchases` | `{ customer_id, price, paid }` in pence; returns `{ change, change_total }`, change largest first |
| `GET` | `/machine` | `{ coins, cash_box }`: the coins left for change, smallest first, and the sealed cash box |
| `GET` | `/docs` | interactive OpenAPI docs, with an example of every error |

| Status | `detail.code` | When |
| --- | --- | --- |
| 200 | | the purchase went through; exact payment returns `"change": []` |
| 400 | `insufficient_payment` | `paid` is less than `price` |
| 400 | `invalid_amount` | `price` or `paid` is negative |
| 409 | `cannot_make_change` | the coins left cannot make the exact change |
| 422 | | the body is malformed: a missing field, a wrong type such as `1.5` or `"150"`, or an unknown field |
| 429 | `rate_limited` | the customer has used up the machine's policy, such as three attempts in the last five seconds |

Errors other than 422 have the body `{"detail": {"code": "...", "message": "..."}}`, so a client branches on `code` and shows `message`.
A 429 also carries `"result": "rate_limited"`, `"retry_after_seconds"`, the whole seconds to wait, which the `Retry-After` header repeats, and `"rate_limit"`, the policy that turned the attempt away:

```json
{
  "result": "rate_limited",
  "retry_after_seconds": 3,
  "rate_limit": {"policy": "default", "limit": 3, "window_seconds": 5.0},
  "detail": {"code": "rate_limited", "message": "too many purchases; at most 3 purchase attempts in any 5 seconds"}
}
```

## Design decisions

The API is three small modules behind one FastAPI app: `change.py` works out the coins, `machine.py` holds the supply and the cash box, and `rate_limit.py` decides who may try.
None of them imports FastAPI, so each is tested without HTTP.

- **Money is whole pence.**
  The schema takes strict integers, so `150.0` is rejected rather than guessed to be pence or pounds, and nothing is ever rounded.
- **Fewest coins is a bounded knapsack, not greedy.**
  Taking the largest coin that fits only works while every coin is plentiful: for 6p from one 5p and three 2p, greedy takes the 5p and then needs a 1p it does not have.
  `change.py` finds the fewest coins for every amount up to the change due, over the coins actually held.
  Between answers with the same number of coins it pays out the larger coins, so small ones are kept for later change.
- **A failed purchase changes nothing.**
  Under one lock, the change is worked out first, and only if that succeeds are the coins taken out and the payment added to the cash box.
  The same lock stops two concurrent purchases being given the same coins.
- **The limiter is a sliding-window log, and it runs first.**
  A new attempt is allowed only if fewer than three fall in the last five seconds, which is "at most three in any five seconds" exactly, where a fixed window would allow six across a boundary.
  A customer over the limit is turned away before the price is checked, so the schema checks only types and the checks on the amounts live in the machine.
  Every attempt let through counts, sold or not, so failing requests cannot be sent without limit, and attempts turned away do not, so retrying early does not extend a lockout.
- **Rate limit policies are code.**
  Each is a named, frozen `RateLimitPolicy` in `rate_limit.py`, and a machine picks one by name, so what a policy allows changes only through a reviewed change and every machine on one name behaves the same.
  Both policies run the same sliding-window log, so the tests of the window run under each.
- **The clock is injectable**, so the tests control time exactly rather than sleeping.

## Assumptions and trade-offs

- **Prices arrive already discounted**, so each purchase carries its price and the API holds no catalogue.
- **A price of 0 is allowed, and there is no upper limit on amounts.**
  Change larger than the machine can pay is refused with 409.
- **Notes are just payment.**
  A £20 note is `paid: 2000`, goes into the cash box, and is never paid out.
- **Customer ids are 1 to 64 characters after trimming surrounding spaces, and are case-sensitive.**
  A real service would take the identity from authentication rather than the request body.
- **Unknown fields in the body are rejected**, so a typo such as `"pay"` fails loudly instead of being ignored.
- **State is in memory, in one process, and every purchase queues behind one lock.**
  To scale out, the coin supply moves to a database updated in one transaction per purchase, and the limiter to a shared store such as Redis.
- **Failed attempts use up the window**, so a customer fumbling their money can be turned away.

## The web client

It looks like a vending machine: choose a product by tapping it or typing its code on the keypad, pay through the coin slot and the note reader, and the product drops into the bin and the change into the cup.
Everything it shows is the API's own answer, badged with its HTTP status, and it polls `GET /machine`, so a purchase made with curl shows up in it too.
On a full machine:

- **200.** Cola (A2, £1.20) with a £2 coin pays out 80p as 50p, 20p and 10p.
- **400.** Flat white (A4, £2.15) with £1 is refused, and **Return money** gives the £1 back.
- **409.** As bob, Mints (B4, 38p) with the £20 note pays out £19.62 in 13 coins, and the same purchase again is refused because the tubes no longer hold that much.
- **429.** As carol, Mints with a £2 coin and **Buy 4 for £1.52** sells three and turns one away, and the meter counts down its `Retry-After`.

The product photos come from Wikimedia Commons, and each one is credited and linked under the page.

## Deploying

The live client is a static site on Vercel, which forwards `/api/*` to the API running as one long-lived process on Render, so the API needs no CORS.
The API is not a Vercel Function, because Vercel adds instances as traffic needs them, and each would be a separate machine with its own coins, cash box and limiter.
[docs/deploy.md](docs/deploy.md) has the reasoning, the setup and the details of the live deployment.
