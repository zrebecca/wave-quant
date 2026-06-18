"""Idempotent migration — strategy_configs spot-grid columns (grid_low/high/count).

Run from backend/:  .venv/bin/python -m scripts.migrate_grid
"""
from sqlalchemy import inspect, text

from app.core.database import engine, init_db

COLUMNS = [
    ("strategy_configs", "grid_low", "DECIMAL(24,8) NOT NULL DEFAULT 0"),
    ("strategy_configs", "grid_high", "DECIMAL(24,8) NOT NULL DEFAULT 0"),
    ("strategy_configs", "grid_count", "INT NOT NULL DEFAULT 10"),
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
