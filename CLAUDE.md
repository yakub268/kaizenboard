# KaizenBoard

Lean/continuous improvement tracker with Claude Code project integration.

## Architecture
- **Backend:** FastAPI + SQLite (`backend/kaizenboard.db`), Python 3.12, uvicorn on port 8000
- **Frontend:** React 19 + Vite 7 + Tailwind 4, built to `frontend/dist/`, served by backend
- **Database:** SQLite via SQLAlchemy ORM — 9 tables (5 core + 4 Claude-specific)

## Running
```bash
# Start backend (serves frontend from dist/)
cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000
# Or use start_kaizen.bat

# Rebuild frontend after changes
cd frontend && npm run build
```

## Key Files
| File | Purpose |
|------|---------|
| `backend/main.py` | App init, seed data, schema migration, SPA fallback |
| `backend/routers/claude_projects.py` | Claude project registration, session classification, costs |
| `backend/routers/dashboard.py` | Dashboard summary, timeline, overview stats |
| `backend/routers/work_projects.py` | Work project CRUD, todos, timers |
| `backend/routers/initiatives.py` | Kaizen initiative CRUD, status transitions |
| `backend/models.py` | SQLAlchemy models — Initiative, Metric, Todo, TimeEntry, Claude* |
| `backend/schemas.py` | Pydantic response models |
| `backend/project_costs.json` | Cached token usage/cost data, updated daily at 6 AM |
| `frontend/src/api.js` | All API client functions |
| `frontend/src/pages/ClaudeProjects.jsx` | Claude project cards, detail modal, session history |
| `frontend/src/pages/Dashboard.jsx` | Overview + charts |

## Pages
1. **Board** (`/`) — Kanban: Identify → Analyze → Plan → Implement → Verify → Sustain
2. **Dashboard** (`/dashboard`) — Charts, overview cards (Claude + Work + Kaizen stats)
3. **Work Projects** (`/work`) — DDV5, AWS, StellArts, etc. with todos + timers
4. **Claude Projects** (`/claude`) — 15 tracked projects, session classification, cost tracking

## Session Classification
- 325+ sessions classified via keyword rules + Groq Llama 3.3 fallback
- Keyword rules in `_KEYWORD_RULES` (claude_projects.py:155)
- Directory mapping in `_DIR_TO_PROJECT` (claude_projects.py:114)
- Trigger: `POST /api/claude/classify`

## Auto-Sync Hook
- `~/.claude/scripts/kaizen-sync.sh` — PostToolUse hook on Bash commands
- Scans Desktop/ and C:\dev\projects\ for new project dirs every 5 min
- Registers untracked projects automatically
- Skip list: `*_files`, `*temp*`, `*archived*`, `node_modules`

## Cost Tracking
- `~/.claude/scripts/calc-project-costs.py` — parses session JSONL files for token usage
- Scheduled daily at 6 AM via Task Scheduler (`KaizenBoard-CostCalc`)
- Served via `GET /api/claude/costs`

## Python Versions
- Python 3.12: uvicorn, FastAPI, SQLAlchemy (backend)
- Python 3.11: duckdb (Mirror project queries)
- Python 3.13 (Store): avoid for this project — missing fastapi

## Conventions
- Conventional commits: `feat|fix|refactor: description`
- Frontend rebuild required after JSX/CSS changes
- Backend restart required after Python changes
- Demo/seed data (IDs 1-7) kept for Dashboard chart population
