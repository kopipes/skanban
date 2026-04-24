#!/usr/bin/env python3
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = ROOT_DIR / "skanban.db"
BACKUP_DIR = ROOT_DIR / "backups"


def init_db() -> None:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def load_state():
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT state_json FROM app_state WHERE id = 1").fetchone()
    if not row:
        return None
    try:
        return json.loads(row[0])
    except json.JSONDecodeError:
        return None


def save_state(state) -> None:
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO app_state (id, state_json, updated_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              state_json = excluded.state_json,
              updated_at = excluded.updated_at
            """,
            (payload, now),
        )
        conn.commit()


def list_backups():
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    candidates = [path for path in BACKUP_DIR.glob("*.db") if path.is_file()]
    candidates.sort(key=lambda item: item.stat().st_mtime, reverse=True)
    return [path.name for path in candidates]


def create_backup() -> str:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_name = f"skanban_{timestamp}.db"
    backup_path = BACKUP_DIR / backup_name
    with sqlite3.connect(DB_PATH) as source, sqlite3.connect(backup_path) as target:
        source.backup(target)
    return backup_name


def restore_backup(backup_name: str) -> str:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(backup_name).name
    backup_path = BACKUP_DIR / safe_name
    if not backup_path.exists() or not backup_path.is_file():
        raise FileNotFoundError("Backup file not found")
    with sqlite3.connect(backup_path) as source, sqlite3.connect(DB_PATH) as target:
        source.backup(target)
    return safe_name


class SkanbanHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json(200, {"ok": True, "db_path": str(DB_PATH)})
            return
        if path == "/api/state":
            self._json(200, {"state": load_state()})
            return
        if path == "/api/backups":
            self._json(200, {"backups": list_backups()})
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/state":
            self._json(404, {"error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"error": "Invalid JSON body"})
            return

        state = payload.get("state") if isinstance(payload, dict) else None
        if not isinstance(state, dict):
            self._json(400, {"error": "Field 'state' must be an object"})
            return

        save_state(state)
        self._json(200, {"ok": True})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/backup":
            backup_name = create_backup()
            self._json(200, {"ok": True, "backup_file": backup_name, "backups": list_backups()})
            return
        if path == "/api/restore":
            content_length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(content_length)
            try:
                payload = json.loads(raw.decode("utf-8")) if raw else {}
            except (UnicodeDecodeError, json.JSONDecodeError):
                self._json(400, {"error": "Invalid JSON body"})
                return

            backup_name = payload.get("backup_file") if isinstance(payload, dict) else None
            if not isinstance(backup_name, str) or not backup_name.strip():
                self._json(400, {"error": "Field 'backup_file' must be non-empty string"})
                return
            try:
                restored_name = restore_backup(backup_name.strip())
            except FileNotFoundError:
                self._json(404, {"error": "Backup file not found"})
                return
            self._json(
                200,
                {
                    "ok": True,
                    "restored_from": restored_name,
                    "state": load_state(),
                    "backups": list_backups(),
                },
            )
            return
        self._json(404, {"error": "Not found"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Skanban SQLite server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()

    init_db()
    server = ThreadingHTTPServer((args.host, args.port), SkanbanHandler)
    print(f"Serving on http://{args.host}:{args.port}")
    print(f"SQLite DB: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
