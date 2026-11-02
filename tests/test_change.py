import itertools
import random

import pytest

from vending.change import make_change

UK = (1, 2, 5, 10, 20, 50, 100, 200)
FULL = dict.fromkeys(UK, 10)


def total(change):
    return sum(d * n for d, n in change.items())


def brute_force(amount, supply):
    """Every combination of the supply, smallest coin count first, then most large coins."""
    denoms = sorted(supply, reverse=True)
    best = None
    for counts in itertools.product(*(range(supply[d] + 1) for d in denoms)):
        if sum(d * n for d, n in zip(denoms, counts, strict=True)) != amount:
            continue
        key = (sum(counts), tuple(-n for n in counts))
        if best is None or key < best[0]:
            best = (key, {d: n for d, n in zip(denoms, counts, strict=True) if n})
    return None if best is None else best[1]


def test_exact_payment_needs_no_coins():
    assert make_change(0, FULL) == {}
    assert make_change(0, {}) == {}


def test_plentiful_supply_matches_greedy():
    assert make_change(380, FULL) == {200: 1, 100: 1, 50: 1, 20: 1, 10: 1}
    assert make_change(4, FULL) == {2: 2}


def test_result_is_largest_coin_first():
    assert list(make_change(388, FULL)) == [200, 100, 50, 20, 10, 5, 2, 1]


def test_succeeds_where_greedy_gets_stuck():
    # greedy takes the 5p and then needs a 1p it does not have
    assert make_change(6, {5: 1, 2: 3}) == {2: 3}
    # greedy takes the 50p and then needs a 10p it does not have
    assert make_change(60, {50: 1, 20: 3}) == {20: 3}


def test_beats_greedy_on_coin_count():
    # greedy gives 50p + five 2p (6 coins)
    assert make_change(60, {50: 1, 20: 3, 2: 5}) == {20: 3}


def test_ties_keep_small_coins():
    # 50p + 5p + 5p and 20p + 20p + 20p are both three coins
    assert make_change(60, {50: 1, 20: 3, 5: 2}) == {50: 1, 5: 2}


def test_never_uses_more_coins_than_held():
    assert make_change(400, {200: 1, 100: 2}) == {200: 1, 100: 2}
    assert make_change(600, {200: 2, 100: 1}) is None


def test_impossible_amounts():
    assert make_change(1, {}) is None
    assert make_change(3, {2: 5}) is None
    assert make_change(3881, FULL) is None
    assert make_change(3, {1: 0, 2: 0, 5: 4}) is None


def test_can_empty_the_machine():
    assert make_change(3880, FULL) == FULL


def test_negative_amount_is_an_error():
    with pytest.raises(ValueError):
        make_change(-1, FULL)


def test_matches_brute_force_on_random_supplies():
    rng = random.Random(20261102)
    for _ in range(300):
        supply = {d: rng.randint(0, 2) for d in UK}
        amount = rng.randint(0, total(supply) + 5)
        assert make_change(amount, supply) == brute_force(amount, supply), (amount, supply)
