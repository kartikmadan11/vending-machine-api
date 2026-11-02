# Vending machine API

A FastAPI service for a vending machine that hands back the fewest coins it can, using only the coins it still holds.

The machine starts with ten of each UK coin (1p, 2p, 5p, 10p, 20p, 50p, £1 and £2) and is never refilled.
Payments go into a sealed cash box, so the coins available for change only ever go down.
Each customer can make at most three purchase attempts in any five seconds.

## Running it

You need Python 3.11 or later and [uv](https://docs.astral.sh/uv/).

```sh
uv sync
uv run uvicorn vending.api:app
```

The API is then on http://127.0.0.1:8000, and the interactive docs are on http://127.0.0.1:8000/docs.

To run the tests and the linter:

```sh
uv run pytest
uv run ruff check .
```

Without uv, use a virtual environment and pip:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e . httpx2 pytest
uvicorn vending.api:app
pytest
```

The machine's state is held in memory, so run a single worker (the default) and expect a restart to reset it.

## Using it

All amounts are whole pence, so £1.20 is `120`.

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

Exact payment returns `"change": []`.
`GET /machine` shows the coins left and the total in the cash box.

| Status | `detail.code` | When |
|---|---|---|
| 200 | | The purchase went through; `change` lists the coins dispensed, largest first |
| 400 | `insufficient_payment` | `paid` is less than `price` |
| 400 | `invalid_amount` | `price` or `paid` is negative |
| 409 | `cannot_make_change` | The coins left cannot make the exact change |
| 422 | | The body is malformed: a missing field, a wrong type such as `1.5` or `"150"`, or an unknown field |
| 429 | `rate_limited` | The customer has made three attempts in the last five seconds; `Retry-After` says how many seconds to wait |

Errors other than 422 have the body `{"detail": {"code": "...", "message": "..."}}`.
422 is FastAPI's standard validation error, which lists each field that failed.

## Design decisions

### Money is whole pence

Amounts are integers, and the request schema rejects floats and strings, so there is no rounding anywhere.
It rejects `150.0` too, rather than guessing whether the client meant pence or pounds.

### Fewest coins from a limited supply

Taking the largest coin that fits (greedy) gives the fewest coins for UK coins only while every denomination is plentiful.
Once coins run out it can fail when change was possible: for 6p from one 5p and three 2p, greedy takes the 5p and then needs a 1p it does not have, while 2p + 2p + 2p works.
It can also give too many coins: for 60p from one 50p, three 20p and five 2p, greedy gives 50p and five 2p (six coins) instead of three 20p.

So `change.py` uses a bounded-knapsack dynamic programme over the coins actually held.
For each denomination in turn it records the fewest coins that make every amount up to the change due, then walks back from the largest coin to read off the answer.
When two answers use the same number of coins, it picks the one with more large coins, so small coins are kept for later change.
The work grows with denominations x amount x coins per denomination, and the amount can never exceed the value left in the machine (3,880p at the start).
The worst case, emptying a full machine, takes about 20ms; ordinary change takes under 2ms.
The tests compare it with a brute-force search over random small supplies.

### Failed purchases change nothing

The machine checks the amounts first.
Then, under one lock, it works out the change and only if that succeeds takes the coins out and adds the payment to the cash box.
A rejected purchase never gets as far as touching either.
Purchases run concurrently on FastAPI's thread pool, and the lock stops two purchases being given the same coins.

### Rate limiting

The limiter keeps the times of each customer's recent attempts and allows a new one only if fewer than three fall in the last five seconds.
This sliding-window log matches "at most three in any five seconds" exactly.
A fixed window would allow six requests in a fraction of a second across a window boundary, and a token bucket refilling at the same average rate would allow a fourth request within five seconds.
It stores at most three timestamps per customer, and forgets customers who have been idle for a whole window.

It is the first thing the purchase endpoint does, so a customer over the limit is turned away before the price is checked or change is worked out.
For that reason the request schema checks only types, and the checks on the amounts themselves live in the machine, after the limiter.
A request that cannot be parsed at all still gets 422 first, since there is no customer id to limit until it is.

Every attempt the limiter lets through counts towards the limit, whether the purchase then succeeds or fails.
The limit is checked before anyone knows whether the purchase will succeed, and counting failures also stops a customer sending failing requests without limit.
Attempts that are turned away are not counted, so a client that retries too early is not locked out for longer.

The clock is injectable, so the tests control time exactly rather than sleeping.

### State is in memory

The machine and the limiter live in the process, which is all one machine needs.
More than one worker would mean more than one machine.
To scale out, the coin supply would move to a database updated in a single transaction per purchase, and the limiter to a shared store such as Redis.

## Assumptions

- A price of 0 is allowed, since prices arrive already discounted, and paying 0 for it counts as exact payment.
- There is no upper limit on amounts; change larger than the machine can pay is refused with 409.
- Customer ids are 1 to 64 characters after trimming surrounding spaces, and are case-sensitive. A real service would take the identity from authentication rather than trusting the request body.
- Unknown fields in the body are rejected, so a typo such as `"pay"` fails loudly instead of being ignored.

## Layout

```
src/vending/
  change.py      fewest-coin change from a limited supply
  machine.py     coin supply, cash box and purchases
  rate_limit.py  per-customer sliding-window limiter
  api.py         FastAPI app and request/response models
tests/
  test_change.py      change-making, including against brute force
  test_machine.py     purchases, failures and a threaded race test
  test_rate_limit.py  window behaviour with a fake clock
  test_api.py         HTTP behaviour, validation and limiter ordering
  test_server.py      a real uvicorn server with 40 concurrent customers
```
