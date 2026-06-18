"""Idempotent migration for batch 17 — per-trade pnl + consecutive-loss limit.

Run from backend/:  .venv/bin/python -m scripts.migrate_batch17
"""
from sqlalchemy import inspect, text

from app.core.database import engine, init_db

COLUMNS = [
    ("trades", "fill_pnl", "DECIMAL(24,8) NULL"),
    ("risk_configs", "max_consecutive_losses", "INT NOT NULL DEFAULT 10"),
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
