import threading

import pytest

from vending.rate_limit import (
    DEFAULT_POLICY,
    POLICIES,
    ROLLING_MINUTE_POLICY,
    RateLimited,
    RateLimiter,
    RateLimitPolicy,
    policy_from_env,
    policy_named,
)


# The sliding-window behaviour is the same under every policy, so these tests run under
# each one, with times given relative to its window.
@pytest.fixture(params=POLICIES.values(), ids=POLICIES.keys())
def limiter(request, clock):
    return RateLimiter(request.param, clock=clock)


def test_lets_three_attempts_through_then_turns_the_fourth_away(limiter, clock):
    for _ in range(3):
        limiter.check("alice")
    clock.now += 1
    with pytest.raises(RateLimited) as error:
        limiter.check("alice")
    assert error.value.retry_after == pytest.approx(limiter.policy.window - 1)
    assert error.value.policy is limiter.policy


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
    window = limiter.policy.window
    start = clock.now
    for offset in (0, 1, 2):
        clock.now = start + offset
        limiter.check("alice")

    clock.now = start + window - 0.001
    with pytest.raises(RateLimited):
        limiter.check("alice")

    # exactly one window after the first attempt, it has left the window
    clock.now = start + window
    limiter.check("alice")

    # the window now holds the attempts at 1, 2 and `window`
    clock.now = start + window + 0.5
    with pytest.raises(RateLimited) as error:
        limiter.check("alice")
    assert error.value.retry_after == pytest.approx(0.5)

    clock.now = start + window + 1
    limiter.check("alice")


def test_no_burst_across_a_window_boundary(limiter, clock):
    window = limiter.policy.window
    start = clock.now
    clock.now = start + window - 0.1
    for _ in range(3):
        limiter.check("alice")
    # a fixed window starting at `start` would reset here and let three more through
    clock.now = start + window + 0.1
    with pytest.raises(RateLimited):
        limiter.check("alice")


def test_turned_away_attempts_do_not_extend_the_wait(limiter, clock):
    window = limiter.policy.window
    start = clock.now
    for _ in range(3):
        limiter.check("alice")
    for fifths in (1, 2, 3, 4):
        clock.now = start + window * fifths / 5
        with pytest.raises(RateLimited):
            limiter.check("alice")
    clock.now = start + window
    for _ in range(3):
        limiter.check("alice")


def test_forgets_customers_who_have_gone_quiet(limiter, clock):
    for name in ("alice", "bob", "carol"):
        limiter.check(name)
    clock.now += limiter.policy.window + 1
    limiter.check("dave")
    assert set(limiter._attempts) == {"dave"}


@pytest.mark.usefixtures("frequent_thread_switches")
def test_concurrent_attempts_during_a_sweep_let_only_three_through(limiter, clock):
    # Many customers who have gone quiet make the next sweep long. Without the lock,
    # threads sweep at the same time and each swaps in its own dict, losing the
    # attempts the others have just recorded.
    for i in range(20_000):
        limiter.check(f"quiet-{i}")
    clock.now += limiter.policy.window + 1
    let_through = []
    start = threading.Barrier(16)

    def attempt():
        start.wait()
        for _ in range(4):
            try:
                limiter.check("alice")
            except RateLimited:
                continue
            let_through.append(1)

    threads = [threading.Thread(target=attempt) for _ in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(let_through) == 3


def test_default_policy_allows_three_attempts_in_any_five_seconds(clock):
    limiter = RateLimiter(clock=clock)
    assert limiter.policy == DEFAULT_POLICY == RateLimitPolicy("default", limit=3, window=5.0)
    start = clock.now
    for _ in range(3):
        limiter.check("alice")
    clock.now = start + 4.999
    with pytest.raises(RateLimited):
        limiter.check("alice")
    clock.now = start + 5
    limiter.check("alice")


def test_rolling_minute_policy_allows_three_attempts_in_any_sixty_seconds(clock):
    limiter = RateLimiter(ROLLING_MINUTE_POLICY, clock=clock)
    assert limiter.policy == RateLimitPolicy("rolling-minute", limit=3, window=60.0)
    start = clock.now
    for offset in (0, 20, 40):
        clock.now = start + offset
        limiter.check("alice")

    # five seconds on, where the default would have let a fourth through
    clock.now = start + 45
    with pytest.raises(RateLimited) as error:
        limiter.check("alice")
    assert error.value.retry_after == pytest.approx(15)

    clock.now = start + 59.999
    with pytest.raises(RateLimited):
        limiter.check("alice")
    # the attempt at 0 has left the window, but those at 20 and 40 are still in it
    clock.now = start + 60
    limiter.check("alice")
    with pytest.raises(RateLimited) as error:
        limiter.check("alice")
    assert error.value.retry_after == pytest.approx(20)


def test_policies_are_looked_up_by_name():
    assert policy_named("default") is DEFAULT_POLICY
    assert policy_named("rolling-minute") is ROLLING_MINUTE_POLICY
    with pytest.raises(ValueError, match="unknown rate limit policy 'hourly'"):
        policy_named("hourly")


@pytest.mark.parametrize(
    ("environ", "policy"),
    [
        ({}, DEFAULT_POLICY),
        ({"VENDING_RATE_LIMIT_POLICY": ""}, DEFAULT_POLICY),
        ({"VENDING_RATE_LIMIT_POLICY": "default"}, DEFAULT_POLICY),
        ({"VENDING_RATE_LIMIT_POLICY": " rolling-minute "}, ROLLING_MINUTE_POLICY),
    ],
)
def test_machine_runs_the_default_unless_set_up_with_another(environ, policy):
    assert policy_from_env(environ) is policy


def test_unknown_policy_for_a_machine_is_an_error():
    with pytest.raises(ValueError, match="known policies: default, rolling-minute"):
        policy_from_env({"VENDING_RATE_LIMIT_POLICY": "rolling_minute"})


def test_rejects_a_bad_policy():
    with pytest.raises(ValueError):
        RateLimitPolicy("none", limit=0, window=5.0)
    with pytest.raises(ValueError):
        RateLimitPolicy("instant", limit=3, window=0)
