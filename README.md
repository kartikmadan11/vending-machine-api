# vending-machine-api

A vending machine API that pays out the fewest coins it can, using only the coins it still holds.
It starts with ten of each UK coin and is never refilled, payments go into a sealed cash box, and each customer gets at most three purchase attempts in any five seconds.

It runs live at <https://vending-machine-lime.vercel.app>.
The API there sleeps when nobody has used it for 15 minutes, so the first visit after that can wait a minute for it to wake.

```sh
uv sync
uv run uvicorn vending.api:app
```

The API is on <http://127.0.0.1:8000>, with interactive docs on <http://127.0.0.1:8000/docs>.

To drive it from a browser, in a second terminal:

```sh
cd web
npm ci
npm run dev
```

Open <http://localhost:5173>.
The page talks only to the API, so everything it shows is the API's own answer.

## The two-minute demo

**A sale.**
Press A and then 2 on the keypad for Cola (£1.20), or tap it, then insert a £2 coin and press **Buy**.
80p drops into the cup as 50p, 20p and 10p, and Inside the machine shows exactly those three coins leave their tubes.

**Not enough money.**
Choose Flat white (A4, £2.15), insert £1 and press **Buy**.
The answer is 400, nothing is taken, and the £1 is still inserted.
Press **Return money** to take it back.

**No exact change.**
Switch to bob, choose Mints (B4, 38p), insert the £20 note and press **Buy**, and then do the same again.
The first pays out £19.62 in 13 coins, nine of them £2.
Less than £19.62 is left in the tubes, so the second is refused with 409 and the machine is unchanged.
Press **Return money** to take the note back.

**The rate limit.**
Switch to carol, choose Mints, insert a £2 coin and press **Buy 4 for £1.52**.
Three sell and one is turned away with 429 before its price is looked at, and the meter counts down its `Retry-After`.
The one turned away is the last to reach the API, which over a real network is not always the last one sent.
Each pays exactly 38p, so 86p is still inserted: the 48p over and the 38p of the one turned away.
Press **Return money** to take it back.

**From a terminal.**
The page polls `GET /machine`, so a purchase made with curl shows up in it too.
All amounts are whole pence, so £1.20 is `120`:

```sh
curl -X POST http://127.0.0.1:8000/purchases \
  -H 'Content-Type: application/json' \
  -d '{"customer_id": "alice", "price": 120, "paid": 500}'
```

```json
{
  "change": [
    {"denomination": 200, "count": 1},
    {"denomination": 100, "count": 1},
    {"denomination": 50, "count": 1},
    {"denomination": 20, "count": 1},
    {"denomination": 10, "count": 1}
  ],
  "change_total": 380
}
```

Restarting the API refills the machine.

## The product

**The name.**
The API is the product.
The page in `web/` is there to drive it and to make each answer visible, not to replace it.

**It looks like a vending machine.**
The products stand in wire spirals behind glass, each priced on the shelf rail under its slot code.
You choose by tapping a product or by typing its code on the keypad, the shelf letter and then its number, and tapping the chosen product again puts it back.
You pay through the coin slot and the note reader.
**Buy** waits for money, but it still sends a purchase that pays too little, so the API's 400 can be seen.
The burst button pays the exact price for each of four purchases out of what is inserted, so it waits until that covers all four.
What you buy drops into the bin and the change lands in the cup, while the panels beside the machine say the same in words.
The product photos come from Wikimedia Commons, and each one is credited and linked under the page.

**Off the machine, colour is kept for meaning.**
Green is sold, amber short, rose refused and sky turned away.
The metals are the one exception, because a 2p has to look like a 2p.
Every colour is a named `--vend-` token, and `npm run lint:palette` fails on a raw one anywhere else.

**The type is the platform's own.**
It is the system sans-serif, so no font is downloaded, and figures are tabular, so prices, change and coin counts line up.

**Coins are drawn to scale.**
Each one is drawn from its real diameter and shape: the 20p and 50p are seven-sided Reuleaux curves, the £1 has twelve sides, and the £1 and £2 are bimetallic.

**Every answer shows its status code.**
The receipt, the burst list and the activity log all badge the HTTP status, so the page doubles as a tour of the API.

## Architecture decisions

The API is three small modules behind one FastAPI app: `change.py` works out the coins, `machine.py` holds the supply and the cash box, and `rate_limit.py` decides who may try.
None of them imports FastAPI, so each is tested without HTTP.

- **Money is whole pence.**
  The request schema takes strict integers and rejects floats and strings, so there is no rounding anywhere.
  It rejects `150.0` too, rather than guessing whether the client meant pence or pounds.
- **Fewest coins is a bounded knapsack, not greedy.**
  Taking the largest coin that fits gives the fewest coins for UK coins only while every denomination is plentiful.
  Once coins run out it can fail when change was possible: for 6p from one 5p and three 2p, greedy takes the 5p and then needs a 1p it does not have, while 2p + 2p + 2p works.
  It can also give too many coins: for 60p from one 50p, three 20p and five 2p, greedy gives 50p and five 2p instead of three 20p.
  So `change.py` records the fewest coins for every amount up to the change due, over the coins actually held, then walks back from the largest coin.
  Between two answers with the same number of coins it takes the one with more large coins, so small coins are kept for later change.
- **A failed purchase changes nothing.**
  The amounts are checked first.
  Then, under one lock, the change is worked out, and only if that succeeds are the coins taken out and the payment added to the cash box.
  Purchases run concurrently on FastAPI's thread pool, and the lock is what stops two of them being given the same coins.
