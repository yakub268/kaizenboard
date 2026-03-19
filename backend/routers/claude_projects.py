"""
Router: /api/claude/*

Surfaces Claude AI project tracking data by parsing MEMORY.md and
stats-cache.json, and syncs parsed projects into the Initiative table.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import CategoryEnum, ClaudeProjectTodo, ClaudeRegisteredProject, ClaudeSessionClassification, ClaudeTimeEntry, Initiative, PriorityEnum, StatusEnum
from schemas import (
    BacklogItem,
    ClaudeActiveTimer,
    ClaudeProject,
    ClaudeProjectRegister,
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
    "claude improvement": "Claude Improvement",
    "open source": "Open Source Contributions",
    "mirror behavioral": "Mirror — Behavioral Tracking",
    "mirror ": "Mirror — Behavioral Tracking",
    "luna dementia": "Luna Dementia Companion",
    "luna ": "Luna Dementia Companion",
    "nuc (intel": "Luna Dementia Companion",
    "kaizenboard": "KaizenBoard",
    "mlb telegram": "MLB Alert System",
    "mlb alert": "MLB Alert System",
}

_PROJECT_PATHS: dict[str, str] = {
    "JARVIS": r"C:/Users/yakub/.jarvis",
    "Trading Bot": r"C:/Users/yakub/Desktop/trading_bot",
    "Claude Multi-Agent Bridge": r"C:/Users/yakub/claude-multi-agent-bridge",
    "Claude Improvement": r"C:/Users/yakub/claude-improvement",
    "Open Source Contributions": None,
    "Mirror — Behavioral Tracking": r"C:/Users/yakub/.mirror",
    "Luna Dementia Companion": r"C:/jarvis",
    "KaizenBoard": r"C:/Users/yakub/kaizenboard",
    "MLB Alert System": r"C:/Users/yakub/Desktop/trading_bot",
}

_PROJECT_URLS: dict[str, str] = {
    "JARVIS": "https://claude.ai/",
    "Trading Bot": "https://claude.ai/",
    "Claude Multi-Agent Bridge": "https://github.com/yakub268/claude-multi-agent-bridge",
    "Claude Improvement": "https://claude.ai/",
    "Open Source Contributions": "https://github.com/yakub268",
    "Mirror — Behavioral Tracking": "https://claude.ai/",
    "Luna Dementia Companion": "https://claude.ai/",
    "KaizenBoard": "https://claude.ai/",
    "MLB Alert System": "https://claude.ai/",
}

# ── Code session scanning ──────────────────────────────────────────────────────

_CODE_PROJECTS_DIR = Path(r"C:\Users\yakub\.claude\projects")

# Map .claude/projects/ dir names → canonical project names
_DIR_TO_PROJECT: dict[str, str] = {
    "C--Users-yakub-Desktop-trading-bot": "Trading Bot",
    "C--Users-yakub-Desktop-trading_bot": "Trading Bot",
    "C--Users-yakub--jarvis": "JARVIS",
    "C--Users-yakub-Desktop-good-first-issue": "Open Source Contributions",
    "C--dev-projects-ai-orchestration-blueprint": "AI Orchestration Blueprint",
    "C--dev-projects-claude-multi-agent-bridge": "Claude Multi-Agent Bridge",
    "C--Users-yakub-Desktop-claude-multi-agent-bridge": "Claude Multi-Agent Bridge",
    "C--Users-yakub--claude-skills-skill-creator-local": "Claude Improvement",
    "C--Users-yakub-Desktop-kalshi-mcp": "Kalshi MCP",
    "C--Users-yakub-Desktop-StellArts": "StellArts",
    "C--Users-yakub-Desktop-AWS_Cloud_Practitioner_Study": "AWS Cloud Practitioner Study",
    "C--Users-yakub-kaizenboard": "KaizenBoard",
    "C--Users-yakub--mirror": "Mirror Behavioral Tracking",
    "C--Users-yakub": "Claude Improvement",  # main workspace = Claude Code work
    "C--": "Claude Improvement",
}


def _scan_code_sessions() -> dict[str, dict]:
    """Return {project_slug: {code_sessions, code_last_session}} from .claude/projects dirs."""
    result: dict[str, dict] = {}
    if not _CODE_PROJECTS_DIR.exists():
        return result
    for proj_dir in _CODE_PROJECTS_DIR.iterdir():
        if not proj_dir.is_dir():
            continue
        jsonls = list(proj_dir.glob("*.jsonl"))
        if not jsonls:
            continue
        proj_name = _DIR_TO_PROJECT.get(proj_dir.name)
        if not proj_name:
            continue
        slug = _project_slug(proj_name)
        mtimes = [f.stat().st_mtime for f in jsonls]
        last_dt = datetime.fromtimestamp(max(mtimes), tz=timezone.utc).replace(tzinfo=None)
        if slug in result:
            result[slug]["code_sessions"] += len(jsonls)
            if last_dt > result[slug]["code_last_session"]:
                result[slug]["code_last_session"] = last_dt
        else:
            result[slug] = {"code_sessions": len(jsonls), "code_last_session": last_dt}
    return result

# ── Session classifier ────────────────────────────────────────────────────────

_CLASSIFY_BATCH = 30   # sessions per LLM call

# Keyword rules: first match wins. Ordered most-specific first.
_KEYWORD_RULES: list[tuple[list[str], str]] = [
    # Most specific first to avoid false positives
    (["mirror behavioral", "behavioral tracking", "ps cmd history",
      "powershell history collector", "phase 1 running", "phase 2 (pattern"], "Mirror — Behavioral Tracking"),
    (["luna dementia", "dementia companion", "dementia ai", "brenda",
      "qwen3", "nuc project", "memory care", "ai companion for mom",
      "companion for mom"], "Luna Dementia Companion"),
    (["multi-agent bridge", "claude bridge", "flask server port 5001",
      "agent bridge", "cross-session"], "Claude Multi-Agent Bridge"),
    (["mlb alert", "baseball betting", "mlb model", "sportsbook alert",
      "mlb telegram"], "MLB Alert System"),
    (["kalshi mcp", "kalshi-mcp", "kalshi prediction", "kalshi api"], "Kalshi MCP"),
    (["autogpt pr", "anthropic cookbook", "open source pr",
      "github pr #", "good-first-issue", "good first issue"], "Open Source Contributions"),
    (["trading bot", "alpaca api", "fleet bot", "fleet_orchest", "kalshi bot",
      "kelly criterion", "drawdown", "backtest", "vps deploy",
      "bot performance", "trading strategy", "prediction market bot",
      "integrate the alpaca", "scrapes earnings", "how are the trading bots",
      "are the bots doing"], "Trading Bot"),
    (["jarvis", "start-jarvis", "jarvis project", "jarvis companion",
      "full audit of the jarvis", ".jarvis"], "JARVIS"),
    (["kaizenboard", "kaizen board", "session classifier", "session classification",
      "classify session", "claude projects page on the kaizen"], "KaizenBoard"),
    (["ai orchestration", "orchestration blueprint", "chatgpt > claude",
      "semgrep scan"], "AI Orchestration Blueprint"),
    (["stellarts", "stell arts"], "StellArts"),
    (["aws cloud practitioner", "aws certification", "cloud practitioner study"], "AWS Cloud Practitioner Study"),
    (["ddv5", "warehouse system", "dwelling time", "warehouse dashboard",
      "labor board", "package count", "scc download", "warehouse cluster"], "DDV5 Warehouse System"),
    (["claude code feature", "mcp server setup", "claude plugin",
      "claude hook", "claude desktop project", "slash command",
      "agent sdk", "claude improvement", "claude tools hub",
      "skills eval", "prompt-quality skill", "mentor-mode skill"], "Claude Improvement"),
]


def _keyword_classify(message: str) -> Optional[str]:
    """Fast free classification via keyword matching. Returns project name or None."""
    lower = message.lower()
    for keywords, project in _KEYWORD_RULES:
        if any(kw in lower for kw in keywords):
            return project
    return None


def _extract_first_user_message(jsonl_path: Path) -> Optional[str]:
    """Read the first substantive user message from a session JSONL."""
    try:
        with jsonl_path.open("r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if obj.get("type") != "user":
                    continue
                msg = obj.get("message", {})
                content = msg.get("content", "")
                text = ""
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            text = part["text"].strip()
                            break
                elif isinstance(content, str):
                    text = content.strip()
                if len(text) >= 15:
                    return text[:600]
    except Exception:
        pass
    return None


def _classify_batch_with_groq(sessions: list[dict], project_names: list[str]) -> list[dict]:
    """
    Free fallback: send ambiguous sessions to Groq (llama-3.3-70b, free tier).
    sessions: [{"id": str, "dir": str, "message": str}]
    Returns: [{"n": int, "project": str, "conf": float}]
    """
    from openai import OpenAI

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return []

    proj_list = ", ".join(f'"{p}"' for p in project_names) + ', "Other/Unknown"'
    numbered = "\n".join(
        f'{i+1}. [{s["dir"]}] {s["message"][:300]}'
        for i, s in enumerate(sessions)
    )
    prompt = f"""Classify each Claude Code session into exactly one project based on the first user message. Projects: {proj_list}

