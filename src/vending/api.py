"""HTTP API for the vending machine."""

import math
from typing import Annotated

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints

from vending.machine import (
    UK_COINS,
    CannotMakeChange,
    InsufficientPayment,
    InvalidAmount,
    PurchaseError,
    VendingMachine,
)
from vending.rate_limit import RateLimited, RateLimiter

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
    machine = VendingMachine() if machine is None else machine
    limiter = RateLimiter() if limiter is None else limiter
    app = FastAPI(
        title="Vending machine",
        summary="Pays out the fewest coins from a supply that is never refilled.",
        version="0.1.0",
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
            429: error_doc(
                "Too many purchases by this customer. Retry-After gives the seconds to wait.",
                rate_limited="too many purchases; try again in 2.50s",
            ),
        },
    )
    def purchase(request: PurchaseRequest) -> PurchaseResponse:
        """Pay for an item and get back the fewest coins of change the machine can make.

        All amounts are whole pence. Each customer may make at most three purchase attempts
        in any five seconds; beyond that they are turned away with 429 before the price is
        looked at. A rejected purchase leaves the machine unchanged.
        """
        try:
            limiter.check(request.customer_id)
        except RateLimited as e:
            seconds = max(1, math.ceil(e.retry_after))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "rate_limited", "message": f"too many purchases; {e}"},
                headers={"Retry-After": str(seconds)},
            ) from None
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
