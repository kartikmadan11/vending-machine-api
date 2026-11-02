"""End to end: a real uvicorn server, with many customers buying at the same time."""

import asyncio
import threading
import time
from collections import Counter

import httpx2
import pytest
import uvicorn

from vending.api import create_app
from vending.machine import UK_COINS
from vending.rate_limit import RateLimiter


@pytest.fixture
def base_url():
    # The clock is frozen so every request falls in the same five-second window, however
    # slowly the test runs.
    app = create_app(limiter=RateLimiter(clock=lambda: 0.0))
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        assert time.monotonic() < deadline, "server did not start"
        time.sleep(0.01)
    port = server.servers[0].sockets[0].getsockname()[1]
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=10)


def test_concurrent_customers(base_url):
    customers = [f"customer-{i}" for i in range(40)]

    async def run():
        async with httpx2.AsyncClient(base_url=base_url, timeout=30) as client:
            requests = [
                client.post("/purchases", json={"customer_id": c, "price": 10, "paid": 200})
                for c in customers
                for _ in range(4)
            ]
            responses = await asyncio.gather(*requests)
            state = (await client.get("/machine")).json()
        return responses, state

    responses, state = asyncio.run(run())

    # every customer got exactly three attempts, whatever the outcome
    turned_away = Counter(r.request.content for r in responses if r.status_code == 429)
    assert len(turned_away) == len(customers)
    assert set(turned_away.values()) == {1}

    # each attempt either sold or was refused for want of change
    attempts = [r for r in responses if r.status_code != 429]
    assert {r.status_code for r in attempts} <= {200, 409}
    sold = [r.json() for r in attempts if r.status_code == 200]
    # 120 attempts at 190p change each is far more than the 3,880p the machine holds
    assert 0 < len(sold) < len(attempts)
    assert all(s["change_total"] == 190 for s in sold)

    # every coin is either still in the machine or was handed out exactly once
    dispensed = Counter()
    for s in sold:
        for coin in s["change"]:
            dispensed[coin["denomination"]] += coin["count"]
    left = {c["denomination"]: c["count"] for c in state["coins"]}
    assert all(n >= 0 for n in left.values())
    assert {d: left[d] + dispensed[d] for d in UK_COINS} == dict.fromkeys(UK_COINS, 10)
    assert state["cash_box"] == 200 * len(sold)
