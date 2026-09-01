import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from src.config import DATABASE_PATH, utcnow_iso
from src.models import WorkflowResult


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


def init_db() -> None:
    conn = _connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS organizations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS memberships (
                user_id INTEGER NOT NULL,
                organization_id INTEGER NOT NULL,
                role TEXT NOT NULL DEFAULT 'agent',
                PRIMARY KEY (user_id, organization_id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (organization_id) REFERENCES organizations(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                organization_id INTEGER NOT NULL DEFAULT 0,
                input_text TEXT NOT NULL,
                normalized_text TEXT,
                category TEXT,
                confidence REAL,
                summary TEXT,
                risk TEXT,
                needs_human INTEGER,
                route_to TEXT,
                status TEXT DEFAULT 'new',
                error_reason TEXT,
                assigned_to INTEGER,
                updated_at TEXT,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (organization_id) REFERENCES organizations(id)
            )
            """
        )
        cursor = conn.execute("PRAGMA table_info(requests)")
        columns = [row["name"] for row in cursor.fetchall()]
        if "organization_id" not in columns:
            conn.execute("ALTER TABLE requests ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 0")
        if "status" not in columns:
            conn.execute("ALTER TABLE requests ADD COLUMN status TEXT DEFAULT 'new'")
        if "assigned_to" not in columns:
            conn.execute("ALTER TABLE requests ADD COLUMN assigned_to INTEGER")
        if "updated_at" not in columns:
            conn.execute("ALTER TABLE requests ADD COLUMN updated_at TEXT")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_requests_org ON requests(organization_id)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id INTEGER NOT NULL,
                organization_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (request_id) REFERENCES requests(id)
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_request ON comments(request_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_comments_org ON comments(organization_id)")
        conn.commit()
        from src.audit import init_audit_db
        init_audit_db()
    finally:
        conn.close()


def save_request(result: WorkflowResult, organization_id: int) -> int:
    conn = _connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO requests (
                organization_id,
                input_text,
                normalized_text,
                category,
                confidence,
                summary,
                risk,
                needs_human,
                route_to,
                status,
                error_reason,
                assigned_to,
                updated_at,
                timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                organization_id,
                result.input_text,
                result.normalized_text,
                result.ai_output.category if result.ai_output else None,
                result.ai_output.confidence if result.ai_output else None,
                result.ai_output.summary if result.ai_output else None,
                result.ai_output.risk if result.ai_output else None,
                1 if result.ai_output and result.ai_output.needs_human else 0,
                result.route_to,
                result.status,
                result.error_reason,
                None,
                utcnow_iso(),
                result.timestamp,
            ),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_requests(limit: int = 50, search: str | None = None, organization_id: int | None = None, offset: int = 0) -> list[dict[str, Any]]:
    conn = _connection()
    try:
        query = """
            SELECT id, organization_id, input_text, normalized_text, category, confidence, summary,
                   risk, needs_human, route_to, status, error_reason, assigned_to, updated_at, timestamp
            FROM requests
        """
        params: list[Any] = []
        where_clauses: list[str] = []

        if organization_id is not None:
            where_clauses.append("organization_id = ?")
            params.append(organization_id)

        if search:
            where_clauses.append("input_text LIKE ?")
            params.append(f"%{search}%")

        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def count_requests(organization_id: int | None = None, search: str | None = None) -> int:
    conn = _connection()
    try:
        query = "SELECT COUNT(*) FROM requests"
        params: list[Any] = []
        where_clauses: list[str] = []

        if organization_id is not None:
            where_clauses.append("organization_id = ?")
            params.append(organization_id)

        if search:
            where_clauses.append("input_text LIKE ?")
            params.append(f"%{search}%")

        if where_clauses:
            query += " WHERE " + " AND ".join(where_clauses)

        return conn.execute(query, params).fetchone()[0]
    finally:
        conn.close()


def get_stats(organization_id: int | None = None) -> dict[str, Any]:
    conn = _connection()
    try:
        params: list[Any] = []
        if organization_id is not None:
            base_query = "SELECT COUNT(*) FROM requests WHERE organization_id = ?"
            params.append(organization_id)
        else:
            base_query = "SELECT COUNT(*) FROM requests WHERE 1=1"
        
        total = conn.execute(base_query, params).fetchone()[0]
        
        human_review_query = base_query + " AND status = 'human_review'"
        human_review = conn.execute(human_review_query, params).fetchone()[0]
        
        high_risk_query = base_query + " AND risk = 'high'"
        high_risk = conn.execute(high_risk_query, params).fetchone()[0]
        
        routed_query = base_query + " AND status = 'routed'"
        routed = conn.execute(routed_query, params).fetchone()[0]
        
        return {
            "total": total,
            "human_review": human_review,
            "high_risk": high_risk,
            "routed": routed,
        }
    finally:
        conn.close()


def get_request_by_id(request_id: int, organization_id: int | None = None) -> dict[str, Any] | None:
    conn = _connection()
    try:
        query = """
            SELECT id, organization_id, input_text, normalized_text, category, confidence, summary,
                   risk, needs_human, route_to, status, error_reason, assigned_to, updated_at, timestamp
            FROM requests
            WHERE id = ?
        """
        params: list[Any] = [request_id]

        if organization_id is not None:
            query += " AND organization_id = ?"
            params.append(organization_id)

        row = conn.execute(query, params).fetchone()
        if row is None:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()


def get_review_requests(organization_id: int, limit: int = 50) -> list[dict[str, Any]]:
    conn = _connection()
    try:
        rows = conn.execute(
            """
            SELECT id, organization_id, input_text, normalized_text, category, confidence, summary,
                   risk, needs_human, route_to, status, error_reason, assigned_to, updated_at, timestamp
            FROM requests
            WHERE organization_id = ? AND status = 'human_review'
            ORDER BY id DESC
            LIMIT ?
            """,
            (organization_id, limit),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def update_request_status(request_id: int, organization_id: int, new_status: str, assigned_to: int | None = None) -> dict[str, Any] | None:
    conn = _connection()
    try:
        cursor = conn.execute(
            """
            UPDATE requests
            SET status = ?, assigned_to = ?, updated_at = ?
            WHERE id = ? AND organization_id = ?
            """,
            (new_status, assigned_to, utcnow_iso(), request_id, organization_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            return None
        row = conn.execute(
            """
            SELECT id, organization_id, input_text, normalized_text, category, confidence, summary,
                   risk, needs_human, route_to, status, error_reason, assigned_to, updated_at, timestamp
            FROM requests
            WHERE id = ?
            """,
            (request_id,),
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()


def create_comment(request_id: int, organization_id: int, user_id: int, content: str) -> int:
    conn = _connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO comments (request_id, organization_id, user_id, content, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (request_id, organization_id, user_id, content, utcnow_iso()),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def get_comments_for_request(request_id: int, organization_id: int | None = None) -> list[dict[str, Any]]:
    conn = _connection()
    try:
        query = """
            SELECT id, request_id, organization_id, user_id, content, created_at
            FROM comments
            WHERE request_id = ?
        """
        params: list[Any] = [request_id]

        if organization_id is not None:
            query += " AND organization_id = ?"
            params.append(organization_id)

        query += " ORDER BY id ASC"

        rows = conn.execute(query, params).fetchall()
        return [_comment_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def _comment_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "request_id": row["request_id"],
        "organization_id": row["organization_id"],
        "user_id": row["user_id"],
        "content": row["content"],
        "created_at": row["created_at"],
    }


def clear_requests() -> None:
    conn = _connection()
    try:
        conn.execute("DELETE FROM requests")
        conn.commit()
    finally:
        conn.close()


def clear_all() -> None:
    conn = _connection()
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("DELETE FROM audit_log")
        conn.execute("DELETE FROM comments")
        conn.execute("DELETE FROM requests")
        conn.execute("DELETE FROM memberships")
        conn.execute("DELETE FROM users")
        conn.execute("DELETE FROM organizations")
        conn.execute("DELETE FROM sqlite_sequence")
        conn.commit()
        conn.execute("PRAGMA foreign_keys = ON")
    finally:
        conn.close()


def create_organization(name: str) -> int:
    conn = _connection()
    try:
        cursor = conn.execute(
            "INSERT INTO organizations (name, created_at) VALUES (?, ?)",
            (name, utcnow_iso()),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def create_user(name: str, email: str, password_hash: str) -> int:
    conn = _connection()
    try:
        cursor = conn.execute(
            "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (name, email, password_hash, utcnow_iso()),
        )
        conn.commit()
        return cursor.lastrowid
    finally:
        conn.close()


def create_membership(user_id: int, organization_id: int, role: str = "agent") -> None:
    conn = _connection()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO memberships (user_id, organization_id, role) VALUES (?, ?, ?)",
            (user_id, organization_id, role),
        )
        conn.commit()
    finally:
        conn.close()


def get_user_by_email(email: str) -> dict[str, Any] | None:
    conn = _connection()
    try:
        row = conn.execute(
            "SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if row is None:
            return None
        return _user_row_to_dict(row)
    finally:
        conn.close()


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    conn = _connection()
    try:
        row = conn.execute(
            "SELECT id, name, email, password_hash, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if row is None:
            return None
        return _user_row_to_dict(row)
    finally:
        conn.close()


def get_membership(user_id: int, organization_id: int | None = None) -> dict[str, Any] | None:
    conn = _connection()
    try:
        if organization_id is not None:
            row = conn.execute(
                "SELECT user_id, organization_id, role FROM memberships WHERE user_id = ? AND organization_id = ?",
                (user_id, organization_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT user_id, organization_id, role FROM memberships WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "user_id": row["user_id"],
            "organization_id": row["organization_id"],
            "role": row["role"],
        }
    finally:
        conn.close()


def get_organization_by_id(organization_id: int) -> dict[str, Any] | None:
    conn = _connection()
    try:
        row = conn.execute(
            "SELECT id, name, created_at FROM organizations WHERE id = ?",
            (organization_id,),
        ).fetchone()
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "created_at": row["created_at"],
        }
    finally:
        conn.close()


def _user_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "password_hash": row["password_hash"],
        "created_at": row["created_at"],
    }


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "organization_id": row["organization_id"],
        "input_text": row["input_text"],
        "normalized_text": row["normalized_text"],
        "category": row["category"],
        "confidence": row["confidence"],
        "summary": row["summary"],
        "risk": row["risk"],
        "needs_human": bool(row["needs_human"]),
        "route_to": row["route_to"],
        "status": row["status"],
        "error_reason": row["error_reason"],
        "assigned_to": row["assigned_to"],
        "updated_at": row["updated_at"],
        "timestamp": row["timestamp"],
    }
