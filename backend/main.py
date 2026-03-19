import logging
import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta

from database import engine, SessionLocal, Base
from models import Initiative, Metric, Activity, Todo, TimeEntry, ClaudeProjectTodo, CategoryEnum, StatusEnum, PriorityEnum
import models  # registers all models with Base

from routers import initiatives, metrics, dashboard, claude_projects, work_projects

logger = logging.getLogger(__name__)

app = FastAPI(
    title="KaizenBoard API",
    description="Lean/continuous improvement initiative tracker",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(initiatives.router)
app.include_router(metrics.router)
app.include_router(dashboard.router)
app.include_router(claude_projects.router)
app.include_router(work_projects.router)

# Serve built React frontend
_DIST = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.isdir(_DIST):
    app.mount('/assets', StaticFiles(directory=os.path.join(_DIST, 'assets')), name='assets')

    @app.get('/{full_path:path}', include_in_schema=False)
    async def spa_fallback(full_path: str):
        return FileResponse(os.path.join(_DIST, 'index.html'))


def _utcnow(offset_days: int = 0) -> datetime:
    return (datetime.now(timezone.utc) + timedelta(days=offset_days)).replace(tzinfo=None)


SEED_DATA = [
    # ── 1 ─────────────────────────────────────────────────────────────────────
    {
        "initiative": {
            "title": "Reduce Order Processing Cycle Time",
            "description": (
                "Customer orders currently flow through 7 manual handoffs across 3 departments "
                "before shipping confirmation. Mapping revealed 4 non-value-add steps totalling "
                "~2.5 hours per order. Target: single-piece flow with automated WMS triggers."
            ),
            "category": CategoryEnum.cycle_time,
            "status": StatusEnum.sustain,
            "priority": PriorityEnum.critical,
            "owner": "Maria Chen",
            "department": "Fulfillment",
            "target_date": _utcnow(-30),
            "completed_date": _utcnow(-10),
        },
        "metrics": [
            {
                "name": "Average order processing time",
                "unit": "hours",
                "before_value": 4.5,
                "after_value": 0.75,
                "notes": "Measured over 200 orders pre and post implementation.",
            },
            {
                "name": "Manual handoffs per order",
                "unit": "count",
                "before_value": 7.0,
                "after_value": 2.0,
                "notes": "Eliminated receiving → staging → pick staging → sort steps.",
            },
        ],
        "activities": [
            ("Maria Chen", "created", "Initiative opened after VSM workshop revealed 55-min avg wait at Sort."),
            ("Maria Chen", "status_changed", "Status moved from 'identify' to 'analyze'."),
            ("Maria Chen", "status_changed", "Status moved from 'analyze' to 'plan'."),
            ("Maria Chen", "status_changed", "Status moved from 'plan' to 'implement'."),
            ("Maria Chen", "status_changed", "Status moved from 'implement' to 'verify'. Metrics show 83% reduction."),
            ("Maria Chen", "status_changed", "Status moved from 'verify' to 'sustain'. SOP updated, team trained."),
        ],
    },
    # ── 2 ─────────────────────────────────────────────────────────────────────
    {
        "initiative": {
            "title": "Eliminate Duplicate Data Entry in Receiving",
            "description": (
                "Receiving clerks manually re-key purchase order data into 3 separate systems "
                "(ERP, WMS, spreadsheet log). Each entry takes ~8 min and introduces transcription "
                "errors ~12% of the time. Goal: single scan-in with automated downstream sync."
            ),
            "category": CategoryEnum.waste_reduction,
            "status": StatusEnum.verify,
            "priority": PriorityEnum.high,
            "owner": "Derek Osei",
            "department": "Receiving",
            "target_date": _utcnow(14),
            "completed_date": None,
        },
        "metrics": [
            {
                "name": "Data entry time per PO line",
                "unit": "minutes",
                "before_value": 8.0,
                "after_value": 1.2,
                "notes": "Post-implementation sample of 150 PO lines.",
            },
            {
                "name": "Transcription error rate",
                "unit": "%",
                "before_value": 12.0,
                "after_value": 0.4,
                "notes": "Errors flagged by nightly ERP/WMS reconciliation job.",
            },
            {
                "name": "Annual labor cost — data entry",
                "unit": "$",
                "before_value": 34400.0,
                "after_value": 5160.0,
                "notes": "Estimated from avg clerk wage $21.50/hr × hours saved.",
            },
        ],
        "activities": [
            ("Derek Osei", "created", "Spaghetti diagram showed 3 separate workstations per receipt."),
            ("Derek Osei", "status_changed", "Status moved from 'identify' to 'analyze'."),
            ("Derek Osei", "status_changed", "Status moved from 'analyze' to 'plan'. Barcode middleware selected."),
            ("Derek Osei", "status_changed", "Status moved from 'plan' to 'implement'."),
            ("Derek Osei", "metric_added", "Baseline measurements locked before go-live."),
            ("Derek Osei", "status_changed", "Status moved from 'implement' to 'verify'. 30-day pilot running."),
        ],
    },
    # ── 3 ─────────────────────────────────────────────────────────────────────
    {
        "initiative": {
            "title": "Reduce Defect Rate on Line 3 — Weld Station",
            "description": (
                "Line 3's weld station generates 18% first-pass yield failure — 3× the plant average. "
                "Root cause analysis (5-Why + fishbone) traced to worn electrode tips (replaced only "
                "on failure vs. scheduled) and operator variation in tip-dress frequency. "
                "Countermeasures: PM schedule every 200 welds, poka-yoke counter, control chart posted."
            ),
            "category": CategoryEnum.quality,
            "status": StatusEnum.sustain,
            "priority": PriorityEnum.critical,
            "owner": "Priya Nair",
            "department": "Manufacturing — Line 3",
            "target_date": _utcnow(-60),
            "completed_date": _utcnow(-45),
        },
        "metrics": [
            {
                "name": "First-pass yield",
                "unit": "%",
                "before_value": 82.0,
                "after_value": 97.1,
                "notes": "Tracked via vision system, 30-day post-implementation window.",
            },
            {
                "name": "Rework labor hours per 1,000 units",
                "unit": "hours",
                "before_value": 14.2,
                "after_value": 1.8,
                "notes": "Clocked by rework cell supervisor.",
            },
            {
                "name": "Monthly scrap cost",
                "unit": "$",
                "before_value": 9800.0,
                "after_value": 1230.0,
                "notes": "Scrap tickets pulled from ERP. Annualised savings ~$103k.",
            },
        ],
        "activities": [
            ("Priya Nair", "created", "Quality audit flagged L3 weld rejection rate 3× plant avg."),
            ("Priya Nair", "status_changed", "Status moved from 'identify' to 'analyze'. 5-Why completed."),
            ("Priya Nair", "status_changed", "Status moved from 'analyze' to 'plan'. PM schedule drafted."),
            ("Priya Nair", "status_changed", "Status moved from 'plan' to 'implement'. Counter installed."),
            ("Priya Nair", "status_changed", "Status moved from 'implement' to 'verify'. 2-week pilot shows 94% FPY."),
            ("Priya Nair", "status_changed", "Status moved from 'verify' to 'sustain'. Control chart showing stable."),
        ],
    },
    # ── 4 ─────────────────────────────────────────────────────────────────────
    {
        "initiative": {
            "title": "5S Warehouse Aisle Re-layout — Zone B",
            "description": (
                "Zone B pick paths average 340 m per pick cycle; top 20% SKUs by velocity are stored "
                "at the far end of the zone (legacy placement). Re-slotting puts fast movers near "
                "shipping dock. Also addresses cluttered overflow zones causing 2–3 near-misses/month."
            ),
            "category": CategoryEnum.safety,
            "status": StatusEnum.implement,
            "priority": PriorityEnum.high,
            "owner": "James Whitford",
            "department": "Warehouse",
            "target_date": _utcnow(7),
            "completed_date": None,
        },
        "metrics": [
            {
                "name": "Average travel distance per pick",
                "unit": "meters",
                "before_value": 340.0,
                "after_value": None,
                "notes": "Baseline measured with smart cart GPS over 5-day sample.",
            },
            {
                "name": "Near-miss incidents per month",
                "unit": "count",
                "before_value": 2.7,
                "after_value": None,
                "notes": "12-month trailing avg from safety log.",
            },
        ],
        "activities": [
            ("James Whitford", "created", "Near-miss trend triggered safety kaizen event."),
            ("James Whitford", "status_changed", "Status moved from 'identify' to 'analyze'. ABC analysis done."),
            ("James Whitford", "status_changed", "Status moved from 'analyze' to 'plan'. New slot map approved."),
            ("James Whitford", "status_changed", "Status moved from 'plan' to 'implement'. Physical move started."),
        ],
    },
    # ── 5 ─────────────────────────────────────────────────────────────────────
    {
        "initiative": {
            "title": "Standardise Machine Changeover — Press Cell 4",
            "description": (
                "SMED analysis on Press Cell 4 revealed 74 min average changeover, of which 51 min "
                "are internal (machine stopped) but could be converted to external. Die staging cart, "
                "shadow boards, and pre-kitted tooling sets are the primary countermeasures."
            ),
            "category": CategoryEnum.cycle_time,
            "status": StatusEnum.plan,
            "priority": PriorityEnum.medium,
            "owner": "Luis Vargas",
            "department": "Press Shop",
            "target_date": _utcnow(45),
            "completed_date": None,
        },
        "metrics": [
            {
                "name": "Average changeover time",
                "unit": "minutes",
                "before_value": 74.0,
                "after_value": None,
                "notes": "8-changeover video study baseline.",
            },
            {
                "name": "Internal steps (machine-stopped)",
                "unit": "count",
                "before_value": 23.0,
                "after_value": None,
                "notes": "Steps identified in SMED worksheet.",
            },
        ],
        "activities": [
            ("Luis Vargas", "created", "SMED study triggered by capacity constraint on PC4."),
            ("Luis Vargas", "status_changed", "Status moved from 'identify' to 'analyze'. Video analysis complete."),
            ("Luis Vargas", "status_changed", "Status moved from 'analyze' to 'plan'. Tooling cart spec in review."),
        ],
    },
    # ── 6 ─────────────────────────────────────────────────────────────────────
    {
        "initiative": {
            "title": "Consolidate Supplier Invoicing to Weekly Batch",
            "description": (
                "AP currently processes 180–220 invoices daily on an ad-hoc basis. "
                "Switching to a scheduled Tuesday batch with automated 3-way match reduces "
                "processing cost, late-payment penalties, and AP clerk context-switching."
            ),
            "category": CategoryEnum.cost_savings,
            "status": StatusEnum.analyze,
            "priority": PriorityEnum.medium,
            "owner": "Sandra Blake",
            "department": "Accounts Payable",
            "target_date": _utcnow(60),
            "completed_date": None,
        },
        "metrics": [
            {
                "name": "Cost per invoice processed",
                "unit": "$",
                "before_value": 14.82,
                "after_value": None,
                "notes": "APQC benchmark avg is $6.10; target <$7.",
            },
            {
                "name": "Late payment penalty — annual",
                "unit": "$",
                "before_value": 22600.0,
                "after_value": None,
                "notes": "Pulled from GL account 6410 last 12 months.",
            },
        ],
        "activities": [
            ("Sandra Blake", "created", "CFO flagged AP cost vs benchmark in Q3 review."),
            ("Sandra Blake", "status_changed", "Status moved from 'identify' to 'analyze'. Process map in progress."),
        ],
    },
    # ── 7 ─────────────────────────────────────────────────────────────────────
    {
        "initiative": {
            "title": "Implement Visual Management Board — Production Floor",
            "description": (
                "Shift supervisors spend 15–20 min each shift collecting status from 4 cells manually. "
                "Digital Andon boards with live OEE feed and a physical hour-by-hour board will "
                "surface problems in real time, reducing escalation-to-response lag."
            ),
            "category": CategoryEnum.waste_reduction,
            "status": StatusEnum.identify,
            "priority": PriorityEnum.low,
            "owner": "Tom Harada",
            "department": "Production",
            "target_date": _utcnow(90),
            "completed_date": None,
        },
        "metrics": [
            {
                "name": "Supervisor time gathering status per shift",
                "unit": "minutes",
                "before_value": 17.5,
                "after_value": None,
                "notes": "Time study average over 10 shifts.",
            },
        ],
        "activities": [
            ("Tom Harada", "created", "Opportunity identified during Gemba walk with plant manager."),
        ],
    },
]


WORK_PROJECT_SEED = [
    {
        "title": "DDV5 Warehouse Management System",
        "description": (
            "Core employee & dwelling time tracker for DDV5 fulfillment center. "
            "400+ employees, clusters A/K/M, 330 aisles. Node.js + SQLite."
        ),
        "status": StatusEnum.implement,
        "priority": PriorityEnum.high,
        "phase": "Warehouse App — v1",
        "path": r"C:\Users\yakub\Desktop\DDV5 Complete Archive",
        "url": None,
        "todos": [
            "Review archive at Desktop\\DDV5 Complete Archive",
            "Consolidate into single active codebase",
            "Test START_WAREHOUSE.bat startup",
            "Verify 400+ employee records load correctly",
            "Document final deployment path",
        ],
    },
    {
        "title": "DDV5 Professional (v2)",
        "description": (
            "Advanced version with Docker, REST API backend, React frontend. "
            "Successor to the warehouse app."
        ),
        "status": StatusEnum.plan,
        "priority": PriorityEnum.high,
        "phase": "Pro v2 — Docker + React frontend",
        "path": None,
        "url": None,
        "todos": [
            "Audit differences vs base warehouse system",
            "Decide: merge into one or keep separate",
            "Set up Docker compose local run",
            "Define what 'done' looks like for this version",
        ],
    },
    {
        "title": "SSD Dispatch Tracker",
        "description": (
            "Real-time dispatch operations system. PyQt5 desktop app, SQLite, badge photos, "
            "120+ drivers, 13k+ daily packages. Live on GitHub."
        ),
        "status": StatusEnum.sustain,
        "priority": PriorityEnum.medium,
        "phase": "Sustained — v1.0 live on GitHub",
        "path": None,
        "url": "https://github.com/yakub268",
        "todos": [
            "Tag v1.0 release on GitHub",
            "Write deployment README for other sites",
            "Add CSV bulk import validation",
        ],
    },
    {
        "title": "DDV5 Labor Board",
        "description": (
            "HTML-based labor visualization dashboard. Single-file at "
            "Desktop\\DDV5 Complete Archive\\Desktop_ddv5-labor-board-complete.html"
        ),
        "status": StatusEnum.verify,
        "priority": PriorityEnum.medium,
        "phase": "Verify — Standalone HTML",
        "path": r"C:\Users\yakub\Desktop\DDV5 Complete Archive",
        "url": None,
        "todos": [
            "Open and test ddv5-labor-board-complete.html",
            "Decide: keep standalone or integrate into Pro",
            "Screenshot for documentation",
        ],
    },
    {
        "title": "Mirror — Personal Behavioral Tracking",
        "description": (
            "Passive behavioral monitor running silently in the background. "
            "Collects: active window titles every 5min, PowerShell command history every 15min, "
            "browser visit history every 15min, Claude session transcripts daily. "
            "All data stored in DuckDB at C:/Users/yakub/.mirror/behavior.db. "
            "Phase 1 complete — collectors installed via Task Scheduler, 4700+ PS commands "
            "and 352 Claude sessions already imported. "
            "Phase 2 (pattern engine + advisor) unlocks after 1-2 weeks of activity data. "
            "End goal: 'mirror ask' answers real behavioral questions backed by historical evidence."
        ),
        "status": StatusEnum.implement,
        "priority": PriorityEnum.medium,
        "phase": "Phase 1 Complete — collectors running, 4700+ PS cmds + 352 Claude sessions imported",
        "path": r"C:\Users\yakub\.mirror",
        "url": None,
        "todos": [
            "PHASE 2: Build analysis/pattern_engine.py — Claude analyzes DB weekly, extracts behavioral patterns (run after 2 weeks of data)",
            "PHASE 2: Build analysis/advisor.py — makes 'mirror ask <question>' real with Claude-powered answers from DB",
            "PHASE 2: Verify browser_visits table is populating — check after next full browser session (Chrome/Edge history path may need fix)",
            "PHASE 3: Add 'mirror brief' command — morning summary with top patterns, focus time anomalies, decision reminders",
            "PHASE 3 (optional): Wire Groq llama-3.2-vision for hourly screenshot analysis — free tier, already configured in stack",
            "PHASE 4: Add /api/mirror/brief and /api/mirror/ask endpoints to JARVIS FastAPI backend (C:/Users/yakub/.jarvis/)",
            "PHASE 4: Build standalone HTML behavioral dashboard — focus time charts, distraction trends, pattern history",
            "ONGOING (2 weeks): Run first manual pattern analysis — python analysis/pattern_engine.py",
            "ONGOING (1 month): Review activity_samples data quality, retune app_category classifier if needed",
            "ONGOING: Add 'mirror log' habit — log at least 1 decision/day to build outcome tracking dataset",
        ],
    },
    {
        "title": "Amazon AI / Cedric Integration",
        "description": (
            "Internal Amazon AI assistant (Cedric). Exploring integration of warehouse workflows "
            "with Cedric for summarization and process improvement."
        ),
        "status": StatusEnum.identify,
        "priority": PriorityEnum.low,
        "phase": "Explore — Integration research",
        "path": None,
        "url": None,
        "todos": [
            "List 3 specific workflows to test with Cedric",
            "Draft prompts for dwelling time analysis",
            "Check data classification requirements for warehouse data",
        ],
    },
]


# Metadata to backfill on existing installations (runs if columns are NULL)
_WORK_PROJECT_METADATA = {
    "DDV5 Warehouse Management System": {
        "phase": "Warehouse App — v1",
        "path": r"C:\Users\yakub\Desktop\DDV5 Complete Archive",
        "url": None,
    },
    "DDV5 Professional (v2)": {
        "phase": "Pro v2 — Docker + React frontend",
        "path": None,
        "url": None,
    },
    "SSD Dispatch Tracker": {
        "phase": "Sustained — v1.0 live on GitHub",
        "path": None,
        "url": "https://github.com/yakub268",
    },
    "DDV5 Labor Board": {
        "phase": "Verify — Standalone HTML",
        "path": r"C:\Users\yakub\Desktop\DDV5 Complete Archive",
        "url": None,
    },
    "Amazon AI / Cedric Integration": {
        "phase": "Explore — Integration research",
        "path": None,
        "url": None,
    },
}


def seed_database(db: Session) -> None:
    existing = db.query(Initiative).filter(
        Initiative.category != CategoryEnum.work_project
    ).count()
    if existing == 0:
        for item in SEED_DATA:
            i_data = item["initiative"]
            initiative = Initiative(
                **i_data,
                created_at=_utcnow(-90),
                updated_at=_utcnow(-1),
            )
            db.add(initiative)
            db.flush()

            for m_data in item.get("metrics", []):
                metric = Metric(
                    initiative_id=initiative.id,
                    measured_at=_utcnow(-85),
                    **m_data,
                )
                db.add(metric)

            for (user, action, details) in item.get("activities", []):
                activity = Activity(
                    initiative_id=initiative.id,
                    user=user,
                    action=action,
                    details=details,
                    created_at=_utcnow(-80),
                )
                db.add(activity)

        db.commit()


def seed_work_projects(db: Session) -> None:
    existing = db.query(Initiative).filter(
        Initiative.category == CategoryEnum.work_project
    ).count()
    if existing > 0:
        return

    now = _utcnow()
    for item in WORK_PROJECT_SEED:
        item = dict(item)
        todo_texts = item.pop("todos")
        initiative = Initiative(
            **item,
            category=CategoryEnum.work_project,
            created_at=now,
            updated_at=now,
        )
        db.add(initiative)
        db.flush()

        for idx, text in enumerate(todo_texts):
            todo = Todo(
                initiative_id=initiative.id,
                text=text,
                order_index=idx,
                created_at=now,
            )
            db.add(todo)

    db.commit()


def migrate_schema() -> None:
    """Add new columns to initiatives table without Alembic."""
    with engine.connect() as conn:
        for sql in [
            "ALTER TABLE initiatives ADD COLUMN path TEXT",
            "ALTER TABLE initiatives ADD COLUMN url TEXT",
            "ALTER TABLE initiatives ADD COLUMN phase VARCHAR(255)",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as exc:
                logger.debug("Schema migration skipped (column likely exists): %s", exc)


def backfill_work_project_metadata(db: Session) -> None:
    """Fill path/url/phase for existing work project rows that have NULL values."""
    for title, meta in _WORK_PROJECT_METADATA.items():
        initiative = db.query(Initiative).filter(
            Initiative.title == title,
            Initiative.category == CategoryEnum.work_project,
            Initiative.phase.is_(None),
        ).first()
        if initiative:
            initiative.phase = meta.get("phase")
            initiative.path = meta.get("path")
            initiative.url = meta.get("url")
    db.commit()


@app.on_event("startup")
def startup_event() -> None:
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    db = SessionLocal()
    try:
        seed_database(db)
        seed_work_projects(db)
        backfill_work_project_metadata(db)
    finally:
        db.close()


@app.get("/api/health")
def health_check() -> dict:
    return {"status": "ok", "service": "KaizenBoard API"}
