"""HTTP API for the vending machine."""

import math
from typing import Annotated

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints

from vending.machine import (
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


class Coins(BaseModel):
    denomination: int = Field(description="Coin value in pence.")
    count: int


class PurchaseResponse(BaseModel):
    change: list[Coins] = Field(description="Coins handed back, largest first; empty if exact.")
    change_total: int = Field(description="Value of the change in pence.")


class MachineResponse(BaseModel):
    coins: list[Coins] = Field(description="Coins left for change, smallest first.")
    cash_box: int = Field(description="Total pence paid in. Sealed, so never used for change.")


class Error(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    detail: Error


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
        responses={
            400: {"model": ErrorResponse, "description": "Amounts are negative or underpaid."},
            409: {"model": ErrorResponse, "description": "The coins left cannot make the change."},
            429: {"model": ErrorResponse, "description": "Too many purchases by this customer."},
        },
    )
    def purchase(request: PurchaseRequest) -> PurchaseResponse:
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
            change=[Coins(denomination=d, count=n) for d, n in change.items()],
            change_total=sum(d * n for d, n in change.items()),
        )

    @app.get("/machine")
    def machine_state() -> MachineResponse:
        state = machine.state()
        return MachineResponse(
            coins=[Coins(denomination=d, count=n) for d, n in state.coins.items()],
            cash_box=state.cash_box,
        )

    return app


app = create_app()
