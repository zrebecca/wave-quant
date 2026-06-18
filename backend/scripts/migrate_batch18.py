"""Idempotent migration for batch 18 — pluggable strategy type + MA-cross params.

Run from backend/:  .venv/bin/python -m scripts.migrate_batch18
"""
from sqlalchemy import inspect, text

from app.core.database import engine, init_db

COLUMNS = [
    ("strategy_configs", "strategy_type", "VARCHAR(32) NOT NULL DEFAULT 'market_maker'"),
    ("strategy_configs", "ma_fast", "INT NOT NULL DEFAULT 5"),
    ("strategy_configs", "ma_slow", "INT NOT NULL DEFAULT 20"),
    ("strategy_configs", "ma_bar", "VARCHAR(8) NOT NULL DEFAULT '1H'"),
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
