"""
Router: /api/claude/*

Surfaces Claude AI project tracking data by parsing MEMORY.md and
stats-cache.json, and syncs parsed projects into the Initiative table.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import CategoryEnum, ClaudeProjectTodo, ClaudeTimeEntry, Initiative, PriorityEnum, StatusEnum
from schemas import (
    BacklogItem,
    ClaudeActiveTimer,
    ClaudeProject,
    ClaudeProjectTodoCreate,
    ClaudeProjectTodoResponse,
    ClaudeTimeEntryResponse,
    ClaudeTimeEntryStart,
    ClaudeTimeEntryStop,
    ClaudeTimeSummary,
    DailyActivity,
    SessionStats,
    SyncResult,
)

router = APIRouter(prefix="/api/claude", tags=["claude"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _build_claude_time_summary(db: Session, slug: str) -> ClaudeTimeSummary:
    entries = (
        db.query(ClaudeTimeEntry)
        .filter(
            ClaudeTimeEntry.project_slug == slug,
            ClaudeTimeEntry.duration_seconds.isnot(None),
        )
        .all()
    )
    total = sum(e.duration_seconds for e in entries if e.duration_seconds)
    last = max((e.end_time for e in entries if e.end_time), default=None)
    return ClaudeTimeSummary(
        project_slug=slug,
        total_seconds=total,
        session_count=len(entries),
        last_session=last,
    )

# ── File paths ─────────────────────────────────────────────────────────────────

MEMORY_MD = Path(r"C:\Users\yakub\.claude\projects\C--Users-yakub\memory\MEMORY.md")
STATS_CACHE = Path(r"C:\Users\yakub\.claude\stats-cache.json")

# ── Parsing helpers ────────────────────────────────────────────────────────────

_PROJECT_MAP: dict[str, str] = {
    "trading bot": "Trading Bot",
    "jarvis": "JARVIS",
    "claude multi-agent": "Claude Multi-Agent Bridge",
    "open source": "Open Source Contributions",
}

_PROJECT_PATHS: dict[str, str] = {
    "JARVIS": r"C:/Users/yakub/.jarvis",
    "Trading Bot": r"C:/Users/yakub/Desktop/trading_bot",
    "Claude Multi-Agent Bridge": r"C:/Users/yakub/claude-multi-agent-bridge",
    "Open Source Contributions": None,
}

_PROJECT_URLS: dict[str, str] = {
    "JARVIS": "https://claude.ai/",
    "Trading Bot": "https://claude.ai/",
    "Claude Multi-Agent Bridge": "https://github.com/yakub268/claude-multi-agent-bridge",
    "Open Source Contributions": "https://github.com/yakub268",
}

_DATE_RE = re.compile(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}")


def _project_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _read_memory() -> str:
    if not MEMORY_MD.exists():
        return ""
    return MEMORY_MD.read_text(encoding="utf-8")


def _parse_sections(text: str) -> list[dict]:
    """Split markdown on ## headers, return list of {header, body} dicts."""
    if not text:
        return []
    parts = re.split(r"^## ", text, flags=re.MULTILINE)
    sections = []
    for part in parts:
        if not part.strip():
            continue
        lines = part.splitlines()
        header = lines[0].strip()
        body = "\n".join(lines[1:]).strip()
        sections.append({"header": header, "body": body})
    return sections


def _classify_project(header: str) -> Optional[str]:
    lower = header.lower()
    for keyword, name in _PROJECT_MAP.items():
        if keyword in lower:
            return name
    return None


def _extract_date(header: str) -> Optional[str]:
    m = _DATE_RE.search(header)
    return m.group(0) if m else None


def _body_to_notes(body: str) -> list[str]:
    notes = []
    for line in body.splitlines():
        line = line.strip()
        if line.startswith(("-", "*", "+")):
            notes.append(line.lstrip("-*+ ").strip())
        elif line.startswith("**") and "**:" in line:
            # bold key-value lines e.g. **Phase 9 Priority A — DONE**:
            notes.append(line.strip("*").strip())
    return [n for n in notes if n]


def _infer_status(header: str, body: str) -> str:
    combined = (header + " " + body).lower()
    if "backlog" in combined or "deferred" in combined or "paused" in combined:
        return "deferred"
    if "complete" in combined or "done" in combined or "launched" in combined:
        return "active"  # still active / being used; "done" means a phase is done
    return "active"


def _infer_phase(header: str, body: str) -> Optional[str]:
    """Pull phase mentions from header or first few lines of body."""
    phase_re = re.compile(r"phase\s+\d+[^,.\n]*", re.IGNORECASE)
    # prefer header
    m = phase_re.search(header)
    if m:
        return m.group(0).strip()
    # fallback: first match in body
    m = phase_re.search(body)
    if m:
        return m.group(0).strip()
    return None


