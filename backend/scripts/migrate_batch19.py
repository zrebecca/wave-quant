"""Idempotent migration for batch 19 — RSI + Bollinger strategy params.

Run from backend/:  .venv/bin/python -m scripts.migrate_batch19
"""
from sqlalchemy import inspect, text

from app.core.database import engine, init_db

COLUMNS = [
    ("strategy_configs", "rsi_len", "INT NOT NULL DEFAULT 14"),
    ("strategy_configs", "rsi_low", "DECIMAL(24,8) NOT NULL DEFAULT 30"),
    ("strategy_configs", "rsi_high", "DECIMAL(24,8) NOT NULL DEFAULT 70"),
    ("strategy_configs", "boll_len", "INT NOT NULL DEFAULT 20"),
    ("strategy_configs", "boll_k", "DECIMAL(24,8) NOT NULL DEFAULT 2"),
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