- **The limiter is a sliding-window log.**
  It keeps the times of each customer's recent attempts and allows a new one only if fewer than three fall in the last five seconds, which is "at most three in any five seconds" exactly.
  A fixed window would allow six in a fraction of a second across a boundary, and a token bucket at the same average rate would allow a fourth within five seconds.
  It stores at most three timestamps per customer and forgets customers idle for a whole window.
- **The limiter runs before anything else.**
  A customer over the limit is turned away before the price is checked or change is worked out.
  That is why the schema checks only types and the checks on the amounts live in the machine, after the limiter.
  A body that cannot be parsed still gets 422 first, since there is no customer id to limit until it is.
- **Every attempt let through counts, whether it sells or not.**
  The limit is decided before anyone knows whether the purchase will succeed, and counting failures stops a customer sending failing requests without limit.
  Attempts that are turned away are not counted, so retrying too early does not lock a client out for longer.
- **The clock is injectable**, so the tests control time exactly rather than sleeping.
- **The browser reaches the API through a proxy**, Vite's locally and a Vercel route when deployed, so the API carries no CORS configuration.
  `VENDING_API_URL` points it somewhere other than `http://127.0.0.1:8000`.
- **The page keeps its own copy of the rate window only to draw the meter.**
  It is rebuilt from the answers the page has seen, including `Retry-After`, and the server is the one that decides.

### API

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
| 429 | `rate_limited` | three attempts in the last five seconds; `Retry-After` gives the whole seconds to wait |

Errors other than 422 have the body `{"detail": {"code": "...", "message": "..."}}`, so a client branches on `code` and shows `message`.
422 is FastAPI's standard validation error, which lists each field that failed.

## Installation instructions

The API needs Python 3.11 or newer and [uv](https://docs.astral.sh/uv/).
The web client needs Node 20.19 or 22.12 or newer.

```sh
uv sync              # the exact versions in uv.lock
cd web && npm ci     # the exact versions in package-lock.json
```

Without uv, a virtual environment and pip work too:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e . httpx2 pytest
```

## How to run the application

In two terminals:

```sh
uv run uvicorn vending.api:app     # FastAPI on :8000, docs at /docs
cd web && npm run dev              # Vite on :5173, proxying /api to :8000
```

The machine and the limiter live in memory, so run a single worker, which is the default, and expect a restart to reset both.
`npm run build` and then `npm run preview` serve the built client through the same proxy.

## How to run tests

```sh
uv run pytest                  # the API
uv run ruff check .            # lint
uv run ruff format --check .   # formatting
cd web && npm run check        # typecheck, lint, palette, tests. The one to run for the client
```

The API tests are organised around the hard problems, not around files.
`test_change.py` compares the change-maker with a brute-force search over random small supplies.
`test_machine.py` races threads at one machine and checks no coin is paid out twice.
`test_rate_limit.py` drives the window with a fake clock.
`test_api.py` checks that the limiter turns a customer away before a bad price is even read.
`test_server.py` starts a real uvicorn and sends 40 customers at it at once.

The client's tests cover the pieces that hold logic: reading each API answer, the rate meter, money formatting and the machine diff.

## Deploying

The web client deploys to Vercel as a static site, and Vercel forwards `/api/*` to the API running as one long-lived process on another host.
The API is not a Vercel Function, because Vercel adds instances as traffic needs them, and each would be a separate machine with its own coins, cash box and limiter.
The live site is on Vercel and its API is a free Render web service.
Every visitor shares that one machine, and it refills when the API wakes from sleep or is redeployed.
[docs/deploy.md](docs/deploy.md) has the reasoning, the Vercel setup, the settings the API host needs and the details of the live deployment.

## Assumptions made

- **Prices arrive already discounted**, so the API takes the price with each purchase rather than holding a catalogue.
  The products in the web client are examples.
- **A price of 0 is allowed**, and paying 0 for it counts as exact payment.
- **There is no upper limit on amounts.**
  Change larger than the machine can pay is refused with 409.
- **Notes are just payment.**
  The API only sees `paid` in pence, so a £20 note is 2000 and goes into the cash box, and the machine never pays out a note.
- **Customer ids are 1 to 64 characters after trimming surrounding spaces, and are case-sensitive.**
  A real service would take the identity from authentication rather than trusting the request body.
- **Unknown fields in the body are rejected**, so a typo such as `"pay"` fails loudly instead of being ignored.

## Trade-offs accepted

- **State is in memory, in one process.**
  More than one worker would mean more than one machine.
  To scale out, the coin supply moves to a database updated in one transaction per purchase, and the limiter to a shared store such as Redis.
- **All purchases queue behind one lock.**
  That is what keeps the coins consistent, and it is a throughput ceiling taken knowingly.
- **The change-maker's work grows with denominations times amount times coins held.**
  The amount can never exceed the value left in the machine, 3,880p at the start, so the worst case, emptying a full machine, takes about 20ms and ordinary change under 2ms.
- **Failed attempts use up the window.**
  A customer fumbling their change can be turned away, which is the price of not letting failing requests through without limit.
- **The meter only knows what this page has seen.**
  Purchases for the same customer from curl or another tab still count on the server, so the next answer can be a 429 the meter did not predict.
- **No container image and no CI workflow.**
  Both commands above are the whole setup, so neither would save anyone a step.

## Repository layout

```text
src/vending/
  change.py      fewest-coin change from a limited supply
  machine.py     coin supply, cash box and purchases
  rate_limit.py  per-customer sliding-window limiter
  api.py         FastAPI app and request and response models
tests/           change against brute force, a threaded race, a fake clock, HTTP, a real server
docs/deploy.md   Vercel for the client, one long-lived process for the API
web/
  src/           React client: the machine, the receipt, the coin tubes, the activity log
  scripts/       the palette gate, and the check of VENDING_API_URL before a Vercel build
  vercel.json    the Vercel build and the /api route
```
