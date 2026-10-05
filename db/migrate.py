"""Apply numbered SQL migrations to data/torque.db.

Deliberately ~80 lines instead of Alembic. One SQLite file, forward-only
migrations, no autogeneration — the schema is the design document and should
only change on purpose.

Usage:
    python db/migrate.py              # apply pending migrations
    python db/migrate.py --status     # list applied / pending
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "db" / "migrations"
DB_PATH = ROOT / "data" / "torque.db"

VEC_DIM = 384  # bge-small-en-v1.5


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def try_load_sqlite_vec(conn: sqlite3.Connection) -> bool:
    """sqlite-vec is optional at migrate time so the schema can be created and
    inspected without the extension installed. The vector table is created the
    first time it IS available."""
    try:
        import sqlite_vec  # noqa: PLC0415
    except ImportError:
        return False
    try:
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        return True
    except (AttributeError, sqlite3.OperationalError):
        # Python built without extension loading support.
        return False


def applied(conn: sqlite3.Connection) -> set[str]:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migration ("
        "  name TEXT PRIMARY KEY,"
        "  applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    return {r[0] for r in conn.execute("SELECT name FROM schema_migration")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--db", type=Path, default=DB_PATH)
    args = ap.parse_args()

    conn = connect(args.db)
    done = applied(conn)
    files = sorted(MIGRATIONS.glob("*.sql"))

    if args.status:
        for f in files:
            print(f"  {'applied' if f.name in done else 'PENDING':>7}  {f.name}")
        return 0

    pending = [f for f in files if f.name not in done]
    if not pending:
        print("Schema up to date.")
    for f in pending:
        print(f"Applying {f.name} ...")
        with conn:
            conn.executescript(f.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO schema_migration(name) VALUES (?)", (f.name,))

    has_vec = try_load_sqlite_vec(conn)
    if has_vec:
        with conn:
            conn.execute(
                f"CREATE VIRTUAL TABLE IF NOT EXISTS fastener_vec USING vec0("
                f"  fastener_id INTEGER PRIMARY KEY,"
                f"  embedding float[{VEC_DIM}])"
            )
        print(f"Vector index ready (dim {VEC_DIM}).")
    else:
        print("NOTE: sqlite-vec not loaded — vector index not created.")
        print("      Lexical search works; run again after `uv add sqlite-vec`.")

    print(f"Database: {args.db}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
