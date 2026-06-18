"""Idempotent migration for batch 3.

- Adds new columns to existing tables (risk_configs, bot_status) that
  ``Base.metadata.create_all`` cannot add to a pre-existing table.
- Creates any brand-new tables (operation_audits, risk_events).

Safe to run multiple times: each column is added only if missing.
Run from the backend/ directory so .env is picked up:
    .venv/bin/python -m scripts.migrate_batch3
"""
from sqlalchemy import inspect, text

from app.core.database import engine, init_db

# (table, column, column DDL) — DDL is MySQL/SQLite-compatible.
COLUMNS = [
    ("risk_configs", "max_net_long", "DECIMAL(24,8) NOT NULL DEFAULT 5"),
    ("risk_configs", "max_net_short", "DECIMAL(24,8) NOT NULL DEFAULT 5"),
    ("risk_configs", "max_gross_exposure", "DECIMAL(24,8) NOT NULL DEFAULT 100000"),
    ("risk_configs", "on_breach_action", "VARCHAR(16) NOT NULL DEFAULT 'stop'"),
    ("bot_status", "last_quote_ts", "BIGINT NULL"),
]


def run() -> None:
    # 1) create any new tables (operation_audits, risk_events, ...)
    init_db()

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, column, ddl in COLUMNS:
            if table not in existing_tables:
                print(f"skip {table}.{column}: table not present yet")
                continue
            cols = {c["name"] for c in inspect(engine).get_columns(table)}
            if column in cols:
                print(f"ok   {table}.{column} already exists")
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            print(f"ADD  {table}.{column} {ddl}")

    print("migration complete")


if __name__ == "__main__":
    run()
