import random
import sys
import threading

import pytest

from vending.machine import (
    UK_COINS,
    CannotMakeChange,
    InsufficientPayment,
    InvalidAmount,
    VendingMachine,
)


def test_starts_with_ten_of_each_uk_coin_and_an_empty_cash_box():
    state = VendingMachine().state()
    assert state.coins == dict.fromkeys(UK_COINS, 10)
    assert state.cash_box == 0


def test_exact_payment_gives_no_change():
    machine = VendingMachine()
    assert machine.purchase(price=150, paid=150) == {}
    assert machine.state().coins == dict.fromkeys(UK_COINS, 10)
    assert machine.state().cash_box == 150


def test_change_comes_out_of_the_supply_and_payment_goes_to_the_cash_box():
    machine = VendingMachine()
    assert machine.purchase(price=120, paid=500) == {200: 1, 100: 1, 50: 1, 20: 1, 10: 1}
    state = machine.state()
    assert state.coins == {1: 10, 2: 10, 5: 10, 10: 9, 20: 9, 50: 9, 100: 9, 200: 9}
    assert state.cash_box == 500


def test_payment_is_never_used_for_change():
    # The machine has no 1p left. If the 2p was paid as two 1p coins, a machine that reused
    # payments could hand one back, but payments go into the sealed cash box.
    machine = VendingMachine({1: 0, 2: 10})
    with pytest.raises(CannotMakeChange):
        machine.purchase(price=1, paid=2)


def test_manages_without_a_denomination_once_it_runs_out():
    machine = VendingMachine()
    for _ in range(10):
        assert machine.purchase(price=100, paid=300) == {200: 1}
    assert machine.purchase(price=100, paid=300) == {100: 2}
    assert machine.state().coins[200] == 0


@pytest.mark.parametrize(
    ("price", "paid", "error"),
    [
        (150, 100, InsufficientPayment),
        (150, 0, InsufficientPayment),
        (-1, 100, InvalidAmount),
        (100, -1, InvalidAmount),
        (1, 3882, CannotMakeChange),
    ],
)
def test_failed_purchases_leave_the_machine_unchanged(price, paid, error):
    machine = VendingMachine()
    machine.purchase(price=30, paid=100)
    before = machine.state()
    with pytest.raises(error):
        machine.purchase(price=price, paid=paid)
    assert machine.state() == before


def test_can_fail_after_the_supply_runs_low():
    machine = VendingMachine({1: 1, 2: 0, 5: 1})
    with pytest.raises(CannotMakeChange):
        machine.purchase(price=1, paid=3)
    assert machine.purchase(price=1, paid=7) == {5: 1, 1: 1}


def test_free_item_with_no_payment_is_an_exact_payment():
    machine = VendingMachine()
    assert machine.purchase(price=0, paid=0) == {}


def test_rejects_a_bad_starting_supply():
    with pytest.raises(ValueError):
        VendingMachine({0: 1})
    with pytest.raises(ValueError):
        VendingMachine({1: -1})


def test_supply_only_goes_down_over_many_purchases():
    rng = random.Random(7)
    machine = VendingMachine()
    initial = machine.state().coins
    previous = initial
    dispensed = dict.fromkeys(UK_COINS, 0)
    takings = 0
    for _ in range(500):
        price = rng.randint(0, 400)
        paid = price + rng.randint(-20, 300)
        try:
            change = machine.purchase(price=price, paid=paid)
        except (InsufficientPayment, InvalidAmount, CannotMakeChange):
            assert machine.state().coins == previous
            continue
        assert sum(d * n for d, n in change.items()) == paid - price
        for d, n in change.items():
            dispensed[d] += n
        takings += paid
        current = machine.state().coins
        assert all(current[d] <= previous[d] for d in UK_COINS)
        previous = current
    state = machine.state()
    assert {d: state.coins[d] + dispensed[d] for d in UK_COINS} == initial
    assert state.cash_box == takings


@pytest.fixture
def frequent_thread_switches():
    # Switch threads far more often than the default 5ms, so a race is hit every run.
    default = sys.getswitchinterval()
    sys.setswitchinterval(1e-6)
    yield
    sys.setswitchinterval(default)


@pytest.mark.usefixtures("frequent_thread_switches")
def test_concurrent_purchases_never_share_coins():
    machine = VendingMachine()
    results = []
    lock = threading.Lock()
    start = threading.Barrier(16)

    def buy():
        start.wait()
        for _ in range(20):
            try:
                change = machine.purchase(price=10, paid=200)
            except CannotMakeChange:
                change = None
            with lock:
                results.append(change)

    threads = [threading.Thread(target=buy) for _ in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    sold = [c for c in results if c is not None]
    dispensed = dict.fromkeys(UK_COINS, 0)
    for change in sold:
        for d, n in change.items():
            dispensed[d] += n
    state = machine.state()
    assert all(n >= 0 for n in state.coins.values())
    assert {d: state.coins[d] + dispensed[d] for d in UK_COINS} == dict.fromkeys(UK_COINS, 10)
    assert state.cash_box == 200 * len(sold)
