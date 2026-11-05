"""Retried purchases: the same request id gets the original outcome, and changes nothing."""

import threading
from collections.abc import Callable, Hashable
from dataclasses import dataclass
from typing import Generic, TypeVar
from uuid import UUID

from vending.machine import PurchaseError

T = TypeVar("T")


class IdempotencyConflict(PurchaseError):
    """A request id was sent again for a different purchase. Nothing has changed."""

    code = "idempotency_conflict"

    def __init__(self, request_id: UUID) -> None:
        super().__init__(
            f"cannot record this purchase: request_id {request_id} was already used for a "
            "different purchase"
        )
        self.request_id = request_id


@dataclass(frozen=True)
class Outcome(Generic[T]):
    request: Hashable
    """The purchase as first sent, to tell a retry from a different purchase."""
    result: T | None = None
    error: PurchaseError | None = None


class RequestLog(Generic[T]):
    """Remembers the outcome of every request id, so a retry is answered from the log.

    A client that loses the response to a purchase cannot tell whether it went through, so
    it sends the same purchase again with the same request id. The log answers that retry
    with the original result, or raises the original ``PurchaseError``, without handling the
    purchase a second time. The same id with a different purchase raises
    ``IdempotencyConflict``. Any other exception is not remembered: the purchase was never
    handled, as when the customer is rate limited, so a retry is handled afresh.

    Outcomes are kept in memory for the life of the process.
    """

    def __init__(self) -> None:
        self._outcomes: dict[UUID, Outcome[T]] = {}
        # Held while a purchase is handled, so two copies of a retry sent at once cannot
        # both be handled. Purchases already queue behind the machine's lock.
        self._lock = threading.Lock()

    def run(self, request_id: UUID, request: Hashable, handle: Callable[[], T]) -> T:
        """Return what ``handle`` returns for this request, calling it only the first time."""
        with self._lock:
            outcome = self._outcomes.get(request_id)
            if outcome is None:
                try:
                    outcome = Outcome(request, result=handle())
                except PurchaseError as e:
                    outcome = Outcome(request, error=e)
                self._outcomes[request_id] = outcome
            elif outcome.request != request:
                raise IdempotencyConflict(request_id)
        if outcome.error is not None:
            raise outcome.error.with_traceback(None)
        return outcome.result
