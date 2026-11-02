import pytest
from fastapi.testclient import TestClient

from vending.api import create_app
from vending.machine import UK_COINS, VendingMachine
from vending.rate_limit import RateLimiter


@pytest.fixture
def client(clock):
    return TestClient(create_app(machine=VendingMachine(), limiter=RateLimiter(clock=clock)))


def buy(client, customer="alice", price=120, paid=500):
    return client.post("/purchases", json={"customer_id": customer, "price": price, "paid": paid})


def test_purchase_reports_the_coins_dispensed(client):
    response = buy(client, price=120, paid=500)
    assert response.status_code == 200
    assert response.json() == {
        "change": [
            {"denomination": 200, "count": 1},
            {"denomination": 100, "count": 1},
            {"denomination": 50, "count": 1},
            {"denomination": 20, "count": 1},
            {"denomination": 10, "count": 1},
        ],
        "change_total": 380,
    }


def test_exact_payment_dispenses_nothing(client):
    response = buy(client, price=150, paid=150)
    assert response.status_code == 200
    assert response.json() == {"change": [], "change_total": 0}


def test_machine_shows_the_supply_and_cash_box(client):
    assert client.get("/machine").json() == {
        "coins": [{"denomination": d, "count": 10} for d in UK_COINS],
        "cash_box": 0,
    }
    buy(client, price=180, paid=200)
    state = client.get("/machine").json()
    assert {"denomination": 20, "count": 9} in state["coins"]
    assert state["cash_box"] == 200


@pytest.mark.parametrize(
    ("price", "paid", "status", "code"),
    [
        (150, 100, 400, "insufficient_payment"),
        (-1, 100, 400, "invalid_amount"),
        (100, -5, 400, "invalid_amount"),
        (1, 5000, 409, "cannot_make_change"),
    ],
)
def test_failed_purchases_leave_the_supply_unchanged(client, price, paid, status, code):
    before = client.get("/machine").json()
    response = buy(client, price=price, paid=paid)
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code
    assert client.get("/machine").json() == before


def test_cannot_make_change_once_coins_run_out(clock):
    machine = VendingMachine({1: 0, 2: 1, 5: 10})
    client = TestClient(create_app(machine=machine, limiter=RateLimiter(clock=clock)))
    assert buy(client, price=3, paid=5).json()["change"] == [{"denomination": 2, "count": 1}]
    response = buy(client, price=3, paid=5)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "cannot_make_change"


@pytest.mark.parametrize(
    "body",
    [
        {"customer_id": "alice", "price": 1.5, "paid": 200},
        {"customer_id": "alice", "price": 150.0, "paid": 200},
        {"customer_id": "alice", "price": "150", "paid": 200},
        {"customer_id": "alice", "price": True, "paid": 200},
        {"customer_id": "alice", "price": None, "paid": 200},
        {"customer_id": "alice", "price": 150},
        {"customer_id": "alice", "price": 150, "paid": 200, "discount": 10},
        {"customer_id": "", "price": 150, "paid": 200},
        {"customer_id": "   ", "price": 150, "paid": 200},
        {"customer_id": "x" * 65, "price": 150, "paid": 200},
        {"price": 150, "paid": 200},
    ],
)
def test_malformed_requests_are_rejected(client, body):
    before = client.get("/machine").json()
    assert client.post("/purchases", json=body).status_code == 422
    assert client.get("/machine").json() == before


def test_fourth_purchase_in_five_seconds_is_turned_away(client, clock):
    for _ in range(3):
        assert buy(client).status_code == 200
    clock.now += 2.5
    response = buy(client)
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "rate_limited"
    assert response.headers["Retry-After"] == "3"
    clock.now += 2.5
    assert buy(client).status_code == 200


def test_rate_limit_is_checked_before_the_price_and_change(client):
    for _ in range(3):
        assert buy(client).status_code == 200
    before = client.get("/machine").json()
    assert buy(client, price=150, paid=100).status_code == 429
    assert buy(client, price=-1, paid=100).status_code == 429
    assert buy(client, price=1, paid=5000).status_code == 429
    assert client.get("/machine").json() == before


def test_failed_purchases_count_towards_the_limit(client):
    for _ in range(3):
        assert buy(client, price=150, paid=100).status_code == 400
    assert buy(client).status_code == 429


def test_each_customer_has_their_own_limit(client):
    for _ in range(3):
        assert buy(client, customer="alice").status_code == 200
    assert buy(client, customer="alice").status_code == 429
    assert buy(client, customer="bob").status_code == 200


def test_surrounding_spaces_do_not_make_a_new_customer(client):
    for customer in ("alice", " alice", "alice "):
        assert buy(client, customer=customer).status_code == 200
    assert buy(client, customer="alice").status_code == 429


@pytest.mark.parametrize(
    ("digits", "status"),
    [
        (30, 409),
        # Python will not parse integers this long, so the body is rejected unread
        (5000, 400),
    ],
)
def test_huge_amounts_are_turned_down_cleanly(client, digits, status):
    before = client.get("/machine").json()
    response = client.post(
        "/purchases",
        content='{"customer_id": "alice", "price": 1, "paid": 1' + "0" * digits + "}",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == status
    assert client.get("/machine").json() == before