Sessions:
{numbered}

Respond ONLY with a JSON array, one object per session, in order:
[{{"n":1,"project":"Trading Bot","conf":0.95}}, ...]

Use "Other/Unknown" when genuinely unclear. conf is 0.0-1.0."""

    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = resp.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE).strip()
        return json.loads(raw)
    except Exception:
        return []


def classify_new_sessions(db: Session) -> dict:
    """
    Scan all JSONL files, classify unclassified ones with Haiku, store results.
    Returns {"classified": int, "skipped": int, "total_new": int}
    """
    # Get all known project names from DB-backed + memory projects
    all_projects = _parse_projects()
    registered = db.query(ClaudeRegisteredProject).all()
    project_names = list({p.name for p in all_projects} | {r.name for r in registered})

    # Build set of already-classified session IDs
    known_ids = {
        row.session_id
        for row in db.query(ClaudeSessionClassification.session_id).all()
    }

    # Collect unclassified sessions
    unclassified: list[dict] = []
    if _CODE_PROJECTS_DIR.exists():
        for proj_dir in _CODE_PROJECTS_DIR.iterdir():
            if not proj_dir.is_dir():
                continue
            for jsonl in proj_dir.glob("*.jsonl"):
                sid = jsonl.stem
                if sid in known_ids:
                    continue
                msg = _extract_first_user_message(jsonl)
                if not msg:
                    # Store as unclassifiable so we don't retry forever
                    db.add(ClaudeSessionClassification(
                        session_id=sid,
                        project_dir=proj_dir.name,
                        project_slug=None,
                        project_name=None,
                        first_message=None,
                        confidence=0.0,
                        classified_at=datetime.now(timezone.utc).replace(tzinfo=None),
                    ))
                    continue
                unclassified.append({"id": sid, "dir": proj_dir.name, "message": msg})

    total_new = len(unclassified)
    classified_count = 0
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Pass 1: keyword matching (free, instant)
    needs_llm: list[dict] = []
    for sess in unclassified:
        proj_name = _keyword_classify(sess["message"])
        if proj_name:
            slug = _project_slug(proj_name)
            db.add(ClaudeSessionClassification(
                session_id=sess["id"],
                project_dir=sess["dir"],
                project_slug=slug,
                project_name=proj_name,
                first_message=sess["message"][:400],
                confidence=0.85,
                classified_at=now,
            ))
            classified_count += 1
        else:
            needs_llm.append(sess)

    # Pass 2: Groq (free tier) for ambiguous sessions
    for i in range(0, len(needs_llm), _CLASSIFY_BATCH):
        batch = needs_llm[i : i + _CLASSIFY_BATCH]
        results = _classify_batch_with_groq(batch, project_names)

        # If Groq failed, leave sessions unclassified so they retry next time
        if not results:
            continue

        result_map = {r["n"]: r for r in results if isinstance(r, dict)}
        for j, sess in enumerate(batch):
            r = result_map.get(j + 1, {})
            if not r:
                continue
            proj_name = r.get("project") or None
            if proj_name == "Other/Unknown":
                proj_name = None
            slug = _project_slug(proj_name) if proj_name else None
            conf = float(r.get("conf", 0.0))
            db.add(ClaudeSessionClassification(
                session_id=sess["id"],
                project_dir=sess["dir"],
                project_slug=slug,
                project_name=proj_name,
                first_message=sess["message"][:400],
                confidence=conf,
                classified_at=now,
            ))
            if proj_name:
                classified_count += 1

    db.commit()
    return {
        "classified": classified_count,
        "keyword_matched": total_new - len(needs_llm),
        "llm_sent": len(needs_llm),
        "skipped": total_new - classified_count,
        "total_new": total_new,
    }


def _get_session_activity_from_db(db: Session) -> dict[str, dict]:
    """
    Return {project_slug: {code_sessions, code_last_session, recent_topics}} from DB.
    Falls back to dir-scan for sessions not yet classified.
    """
    from sqlalchemy import func

    rows = (
        db.query(
            ClaudeSessionClassification.project_slug,
            func.count(ClaudeSessionClassification.id).label("cnt"),
            func.max(ClaudeSessionClassification.classified_at).label("last"),
        )
        .filter(ClaudeSessionClassification.project_slug.isnot(None))
        .group_by(ClaudeSessionClassification.project_slug)
        .all()
    )

    result: dict[str, dict] = {}
    for row in rows:
        slug = row.project_slug
        # Get last 3 session topics for this project
        recent = (
            db.query(ClaudeSessionClassification.first_message, ClaudeSessionClassification.classified_at)
            .filter(
                ClaudeSessionClassification.project_slug == slug,
                ClaudeSessionClassification.first_message.isnot(None),
            )
            .order_by(ClaudeSessionClassification.classified_at.desc())
            .limit(5)
            .all()
        )
        result[slug] = {
            "code_sessions": row.cnt,
            "code_last_session": row.last,
            "recent_topics": [r.first_message[:120] for r in recent],
        }
    return result


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


_MD_BOLD_RE = re.compile(r"\*{1,3}")


def _strip_md(text: str) -> str:
    """Strip markdown bold/italic markers."""
    return _MD_BOLD_RE.sub("", text).strip()


def _body_to_notes(body: str) -> list[str]:
    notes = []
    for line in body.splitlines():
        line = line.strip()
        if line.startswith(("-", "*", "+")):
            notes.append(_strip_md(line.lstrip("-*+ ")))
        elif line.startswith("**") and "**:" in line:
            notes.append(_strip_md(line))
    return [n for n in notes if n]


def _infer_status(header: str, body: str) -> str:
    # Only mark deferred if the section *header* says so — not body content
    header_lower = header.lower()
    if "backlog" in header_lower or "deferred" in header_lower:
        return "deferred"
    # Body: only flag deferred if an explicit whole-project deferral phrase appears
    body_lower = body.lower()
    if "monetization paused" in body_lower or "intentionally deferred" in body_lower:
        return "deferred"
    return "active"


def _infer_phase(header: str, body: str) -> Optional[str]:
    """Pull phase mentions from header or first few lines of body."""
    phase_re = re.compile(r"phase\s+\d+[^,.()\n]*", re.IGNORECASE)
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
                text = _strip_md(text)
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

def _registered_to_claude_project(r: ClaudeRegisteredProject) -> ClaudeProject:
    import json as _json
    notes = []
    if r.notes_json:
        try:
            notes = _json.loads(r.notes_json)
        except Exception:
            pass
    return ClaudeProject(
        id=r.slug,
        name=r.name,
        status=r.status,
        phase=r.phase,
        last_updated=r.updated_at.strftime("%b %d, %Y") if r.updated_at else None,
        notes=notes,
        section_header=r.name,
        claude_url=r.claude_url,
        project_path=r.project_path,
        source="registered",
    )


@router.get("/projects", response_model=List[ClaudeProject])
def list_claude_projects(db: Session = Depends(get_db)) -> List[ClaudeProject]:
    projects = _parse_projects()
    code_activity = _scan_code_sessions()

    # Merge in manually registered projects (don't overwrite MEMORY.md ones)
    memory_slugs = {p.id for p in projects}
    registered = db.query(ClaudeRegisteredProject).all()
    for r in registered:
        if r.slug not in memory_slugs:
            projects.append(_registered_to_claude_project(r))

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
    # Prefer DB-classified activity; fall back to dir-scan if DB is empty
    db_activity = _get_session_activity_from_db(db)
    activity = db_activity if db_activity else code_activity

    for p in projects:
        p.todos = todos_map.get(p.id, [])
        p.time_summary = _build_claude_time_summary(db, p.id)
        if p.id in activity:
            p.code_sessions = activity[p.id]["code_sessions"]
            p.code_last_session = activity[p.id]["code_last_session"]
            p.recent_topics = activity[p.id].get("recent_topics", [])
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


@router.post("/classify", status_code=200)
def classify_sessions(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Classify all unclassified Claude Code sessions using Haiku.
    Runs in the background — returns immediately with a count of pending sessions.
    """
    # Count unclassified first so we can return immediately
    known_ids = {row.session_id for row in db.query(ClaudeSessionClassification.session_id).all()}
    pending = 0
    if _CODE_PROJECTS_DIR.exists():
        for proj_dir in _CODE_PROJECTS_DIR.iterdir():
            if proj_dir.is_dir():
                pending += sum(1 for j in proj_dir.glob("*.jsonl") if j.stem not in known_ids)

    def _run(db_session: Session):
        result = classify_new_sessions(db_session)
        db_session.close()

    from database import SessionLocal
    background_tasks.add_task(_run, SessionLocal())
    return {"status": "started", "pending_sessions": pending}


