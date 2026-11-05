"""HTTP API for the vending machine."""

import math
from typing import Annotated, Literal, Self

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints

from vending.machine import (
    UK_COINS,
    CannotMakeChange,
    InsufficientPayment,
    InvalidAmount,
    PurchaseError,
    VendingMachine,
)
from vending.rate_limit import RateLimited, RateLimiter, RateLimitPolicy, policy_from_env

STATUS_FOR = {
    InvalidAmount: status.HTTP_400_BAD_REQUEST,
    InsufficientPayment: status.HTTP_400_BAD_REQUEST,
    CannotMakeChange: status.HTTP_409_CONFLICT,
}


class PurchaseRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"customer_id": "alice", "price": 120, "paid": 500}]},
    )

    customer_id: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=64),
        Field(description="Who is buying. Each customer has their own rate limit."),
    ]
    # Only the type is checked here. Whether the amounts make sense is checked by the
    # machine, after the rate limit, so a customer over the limit is turned away first.
    price: StrictInt = Field(description="Price of the item in pence, already discounted.")
    paid: StrictInt = Field(description="Amount paid in pence.")


class CoinCount(BaseModel):
    denomination: int = Field(description="Coin value in pence.")
    count: int


class PurchaseResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "change": [
                        {"denomination": 200, "count": 1},
                        {"denomination": 100, "count": 1},
                        {"denomination": 50, "count": 1},
                        {"denomination": 20, "count": 1},
                        {"denomination": 10, "count": 1},
                    ],
                    "change_total": 380,
                }
            ]
        }
    )

    change: list[CoinCount] = Field(description="Coins handed back, largest first; empty if exact.")
    change_total: int = Field(description="Value of the change in pence.")


class MachineResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "coins": [{"denomination": d, "count": 10} for d in UK_COINS],
                    "cash_box": 0,
                }
            ]
        }
    )

    coins: list[CoinCount] = Field(description="Coins left for change, smallest first.")
    cash_box: int = Field(description="Total pence paid in. Sealed, so never used for change.")


class Error(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    detail: Error


def describe(policy: RateLimitPolicy) -> str:
    """The policy in words, such as "3 purchase attempts in any 5 seconds"."""
    return f"{policy.limit} purchase attempts in any {policy.window:g} seconds"


class RateLimit(BaseModel):
    """The policy an attempt was turned away under."""

    policy: str = Field(description="Name of the machine's rate limit policy.")
    limit: int = Field(description="Purchase attempts each customer may make in any window.")
    window_seconds: float = Field(description="Length of the sliding window in seconds.")


class RateLimitedResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "result": "rate_limited",
                    "retry_after_seconds": 3,
                    "rate_limit": {"policy": "default", "limit": 3, "window_seconds": 5.0},
                    "detail": {
                        "code": "rate_limited",
                        "message": "too many purchases; at most 3 purchase attempts in any 5 "
                        "seconds",
                    },
                }
            ]
        }
    )

    result: Literal["rate_limited"] = "rate_limited"
    retry_after_seconds: int = Field(
        description="Whole seconds to wait before the next attempt is let through; also sent "
        "as the Retry-After header."
    )
    rate_limit: RateLimit
    detail: Error

    @classmethod
    def for_error(cls, error: RateLimited) -> Self:
        policy = error.policy
        return cls(
            # Rounded up, and at least 1, so a client that waits this long is let through.
            retry_after_seconds=max(1, math.ceil(error.retry_after)),
            rate_limit=RateLimit(
                policy=policy.name, limit=policy.limit, window_seconds=policy.window
            ),
            detail=Error(
                code="rate_limited", message=f"too many purchases; at most {describe(policy)}"
            ),
        )


def error_doc(description: str, **examples: str) -> dict:
    """OpenAPI docs for an error status, with an example body for each error code."""
    return {
        "model": ErrorResponse,
        "description": description,
        "content": {
            "application/json": {
                "examples": {
                    code: {"value": {"detail": {"code": code, "message": message}}}
                    for code, message in examples.items()
                }
            }
        },
    }


def create_app(
    machine: VendingMachine | None = None, limiter: RateLimiter | None = None
) -> FastAPI:
    """The API for one machine.

    Without a ``limiter``, it limits customers under the policy named by
    ``VENDING_RATE_LIMIT_POLICY``, or the default policy when that is unset.
    """
    machine = VendingMachine() if machine is None else machine
    limiter = RateLimiter(policy_from_env()) if limiter is None else limiter
    app = FastAPI(
        title="vending-machine-api",
        summary="Pays out the fewest coins from a supply that is never refilled.",
        version="0.1.0",
    )

    @app.exception_handler(RateLimited)
    def rate_limited(request: Request, e: RateLimited) -> JSONResponse:
        body = RateLimitedResponse.for_error(e)
        return JSONResponse(
            body.model_dump(),
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(body.retry_after_seconds)},
        )

    # Plain `def` endpoints run on FastAPI's thread pool, so purchases really do run at
    # the same time; the machine and the limiter each hold a lock for that.
    @app.post(
        "/purchases",
        tags=["purchases"],
        summary="Buy an item",
        responses={
            400: error_doc(
                "Amounts are negative or underpaid.",
                insufficient_payment="paid 100p but the price is 150p",
                invalid_amount="price and paid must be zero or more pence",
            ),
            409: error_doc(
                "The coins left cannot make the change.",
                cannot_make_change="cannot make 3p of change from the coins left",
            ),
            429: {
                "model": RateLimitedResponse,
                "description": "Too many purchases by this customer. `retry_after_seconds`, "
                "and the Retry-After header, give the whole seconds to wait.",
            },
        },
        description=(
            "All amounts are whole pence. "
            f"Each customer may make at most {describe(limiter.policy)}, whether they succeed "
            "or fail; beyond that they are turned away with 429 before the price is looked at, "
            "and that attempt does not count. A rejected purchase leaves the machine unchanged."
        ),
    )
    def purchase(request: PurchaseRequest) -> PurchaseResponse:
        """Pay for an item and get back the fewest coins of change the machine can make."""
        limiter.check(request.customer_id)
        try:
            change = machine.purchase(price=request.price, paid=request.paid)
        except PurchaseError as e:
            raise HTTPException(
                STATUS_FOR[type(e)], detail={"code": e.code, "message": str(e)}
            ) from None
        return PurchaseResponse(
            change=[CoinCount(denomination=d, count=n) for d, n in change.items()],
            change_total=sum(d * n for d, n in change.items()),
        )

    @app.get("/machine", tags=["machine"], summary="Show the coins and cash box")
    def machine_state() -> MachineResponse:
        """The coins left for change, and the total paid into the sealed cash box."""
        state = machine.state()
        return MachineResponse(
            coins=[CoinCount(denomination=d, count=n) for d, n in state.coins.items()],
            cash_box=state.cash_box,
        )

    return app


app = create_app()
