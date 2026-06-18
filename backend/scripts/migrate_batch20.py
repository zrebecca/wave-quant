"""Idempotent migration for batch 20 — strategy_configs.owner_id.

Adds per-account ownership to strategy instances (我的策略 isolation) and
backfills existing unowned instances to user 'Rebecca'. The bot's global
`default` config stays unowned (NULL) so it never shows in anyone's list.

Run from backend/:  .venv/bin/python -m scripts.migrate_batch20
"""
from sqlalchemy import inspect, text

from app.core.database import engine, init_db

COLUMNS = [
    ("strategy_configs", "owner_id", "INT NULL"),
]
BACKFILL_USERNAME = "Rebecca"


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

        # Backfill: assign pre-existing unowned instances (everything but the
        # global `default` config) to BACKFILL_USERNAME. Idempotent — only
        # touches rows still NULL.
        owner_id = conn.execute(
            text("SELECT id FROM users WHERE username = :u"),
            {"u": BACKFILL_USERNAME},
        ).scalar()
        if owner_id is None:
            print(f"warn user '{BACKFILL_USERNAME}' not found — left existing instances unowned")
        else:
            result = conn.execute(
                text(
                    "UPDATE strategy_configs SET owner_id = :oid "
                    "WHERE owner_id IS NULL AND name <> 'default'"
                ),
                {"oid": owner_id},
            )
            print(f"SET  {result.rowcount} instance(s) -> owner_id={owner_id} ({BACKFILL_USERNAME})")
    print("migration complete")


if __name__ == "__main__":
    run()