@router.post("/sync", response_model=SyncResult)
def sync_projects(background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> SyncResult:
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

    # Kick off background classification of any new sessions
    from database import SessionLocal
    background_tasks.add_task(classify_new_sessions, SessionLocal())

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


@router.post("/projects/register", response_model=ClaudeProject, status_code=201)
def register_project(payload: ClaudeProjectRegister, db: Session = Depends(get_db)):
    import json as _json
    slug = _project_slug(payload.name)
    existing = db.query(ClaudeRegisteredProject).filter(ClaudeRegisteredProject.slug == slug).first()
    now = _utcnow()
    if existing:
        existing.name = payload.name
        existing.status = payload.status
        existing.phase = payload.phase
        existing.notes_json = _json.dumps(payload.notes)
        existing.claude_url = payload.claude_url
        existing.project_path = payload.project_path
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return _registered_to_claude_project(existing)
    reg = ClaudeRegisteredProject(
        slug=slug,
        name=payload.name,
        status=payload.status,
        phase=payload.phase,
        notes_json=_json.dumps(payload.notes),
        claude_url=payload.claude_url,
        project_path=payload.project_path,
        created_at=now,
        updated_at=now,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return _registered_to_claude_project(reg)


@router.delete("/projects/register/{slug}", status_code=204)
def unregister_project(slug: str, db: Session = Depends(get_db)):
    reg = db.query(ClaudeRegisteredProject).filter(ClaudeRegisteredProject.slug == slug).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registered project not found")
    db.delete(reg)
    db.commit()


@router.get("/projects/{slug}/sessions")
def get_project_sessions(slug: str, limit: int = 10, db: Session = Depends(get_db)):
    """Return classified sessions for a project, most recent first."""
    try:
        rows = (
            db.query(ClaudeSessionClassification)
            .filter(
                ClaudeSessionClassification.project_slug == slug,
                ClaudeSessionClassification.first_message.isnot(None),
            )
            .order_by(ClaudeSessionClassification.classified_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "session_id": r.session_id,
                "first_message": r.first_message,
                "confidence": r.confidence,
                "classified_at": r.classified_at.isoformat() if r.classified_at else None,
            }
            for r in rows
        ]
    except Exception:
        return []


@router.get("/stats/summary")
def get_claude_stats_summary(db: Session = Depends(get_db)):
    """Aggregate stats for dashboard: total sessions, projects, most active project."""
    try:
        from sqlalchemy import func

        total_sessions = (
            db.query(func.count(ClaudeSessionClassification.id))
            .filter(ClaudeSessionClassification.project_slug.isnot(None))
            .scalar()
        ) or 0

        project_count = (
            db.query(func.count(func.distinct(ClaudeSessionClassification.project_slug)))
            .filter(ClaudeSessionClassification.project_slug.isnot(None))
            .scalar()
        ) or 0

        most_active = (
            db.query(
                ClaudeSessionClassification.project_name,
                func.count(ClaudeSessionClassification.id).label("cnt"),
            )
            .filter(ClaudeSessionClassification.project_slug.isnot(None))
            .group_by(ClaudeSessionClassification.project_name)
            .order_by(func.count(ClaudeSessionClassification.id).desc())
            .first()
        )

        return {
            "total_sessions": total_sessions,
            "active_projects": project_count,
            "most_active_project": most_active[0] if most_active else None,
            "most_active_sessions": most_active[1] if most_active else 0,
        }
    except Exception:
        return {"total_sessions": 0, "active_projects": 0, "most_active_project": None, "most_active_sessions": 0}


@router.get("/costs")
def get_project_costs():
    """Return per-project token usage and estimated cost from cached JSON."""
    try:
        costs_file = Path(os.path.dirname(__file__)).parent / "project_costs.json"
        if not costs_file.exists():
            return []
        return json.loads(costs_file.read_text(encoding="utf-8"))
    except Exception:
        return []


@router.get("/backlog", response_model=List[BacklogItem])
def get_backlog() -> List[BacklogItem]:
    return _parse_backlog()