def _parse_projects() -> list[ClaudeProject]:
    sections = _parse_sections(_read_memory())
    grouped: dict[str, dict] = {}  # name -> aggregated data

    for sec in sections:
        header = sec["header"]
        body = sec["body"]
        name = _classify_project(header)
        if name is None:
            continue

        if name not in grouped:
            grouped[name] = {
                "name": name,
                "status": "active",
                "phase": None,
                "last_updated": None,
                "notes": [],
                "section_header": header,
            }

        entry = grouped[name]
        # keep the most recent section header (last one wins)
        entry["section_header"] = header

        # last_updated: take the latest date found across all headers
        d = _extract_date(header)
        if d:
            entry["last_updated"] = d

        entry["notes"].extend(_body_to_notes(body))

        phase = _infer_phase(header, body)
        if phase:
            entry["phase"] = phase

        if _infer_status(header, body) == "deferred":
            entry["status"] = "deferred"

    for name, entry in grouped.items():
        entry["claude_url"] = _PROJECT_URLS.get(name)
        entry["project_path"] = _PROJECT_PATHS.get(name)
        entry["id"] = _project_slug(name)

    return [ClaudeProject(**v) for v in grouped.values()]


def _parse_backlog() -> list[BacklogItem]:
    sections = _parse_sections(_read_memory())
    for sec in sections:
        if "backlog" in sec["header"].lower():
            items = []
            for line in sec["body"].splitlines():
                line = line.strip()
                if not line or not line.startswith(("-", "*", "+")):
                    continue
                text = line.lstrip("-*+ ").strip()
                # split on " — " or " - " to extract reason
                parts = re.split(r"\s[—\-]\s", text, maxsplit=1)
                if len(parts) == 2:
                    items.append(BacklogItem(text=parts[0].strip(), reason=parts[1].strip()))
                else:
                    items.append(BacklogItem(text=text, reason=None))
            return items
    return []


def _status_to_initiative_status(project_status: str) -> StatusEnum:
    mapping = {
        "active": StatusEnum.implement,
        "deferred": StatusEnum.identify,
        "complete": StatusEnum.sustain,
    }
    return mapping.get(project_status, StatusEnum.identify)


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/projects", response_model=List[ClaudeProject])
def list_claude_projects(db: Session = Depends(get_db)) -> List[ClaudeProject]:
    projects = _parse_projects()
    slugs = [p.id for p in projects]
    todos_all = (
        db.query(ClaudeProjectTodo)
        .filter(ClaudeProjectTodo.project_slug.in_(slugs))
        .order_by(ClaudeProjectTodo.order_index)
        .all()
    )
    todos_map: dict[str, list] = {}
    for t in todos_all:
        todos_map.setdefault(t.project_slug, []).append(
            ClaudeProjectTodoResponse.model_validate(t)
        )
    for p in projects:
        p.todos = todos_map.get(p.id, [])
        p.time_summary = _build_claude_time_summary(db, p.id)
    return projects


@router.get("/projects/{slug}/todos", response_model=List[ClaudeProjectTodoResponse])
def list_claude_todos(slug: str, db: Session = Depends(get_db)):
    return (
        db.query(ClaudeProjectTodo)
        .filter(ClaudeProjectTodo.project_slug == slug)
        .order_by(ClaudeProjectTodo.order_index)
        .all()
    )


