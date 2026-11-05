"""Per-customer rate limiting with a sliding-window log, under a named policy."""

import os
import threading
import time
from collections import deque
from collections.abc import Callable, Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class RateLimitPolicy:
    """Each customer may make at most ``limit`` purchase attempts in any ``window`` seconds."""

    name: str
    limit: int
    window: float

    def __post_init__(self) -> None:
        if self.limit < 1 or self.window <= 0:
            raise ValueError("limit must be at least 1 and window more than 0")


# The policies a machine can run under. A machine runs the default unless it is set up
# with another by name, so changing what a policy allows is a reviewed code change.
DEFAULT_POLICY = RateLimitPolicy(name="default", limit=3, window=5.0)
ROLLING_MINUTE_POLICY = RateLimitPolicy(name="rolling-minute", limit=3, window=60.0)
POLICIES = {p.name: p for p in (DEFAULT_POLICY, ROLLING_MINUTE_POLICY)}

POLICY_ENV_VAR = "VENDING_RATE_LIMIT_POLICY"


def policy_named(name: str) -> RateLimitPolicy:
    try:
        return POLICIES[name]
    except KeyError:
        known = ", ".join(sorted(POLICIES))
        raise ValueError(f"unknown rate limit policy {name!r}; known policies: {known}") from None


def policy_from_env(environ: Mapping[str, str] = os.environ) -> RateLimitPolicy:
    """The policy named by ``VENDING_RATE_LIMIT_POLICY``, or the default when it is unset.

    An unknown name raises, so a machine set up wrongly fails to start rather than
    quietly running under the default.
    """
    name = environ.get(POLICY_ENV_VAR, "").strip()
    return policy_named(name) if name else DEFAULT_POLICY


class RateLimited(Exception):
    def __init__(self, policy: RateLimitPolicy, retry_after: float) -> None:
        super().__init__(f"over the {policy.name!r} policy; try again in {retry_after:.2f}s")
        self.policy = policy
        """The policy the attempt was turned away under."""
        self.retry_after = retry_after
        """Seconds until this customer's next attempt would be let through."""


class RateLimiter:
    """Lets each customer make at most ``policy.limit`` attempts in any ``policy.window`` seconds.

    It keeps the times of each customer's recent attempts, and lets an attempt through
    only if fewer than ``limit`` of them are in the last ``window`` seconds.
    The window slides, so there is no reset boundary to burst across, as there is with
    fixed windows.
    Attempts that are turned away are not recorded, so retrying too early does not push
    back the time the customer is let in again.
    """

    def __init__(
        self,
        policy: RateLimitPolicy = DEFAULT_POLICY,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.policy = policy
        self._clock = clock
        self._attempts: dict[str, deque[float]] = {}
        self._next_sweep = clock() + policy.window
        self._lock = threading.Lock()

    def check(self, customer: str) -> None:
        """Record an attempt by ``customer``, or raise ``RateLimited`` if over the limit."""
        limit, window = self.policy.limit, self.policy.window
        with self._lock:
            now = self._clock()
            self._forget_idle_customers(now)
            times = self._attempts.setdefault(customer, deque())
            while times and times[0] <= now - window:
                times.popleft()
            if len(times) >= limit:
                raise RateLimited(self.policy, retry_after=times[0] + window - now)
            times.append(now)

    def _forget_idle_customers(self, now: float) -> None:
        # Once per window, drop customers with no attempts in the last window, so memory
        # grows with recent customers rather than everyone ever seen.
        if now < self._next_sweep:
            return
        cutoff = now - self.policy.window
        self._attempts = {c: t for c, t in self._attempts.items() if t[-1] > cutoff}
        self._next_sweep = now + self.policy.window
