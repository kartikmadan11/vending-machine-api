"""The vending machine: its coin supply, its cash box, and purchases."""

import threading
from collections.abc import Mapping
from dataclasses import dataclass

from vending.change import make_change

UK_COINS = (1, 2, 5, 10, 20, 50, 100, 200)
STARTING_COUNT = 10


class PurchaseError(Exception):
    """A purchase the machine turned down. Nothing about the machine has changed."""

    code = "purchase_rejected"


class InvalidAmount(PurchaseError):
    code = "invalid_amount"


class InsufficientPayment(PurchaseError):
    code = "insufficient_payment"


class CannotMakeChange(PurchaseError):
    code = "cannot_make_change"


@dataclass(frozen=True)
class MachineState:
    coins: dict[int, int]
    """Coins available for change, by denomination in pence."""
    cash_box: int
    """Total pence paid in. Sealed, so never used for change."""


class VendingMachine:
    """Takes payments and hands back change from a coin supply that is never refilled.

    Payments go into a sealed cash box, so the supply only ever goes down.
    All amounts are whole pence.
    A purchase either succeeds in full or leaves the machine exactly as it was.
    """

    def __init__(self, coins: Mapping[int, int] | None = None) -> None:
        if coins is None:
            coins = dict.fromkeys(UK_COINS, STARTING_COUNT)
        if any(d <= 0 or n < 0 for d, n in coins.items()):
            raise ValueError("denominations must be positive and counts not negative")
        self._coins = dict(coins)
        self._cash_box = 0
        # Purchases arrive on several threads at once. Working out change and taking
        # the coins out happen under one lock, so two purchases cannot both be given
        # the same coins.
        self._lock = threading.Lock()

    def purchase(self, price: int, paid: int) -> dict[int, int]:
        """Take ``paid`` pence for an item costing ``price`` pence, and return the change.

        The change maps denomination to count, largest coin first, and is empty when
        the payment is exact. Raises a ``PurchaseError`` if the purchase is turned down.
        """
        if price < 0 or paid < 0:
            raise InvalidAmount("price and paid must be zero or more pence")
        if paid < price:
            raise InsufficientPayment(f"paid {paid}p but the price is {price}p")
        with self._lock:
            change = make_change(paid - price, self._coins)
            if change is None:
                raise CannotMakeChange(f"cannot make {paid - price}p of change from the coins left")
            for d, n in change.items():
                self._coins[d] -= n
            self._cash_box += paid
        return change

    def state(self) -> MachineState:
        with self._lock:
            return MachineState(coins=dict(sorted(self._coins.items())), cash_box=self._cash_box)
