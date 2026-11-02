"""Fewest-coin change from a limited coin supply."""

from collections.abc import Mapping


def make_change(amount: int, supply: Mapping[int, int]) -> dict[int, int] | None:
    """Return the fewest coins from ``supply`` that add up to ``amount`` pence.

    ``supply`` maps each denomination in pence to how many of that coin are available.
    The result maps denomination to count, largest coin first, or is ``None`` when no
    combination of the available coins adds up to ``amount``.
    When several combinations tie on the fewest coins, it takes the one that uses the
    most large coins, so small coins are kept for later change.

    Taking the largest coin that fits (greedy) is only optimal for UK coins while every
    denomination is plentiful. Once the supply runs short it can give too many coins, or
    none: 6p from one 5p and three 2p needs 2p + 2p + 2p, but greedy takes the 5p and is
    left needing a 1p. So this is a bounded-knapsack dynamic programme instead.
    Work is about denominations x amount x coins per denomination, and the amount is at
    most the value left in the machine (3,880p at the start).
    """
    if amount < 0:
        raise ValueError("amount must not be negative")
    if amount == 0:
        return {}
    coins = sorted((d, n) for d, n in supply.items() if n > 0)
    if sum(d * n for d, n in coins) < amount:
        return None

    # fewest[i][a] is the fewest coins that make a pence from the i smallest
    # denominations. No answer can use more than `amount` coins, so amount + 1
    # stands in for "impossible".
    impossible = amount + 1
    fewest = [[0] + [impossible] * amount]
    for d, n in coins:
        prev = fewest[-1]
        fewest.append(
            [min(prev[a - k * d] + k for k in range(min(n, a // d) + 1)) for a in range(amount + 1)]
        )
    if fewest[-1][amount] >= impossible:
        return None

    # Walk back from the largest denomination, taking as many of each coin as still
    # leads to the fewest coins overall.
    change = {}
    remaining = amount
    for i in range(len(coins), 0, -1):
        d, n = coins[i - 1]
        prev, best = fewest[i - 1], fewest[i][remaining]
        k = max(k for k in range(min(n, remaining // d) + 1) if prev[remaining - k * d] + k == best)
        if k:
            change[d] = k
            remaining -= k * d
    return change
