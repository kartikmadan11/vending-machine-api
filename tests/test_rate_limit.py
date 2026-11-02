import pytest

from vending.rate_limit import RateLimited, RateLimiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock():
    return FakeClock()


@pytest.fixture
def limiter(clock):
    return RateLimiter(limit=3, window=5.0, clock=clock)


def test_lets_three_attempts_through_then_turns_the_fourth_away(limiter, clock):
    for _ in range(3):
        limiter.check("alice")
    clock.now += 1
    with pytest.raises(RateLimited) as error:
        limiter.check("alice")
    assert error.value.retry_after == pytest.approx(4.0)


def test_each_customer_has_their_own_limit(limiter):
    for _ in range(3):
        limiter.check("alice")
    for _ in range(3):
        limiter.check("bob")
    with pytest.raises(RateLimited):
        limiter.check("alice")
    with pytest.raises(RateLimited):
        limiter.check("bob")


def test_window_slides(limiter, clock):
    start = clock.now
    for offset in (0, 1, 2):
        clock.now = start + offset
        limiter.check("alice")

    clock.now = start + 4.999
    with pytest.raises(RateLimited):
        limiter.check("alice")

    # exactly five seconds after the first attempt, it has left the window
    clock.now = start + 5
    limiter.check("alice")

    # the window now holds the attempts at 1, 2 and 5
    clock.now = start + 5.5
    with pytest.raises(RateLimited) as error:
        limiter.check("alice")
    assert error.value.retry_after == pytest.approx(0.5)

    clock.now = start + 6
    limiter.check("alice")


def test_no_burst_across_a_window_boundary(limiter, clock):
    start = clock.now
    clock.now = start + 4.9
    for _ in range(3):
        limiter.check("alice")
    # a fixed window starting at `start` would reset here and let three more through
    clock.now = start + 5.1
    with pytest.raises(RateLimited):
        limiter.check("alice")


def test_turned_away_attempts_do_not_extend_the_wait(limiter, clock):
    start = clock.now
    for _ in range(3):
        limiter.check("alice")
    for offset in (1, 2, 3, 4):
        clock.now = start + offset
        with pytest.raises(RateLimited):
            limiter.check("alice")
    clock.now = start + 5
    for _ in range(3):
        limiter.check("alice")


def test_forgets_customers_who_have_gone_quiet(limiter, clock):
    for name in ("alice", "bob", "carol"):
        limiter.check(name)
    clock.now += 6
    limiter.check("dave")
    assert set(limiter._attempts) == {"dave"}


def test_rejects_a_bad_configuration(clock):
    with pytest.raises(ValueError):
        RateLimiter(limit=0, clock=clock)
    with pytest.raises(ValueError):
        RateLimiter(window=0, clock=clock)
