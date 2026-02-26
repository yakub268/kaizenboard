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

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import CategoryEnum, Initiative, PriorityEnum, StatusEnum
from schemas import BacklogItem, ClaudeProject, DailyActivity, SessionStats, SyncResult

router = APIRouter(prefix="/api/claude", tags=["claude"])

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

_DATE_RE = re.compile(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}")


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
def list_claude_projects() -> List[ClaudeProject]:
    return _parse_projects()


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


@router.get("/backlog", response_model=List[BacklogItem])
def get_backlog() -> List[BacklogItem]:
    return _parse_backlog()
