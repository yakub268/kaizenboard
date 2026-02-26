"""
Quick integration test for the work_projects router.
Uses a temp file SQLite DB (avoids in-memory engine sharing issues with
startup_event, which runs create_all on the same engine reference imported
at module load time in main.py).
"""
import sys
import os
import tempfile

sys.path.insert(0, os.path.dirname(__file__))

# ── 1. Point DATABASE_URL at a temp file BEFORE importing anything ─────────────
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
_TEST_DB_PATH = _tmp.name

# Monkey-patch database module URL and engine before any import chain loads them
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import database as _db_module

_test_engine = create_engine(
    f"sqlite:///{_TEST_DB_PATH}", connect_args={"check_same_thread": False}
)
_TestSession = sessionmaker(bind=_test_engine)

_db_module.engine = _test_engine
_db_module.SessionLocal = _TestSession
_db_module.DATABASE_URL = f"sqlite:///{_TEST_DB_PATH}"

# ── 2. Import models + create tables via test engine ──────────────────────────
import models  # noqa: F401
from database import Base

# Also patch main's engine reference before startup_event fires
import main as _main_module

_main_module.engine = _test_engine
_main_module.SessionLocal = _TestSession
Base.metadata.create_all(bind=_test_engine)

# ── 3. Seed ────────────────────────────────────────────────────────────────────
_seed_db = _TestSession()
_main_module.seed_database(_seed_db)
_main_module.seed_work_projects(_seed_db)
_seed_db.close()

# ── 4. Override get_db ─────────────────────────────────────────────────────────
from database import get_db


def _override_get_db():
    db = _TestSession()
    try:
        yield db
    finally:
        db.close()


_main_module.app.dependency_overrides[get_db] = _override_get_db

# ── 5. Test client ─────────────────────────────────────────────────────────────
from fastapi.testclient import TestClient

client = TestClient(_main_module.app, raise_server_exceptions=True)

# ── 6. Tests ───────────────────────────────────────────────────────────────────


def test_list_work_projects():
    r = client.get("/api/work/projects")
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 5
    titles = [p["title"] for p in data]
    assert "DDV5 Warehouse Management System" in titles
    assert "Amazon AI / Cedric Integration" in titles
    # Every project has todos and a time_summary
    for p in data:
        assert isinstance(p["todos"], list)
        assert p["time_summary"]["total_seconds"] == 0
    ddv5 = next(p for p in data if p["title"] == "DDV5 Warehouse Management System")
    assert len(ddv5["todos"]) == 5
    print(f"  PASS  list_work_projects ({len(data)} projects)")


def test_create_and_list_todo():
    proj_id = client.get("/api/work/projects").json()[0]["id"]
    r = client.post(f"/api/work/{proj_id}/todos", json={"text": "Test task", "order_index": 99})
    assert r.status_code == 201, r.text
    todo = r.json()
    assert todo["text"] == "Test task"
    assert todo["completed"] is False
    assert todo["completed_at"] is None

    r2 = client.get(f"/api/work/{proj_id}/todos")
    assert r2.status_code == 200
    texts = [t["text"] for t in r2.json()]
    assert "Test task" in texts
    print(f"  PASS  create_and_list_todo (todo id={todo['id']})")
    return todo["id"], proj_id


def test_toggle_todo(todo_id):
    r = client.patch(f"/api/work/todos/{todo_id}/toggle")
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["completed"] is True
    assert t["completed_at"] is not None

    # Toggle back
    r2 = client.patch(f"/api/work/todos/{todo_id}/toggle")
    assert r2.status_code == 200
    assert r2.json()["completed"] is False
    assert r2.json()["completed_at"] is None
    print(f"  PASS  toggle_todo (id={todo_id})")


def test_update_todo(todo_id):
    r = client.patch(f"/api/work/todos/{todo_id}", json={"text": "Renamed task", "order_index": 5})
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["text"] == "Renamed task"
    assert t["order_index"] == 5
    print(f"  PASS  update_todo")


