"""Idempotent migration for batch 8 — extra hard-risk columns on risk_configs.

Run from backend/:  .venv/bin/python -m scripts.migrate_batch8
"""
from sqlalchemy import inspect, text

from app.core.database import engine, init_db

COLUMNS = [
    ("risk_configs", "max_order_rate", "INT NOT NULL DEFAULT 60"),
    ("risk_configs", "max_drawdown", "DECIMAL(24,8) NOT NULL DEFAULT 20"),
    ("risk_configs", "max_market_delay_sec", "INT NOT NULL DEFAULT 5"),
]


def run() -> None:
    init_db()
    with engine.begin() as conn:
        for table, column, ddl in COLUMNS:
            cols = {c["name"] for c in inspect(engine).get_columns(table)}
            if column in cols:
                print(f"ok   {table}.{column} already exists")
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            print(f"ADD  {table}.{column} {ddl}")
    print("migration complete")


if __name__ == "__main__":
    run()
