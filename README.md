# KaizenBoard

A continuous improvement tracker for teams running lean, six sigma, or kaizen initiatives. Track improvements from identification through sustainment, measure before/after metrics, and visualize the impact.

Built because most "improvement tracking" still lives in spreadsheets and email threads. This gives teams a shared board, measurable outcomes, and a clear audit trail.

---

## Screenshots

### Kanban Board
Six-stage workflow from Identify through Sustain. Cards show category, priority, owner, and metric counts. Filter by category or search by title.

### Dashboard
Summary cards, completion trends, category distribution, and a ranked table of top improvements by impact percentage.

### Initiative Detail
Full view with status stepper, before/after metrics with improvement visualization, and activity timeline.

---

## Quick Start

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The app seeds demo data (7 manufacturing/logistics initiatives) on first run.

---

## What It Tracks

Each improvement initiative moves through six stages:

| Stage | Purpose |
|-------|---------|
| **Identify** | Problem or waste identified |
| **Analyze** | Root cause analysis, data collection |
| **Plan** | Countermeasures designed, baseline metrics set |
| **Implement** | Changes executed |
| **Verify** | After-metrics measured, results validated |
| **Sustain** | Standardized, monitored for regression |

Metrics capture before and after values with units — cycle time in hours, defect rates in percentages, costs in dollars. The dashboard aggregates improvement percentages and total cost savings automatically.

---

## Architecture

```
frontend/          React 18 + Vite + Tailwind CSS + Chart.js
  src/
    pages/         Board (kanban), Dashboard (analytics), InitiativeDetail
    components/    Navbar, StatusBadge, MetricRow, InitiativeForm
    api.js         API client (fetch-based, no axios)

backend/           Python FastAPI + SQLAlchemy + SQLite
  routers/
    initiatives.py   Full CRUD + status transitions
    metrics.py       Before/after metric measurements
    dashboard.py     Aggregated analytics endpoints
  models.py        Initiative, Metric, Activity (audit trail)
  main.py          App setup, CORS, auto-seeding
```

**API endpoints:**
- `GET/POST /api/initiatives` — list and create
- `GET/PUT/DELETE /api/initiatives/{id}` — detail, update, delete
- `PATCH /api/initiatives/{id}/status` — kanban status transitions
- `POST /api/initiatives/{id}/metrics` — add measurements
- `GET /api/dashboard/summary` — KPIs and breakdowns
- `GET /api/dashboard/timeline` — monthly completion trend
- `GET /api/dashboard/top-improvements` — ranked by impact

Every status change and metric update is logged to an activity timeline for audit.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Chart.js, React Router |
| Backend | Python, FastAPI, SQLAlchemy, Pydantic v2 |
| Database | SQLite (zero config, file-based) |
| Icons | Heroicons |

---

## Demo Data

The app seeds 7 realistic initiatives on first run:

| Initiative | Category | Improvement |
|-----------|----------|-------------|
| Reduce Order Processing Cycle Time | Cycle Time | 4.5h → 0.75h (83%) |
| Eliminate Duplicate Data Entry | Cost Savings | $34k → $5k labor cost |
| Reduce Defect Rate on Line 3 | Quality | FPY 82% → 97% |
| 5S Warehouse Aisle Re-layout | Waste Reduction | In progress |
| Standardize Machine Changeover | Cycle Time | Planning |
| Consolidate Supplier Invoicing | Cost Savings | Analyzing |
| Implement Visual Management Board | Quality | Identified |

---

## Why This Exists

Continuous improvement programs generate measurable results — reduced cycle times, lower defect rates, cost savings — but the tracking is usually scattered across spreadsheets, sticky notes, and status meetings. KaizenBoard centralizes the workflow, enforces measurement discipline (before/after metrics are first-class), and makes the cumulative impact visible.

---

## License

MIT
