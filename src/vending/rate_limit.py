"""Per-customer rate limiting with a sliding-window log."""

import threading
import time
from collections import deque
from collections.abc import Callable


class RateLimited(Exception):
    def __init__(self, retry_after: float) -> None:
        super().__init__(f"try again in {retry_after:.2f}s")
        self.retry_after = retry_after
        """Seconds until this customer's next attempt would be let through."""


class RateLimiter:
    """Lets each customer make at most ``limit`` attempts in any ``window`` seconds.

    It keeps the times of each customer's recent attempts, and lets an attempt through
    only if fewer than ``limit`` of them are in the last ``window`` seconds.
    The window slides, so there is no reset boundary to burst across, as there is with
    fixed windows.
    Attempts that are turned away are not recorded, so retrying too early does not push
    back the time the customer is let in again.
    """

    def __init__(
        self, limit: int = 3, window: float = 5.0, clock: Callable[[], float] = time.monotonic
    ) -> None:
        if limit < 1 or window <= 0:
            raise ValueError("limit must be at least 1 and window more than 0")
        self._limit = limit
        self._window = window
        self._clock = clock
        self._attempts: dict[str, deque[float]] = {}
        self._next_sweep = clock() + window
        self._lock = threading.Lock()

    def check(self, customer: str) -> None:
        """Record an attempt by ``customer``, or raise ``RateLimited`` if over the limit."""
        with self._lock:
            now = self._clock()
            self._forget_idle_customers(now)
            times = self._attempts.setdefault(customer, deque())
            while times and times[0] <= now - self._window:
                times.popleft()
            if len(times) >= self._limit:
                raise RateLimited(retry_after=times[0] + self._window - now)
            times.append(now)

    def _forget_idle_customers(self, now: float) -> None:
        # Once per window, drop customers with no attempts in the last window, so memory
        # grows with recent customers rather than everyone ever seen.
        if now < self._next_sweep:
            return
        cutoff = now - self._window
        self._attempts = {c: t for c, t in self._attempts.items() if t[-1] > cutoff}
        self._next_sweep = now + self._window
