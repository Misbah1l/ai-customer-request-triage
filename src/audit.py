import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from src.config import DATABASE_PATH, utcnow_iso


def _connection() -> sqlite3.Connection:
    db_path = Path(DATABASE_PATH)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
    except sqlite3.Error:
        pass
    return conn


def init_audit_db() -> None:
    conn = _connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                organization_id INTEGER NOT NULL,
                user_id INTEGER,
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id INTEGER,
                details TEXT,
                ip_address TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(organization_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id)")
        conn.commit()
    finally:
        conn.close()


def record_audit_log(
    organization_id: int,
    action: str,
    resource_type: str,
    resource_id: int | None = None,
    user_id: int | None = None,
    details: str | None = None,
    ip_address: str | None = None,
) -> int:
    conn = _connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO audit_log (organization_id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                organization_id,
                user_id,
                action,
                resource_type,
                resource_id,
                details,
                ip_address,
                utcnow_iso(),
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_audit_logs(
    organization_id: int,
    limit: int = 100,
    offset: int = 0,
    resource_type: str | None = None,
    resource_id: int | None = None,
) -> list[dict[str, Any]]:
    conn = _connection()
    try:
        query = """
            SELECT id, organization_id, user_id, action, resource_type, resource_id, details, ip_address, created_at
            FROM audit_log
            WHERE organization_id = ?
        """
        params: list[Any] = [organization_id]

        if resource_type:
            query += " AND resource_type = ?"
            params.append(resource_type)

        if resource_id is not None:
            query += " AND resource_id = ?"
            params.append(resource_id)

        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()
        return [_audit_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def _audit_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "organization_id": row["organization_id"],
        "user_id": row["user_id"],
        "action": row["action"],
        "resource_type": row["resource_type"],
        "resource_id": row["resource_id"],
        "details": row["details"],
        "ip_address": row["ip_address"],
        "created_at": row["created_at"],
    }
