"""CRUD for orders and trades."""
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.order import Order, Trade

OPEN_STATES = ("live", "partially_filled")


def upsert_order(db: Session, **fields) -> Order:
    """Insert or update an order keyed on order_id (falling back to client_order_id)."""
    order: Optional[Order] = None
    if fields.get("order_id"):
        order = db.scalar(select(Order).where(Order.order_id == fields["order_id"]))
    if order is None and fields.get("client_order_id"):
        order = db.scalar(
            select(Order).where(Order.client_order_id == fields["client_order_id"])
        )
    if order is None:
        order = Order(**fields)
        db.add(order)
    else:
        for key, value in fields.items():
            if value is not None:
                setattr(order, key, value)
    db.commit()
    db.refresh(order)
    return order


def list_orders(
    db: Session,
    state: Optional[str] = None,
    inst_id: Optional[str] = None,
    open_only: bool = False,
    limit: int = 200,
) -> List[Order]:
    stmt = select(Order)
    if open_only:
        stmt = stmt.where(Order.state.in_(OPEN_STATES))
    elif state:
        stmt = stmt.where(Order.state == state)
    if inst_id:
        stmt = stmt.where(Order.inst_id == inst_id)
    stmt = stmt.order_by(Order.id.desc()).limit(limit)
    return list(db.scalars(stmt))


def count_open_orders(db: Session) -> int:
    from sqlalchemy import func

    return db.scalar(select(func.count(Order.id)).where(Order.state.in_(OPEN_STATES))) or 0


def insert_trade(db: Session, **fields) -> Trade:
    trade = Trade(**fields)
    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


def list_trades(db: Session, inst_id: Optional[str] = None, limit: int = 200) -> List[Trade]:
    stmt = select(Trade)
    if inst_id:
        stmt = stmt.where(Trade.inst_id == inst_id)
    stmt = stmt.order_by(Trade.id.desc()).limit(limit)
    return list(db.scalars(stmt))
