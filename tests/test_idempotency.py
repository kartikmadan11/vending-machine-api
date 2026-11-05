import threading
import uuid

import pytest

from vending.idempotency import IdempotencyConflict, RequestLog
from vending.machine import InsufficientPayment


class Handler:
    """Stands in for handling a purchase, and counts how often it is called."""

    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = 0

    def __call__(self):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.result


def test_a_retry_gets_the_original_result_without_handling_it_again():
    log = RequestLog()
    request_id = uuid.uuid4()
    handle = Handler(result={50: 1})
    assert log.run(request_id, ("alice", 150, 200), handle) == {50: 1}
    assert log.run(request_id, ("alice", 150, 200), handle) == {50: 1}
    assert handle.calls == 1


def test_a_retry_of_a_refused_purchase_is_refused_the_same_way():
    log = RequestLog()
    request_id = uuid.uuid4()
    handle = Handler(error=InsufficientPayment("paid 100p but the price is 150p"))
    for _ in range(2):
        with pytest.raises(InsufficientPayment, match="paid 100p but the price is 150p"):
            log.run(request_id, ("alice", 150, 100), handle)
    assert handle.calls == 1


def test_the_same_id_for_a_different_purchase_is_a_conflict():
    log = RequestLog()
    request_id = uuid.uuid4()
    log.run(request_id, ("alice", 150, 200), Handler(result={50: 1}))

    other = Handler(result={})
    with pytest.raises(IdempotencyConflict) as error:
        log.run(request_id, ("alice", 150, 150), other)
    assert error.value.code == "idempotency_conflict"
    assert str(error.value) == (
        f"cannot record this purchase: request_id {request_id} was already used for a "
        "different purchase"
    )
    assert other.calls == 0
    assert log.run(request_id, ("alice", 150, 200), other) == {50: 1}


def test_a_purchase_that_was_never_handled_is_not_remembered():
    log = RequestLog()
    request_id = uuid.uuid4()
    turned_away = Handler(error=RuntimeError("rate limited"))
    with pytest.raises(RuntimeError):
        log.run(request_id, ("alice", 150, 200), turned_away)

    handle = Handler(result={50: 1})
    assert log.run(request_id, ("alice", 150, 200), handle) == {50: 1}
    assert handle.calls == 1


def test_different_request_ids_are_separate_purchases():
    log = RequestLog()
    handle = Handler(result={50: 1})
    log.run(uuid.uuid4(), ("alice", 150, 200), handle)
    log.run(uuid.uuid4(), ("alice", 150, 200), handle)
    assert handle.calls == 2


@pytest.mark.usefixtures("frequent_thread_switches")
def test_copies_of_a_retry_sent_at_once_are_handled_once():
    log = RequestLog()
    request_id = uuid.uuid4()
    calls = []

    def handle():
        calls.append(1)
        # Long enough that, without the lock, other copies look the id up meanwhile.
        sum(range(10_000))
        return {50: 1}

    start = threading.Barrier(16)
    results = []

    def send():
        start.wait()
        results.append(log.run(request_id, ("alice", 150, 200), handle))

    threads = [threading.Thread(target=send) for _ in range(16)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(calls) == 1
    assert results == [{50: 1}] * 16