@router.post("/projects/{slug}/todos", response_model=ClaudeProjectTodoResponse, status_code=201)
def create_claude_todo(slug: str, payload: ClaudeProjectTodoCreate, db: Session = Depends(get_db)):
    todo = ClaudeProjectTodo(
        project_slug=slug,
        text=payload.text,
        order_index=payload.order_index,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.patch("/todos/{todo_id}/toggle", response_model=ClaudeProjectTodoResponse)
def toggle_claude_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.query(ClaudeProjectTodo).filter(ClaudeProjectTodo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    todo.completed = not todo.completed
    todo.completed_at = datetime.now(timezone.utc).replace(tzinfo=None) if todo.completed else None
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/todos/{todo_id}", status_code=204)
def delete_claude_todo(todo_id: int, db: Session = Depends(get_db)):
    todo = db.query(ClaudeProjectTodo).filter(ClaudeProjectTodo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()


@router.get("/sessions", response_model=SessionStats)
def get_session_stats() -> SessionStats:
    if not STATS_CACHE.exists():
        return SessionStats(
            total_sessions=0,
            total_messages=0,
            daily_activity=[],
            most_active_hour=None,
            streak_days=0,
        )

    raw = json.loads(STATS_CACHE.read_text(encoding="utf-8"))

    daily_raw: list[dict] = raw.get("dailyActivity", [])
    daily = [
        DailyActivity(
            date=d["date"],
            messageCount=d.get("messageCount", 0),
            sessionCount=d.get("sessionCount", 0),
            toolCallCount=d.get("toolCallCount", 0),
        )
        for d in daily_raw
    ]

    # most active hour — hourCounts may be a list or a {"hour": count} dict
    hour_counts_raw = raw.get("hourCounts", [])
    most_active_hour: Optional[int] = None
    if hour_counts_raw:
        if isinstance(hour_counts_raw, dict):
            most_active_hour = int(max(hour_counts_raw, key=lambda k: hour_counts_raw[k]))
        elif isinstance(hour_counts_raw, list) and hour_counts_raw:
            most_active_hour = int(hour_counts_raw.index(max(hour_counts_raw)))

    # streak: consecutive days with activity up to today
    today = date.today()
    active_dates = {
        date.fromisoformat(d["date"])
        for d in daily_raw
        if d.get("messageCount", 0) > 0
    }
    streak = 0
    check = today
    while check in active_dates:
        streak += 1
        check = date.fromordinal(check.toordinal() - 1)

    return SessionStats(
        total_sessions=raw.get("totalSessions", 0),
        total_messages=raw.get("totalMessages", 0),
        daily_activity=daily,
        most_active_hour=most_active_hour,
        streak_days=streak,
    )


@router.post("/sync", response_model=SyncResult)
def sync_projects(db: Session = Depends(get_db)) -> SyncResult:
    projects = _parse_projects()
    created = 0
    updated = 0
    synced_names: list[str] = []

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for proj in projects:
        description = "; ".join(proj.notes) if proj.notes else None
        initiative_status = _status_to_initiative_status(proj.status)

        existing = (
            db.query(Initiative)
            .filter(
                Initiative.title == proj.name,
                Initiative.department == "Claude AI",
            )
            .first()
        )

        if existing:
            existing.description = description
            existing.status = initiative_status
            existing.updated_at = now
            updated += 1
        else:
            initiative = Initiative(
                title=proj.name,
                description=description,
                category=CategoryEnum.ai_project,
                status=initiative_status,
                priority=PriorityEnum.high,
                owner="Jacob",
                department="Claude AI",
                created_at=now,
                updated_at=now,
            )
            db.add(initiative)
            created += 1

        synced_names.append(proj.name)

    db.commit()
    return SyncResult(created=created, updated=updated, projects=synced_names)


@router.post("/time/start", response_model=ClaudeTimeEntryResponse, status_code=201)
def start_claude_timer(payload: ClaudeTimeEntryStart, db: Session = Depends(get_db)):
    active = db.query(ClaudeTimeEntry).filter(ClaudeTimeEntry.end_time.is_(None)).first()
    if active:
        now = _utcnow()
        active.end_time = now
        active.duration_seconds = int((now - active.start_time).total_seconds())

    now = _utcnow()
    entry = ClaudeTimeEntry(project_slug=payload.project_slug, start_time=now, notes=payload.notes)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/time/stop", response_model=ClaudeTimeEntryResponse)
def stop_claude_timer(payload: ClaudeTimeEntryStop, db: Session = Depends(get_db)):
    active = db.query(ClaudeTimeEntry).filter(ClaudeTimeEntry.end_time.is_(None)).first()
    if not active:
        raise HTTPException(status_code=404, detail="No active timer running")

    now = _utcnow()
    active.end_time = now
    active.duration_seconds = int((now - active.start_time).total_seconds())
    if payload.notes is not None:
        active.notes = payload.notes

    db.commit()
    db.refresh(active)
    return active


@router.get("/time/active", response_model=ClaudeActiveTimer)
def get_claude_active_timer(db: Session = Depends(get_db)):
    active = db.query(ClaudeTimeEntry).filter(ClaudeTimeEntry.end_time.is_(None)).first()
    if not active:
        raise HTTPException(status_code=404, detail="No active timer running")

    projects = _parse_projects()
    proj = next((p for p in projects if p.id == active.project_slug), None)
    elapsed = int((_utcnow() - active.start_time).total_seconds())
    return ClaudeActiveTimer(
        project_slug=active.project_slug,
        project_name=proj.name if proj else active.project_slug,
        start_time=active.start_time,
        elapsed_seconds=elapsed,
    )


@router.get("/time/{slug}/summary", response_model=ClaudeTimeSummary)
def get_claude_time_summary(slug: str, db: Session = Depends(get_db)):
    return _build_claude_time_summary(db, slug)


@router.get("/backlog", response_model=List[BacklogItem])
def get_backlog() -> List[BacklogItem]:
    return _parse_backlog()