def test_delete_todo(todo_id, proj_id):
    r = client.delete(f"/api/work/todos/{todo_id}")
    assert r.status_code == 204, r.text
    # Confirm gone
    todos = client.get(f"/api/work/{proj_id}/todos").json()
    assert not any(t["id"] == todo_id for t in todos)
    print(f"  PASS  delete_todo")


def test_404_missing_initiative():
    r = client.get("/api/work/9999/todos")
    assert r.status_code == 404
    r2 = client.post("/api/work/9999/todos", json={"text": "x"})
    assert r2.status_code == 404
    print(f"  PASS  404_missing_initiative")


def test_timer_start_stop():
    proj_id = client.get("/api/work/projects").json()[0]["id"]

    # No active timer yet
    r = client.get("/api/work/time/active")
    assert r.status_code == 404

    # Start
    r = client.post("/api/work/time/start", json={"initiative_id": proj_id, "notes": "Session A"})
    assert r.status_code == 201, r.text
    entry = r.json()
    assert entry["end_time"] is None
    entry_id = entry["id"]

    # Active timer
    r = client.get("/api/work/time/active")
    assert r.status_code == 200
    active = r.json()
    assert active["initiative_id"] == proj_id
    assert active["elapsed_seconds"] >= 0

    # Stop
    r = client.post("/api/work/time/stop", json={"notes": "Done A"})
    assert r.status_code == 200, r.text
    stopped = r.json()
    assert stopped["end_time"] is not None
    assert stopped["duration_seconds"] is not None
    assert stopped["duration_seconds"] >= 0

    # No active timer after stop
    r = client.get("/api/work/time/active")
    assert r.status_code == 404

    print(f"  PASS  timer_start_stop (duration={stopped['duration_seconds']}s)")
    return proj_id


def test_timer_auto_stop_on_new_start():
    projects = client.get("/api/work/projects").json()
    proj_id1 = projects[0]["id"]
    proj_id2 = projects[1]["id"]

    # Start on project 1
    r = client.post("/api/work/time/start", json={"initiative_id": proj_id1})
    assert r.status_code == 201

    # Start on project 2 — should auto-stop project 1
    r = client.post("/api/work/time/start", json={"initiative_id": proj_id2})
    assert r.status_code == 201
    active = client.get("/api/work/time/active").json()
    assert active["initiative_id"] == proj_id2

    # Check project 1 has a completed entry
    entries1 = client.get(f"/api/work/time/{proj_id1}/entries").json()
    completed = [e for e in entries1 if e["end_time"] is not None]
    assert len(completed) >= 1

    # Stop project 2
    client.post("/api/work/time/stop", json={})
    print(f"  PASS  timer_auto_stop_on_new_start")


def test_time_summary_and_entries():
    proj_id = client.get("/api/work/projects").json()[0]["id"]

    r = client.get(f"/api/work/time/{proj_id}/summary")
    assert r.status_code == 200
    s = r.json()
    assert s["initiative_id"] == proj_id
    assert s["total_seconds"] >= 0
    assert s["session_count"] >= 0

    r2 = client.get(f"/api/work/time/{proj_id}/entries")
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)
    print(f"  PASS  time_summary_and_entries (sessions={s['session_count']}, total={s['total_seconds']}s)")


def test_stop_with_no_active_timer():
    # Ensure no active timer
    client.post("/api/work/time/stop", json={})  # may 404, that's fine
    r = client.post("/api/work/time/stop", json={})
    assert r.status_code == 404
    print(f"  PASS  stop_with_no_active_timer => 404")


if __name__ == "__main__":
    print("\nRunning work_projects integration tests...")
    test_list_work_projects()
    todo_id, proj_id = test_create_and_list_todo()
    test_toggle_todo(todo_id)
    test_update_todo(todo_id)
    test_404_missing_initiative()
    test_timer_start_stop()
    test_timer_auto_stop_on_new_start()
    test_time_summary_and_entries()
    test_delete_todo(todo_id, proj_id)
    test_stop_with_no_active_timer()
    print("\nAll tests passed.")
