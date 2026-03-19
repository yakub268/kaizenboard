from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from database import get_db
from models import Initiative, Metric, Todo, StatusEnum, CategoryEnum, ClaudeRegisteredProject, ClaudeSessionClassification
from schemas import DashboardSummary, StatusCount, CategoryCount, TimelineEntry, TopImprovement

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/summary", response_model=DashboardSummary)
def get_summary(db: Session = Depends(get_db)) -> DashboardSummary:
    total = db.query(func.count(Initiative.id)).scalar() or 0

    # By status
    status_rows = (
        db.query(Initiative.status, func.count(Initiative.id))
        .group_by(Initiative.status)
        .all()
    )
    by_status = [StatusCount(status=row[0].value if hasattr(row[0], 'value') else str(row[0]), count=row[1])
                 for row in status_rows]

    # By category
    category_rows = (
        db.query(Initiative.category, func.count(Initiative.id))
        .group_by(Initiative.category)
        .all()
    )
    by_category = [CategoryCount(category=row[0].value if hasattr(row[0], 'value') else str(row[0]), count=row[1])
                   for row in category_rows]

    # Metrics with both before and after values
    improved_metrics = (
        db.query(Metric)
        .filter(Metric.after_value.isnot(None))
        .all()
    )
    total_metrics_improved = len(improved_metrics)

    # Avg improvement %
    improvements: list[float] = []
    cost_savings_total: float = 0.0

    for m in improved_metrics:
        if m.before_value and m.before_value != 0:
            pct = (m.before_value - m.after_value) / abs(m.before_value) * 100
            improvements.append(pct)

    avg_improvement = round(sum(improvements) / len(improvements), 2) if improvements else None

    # Cost savings: sum absolute reduction for metrics with "cost" or "$" in name/unit
    for m in improved_metrics:
        name_lower = (m.name or "").lower()
        unit_lower = (m.unit or "").lower()
        if any(kw in name_lower or kw in unit_lower for kw in ("cost", "$", "usd", "dollar", "saving")):
            if m.after_value is not None:
                savings = m.before_value - m.after_value
                if savings > 0:
                    cost_savings_total += savings

    # Completion rate — sustain = completed
    sustained = db.query(func.count(Initiative.id)).filter(
        Initiative.status == StatusEnum.sustain
    ).scalar() or 0
    completion_rate = round(sustained / total * 100, 1) if total else 0.0

    return DashboardSummary(
        total_initiatives=total,
        by_status=by_status,
        by_category=by_category,
        total_metrics_improved=total_metrics_improved,
        avg_improvement_pct=avg_improvement,
        total_cost_savings=cost_savings_total if cost_savings_total else None,
        completion_rate=completion_rate,
    )


@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    """Combined dashboard stats: kaizen + Claude + work projects."""
    try:
        # Claude projects
        claude_projects = db.query(func.count(ClaudeRegisteredProject.id)).scalar() or 0
        claude_sessions = (
            db.query(func.count(ClaudeSessionClassification.id))
            .filter(ClaudeSessionClassification.project_slug.isnot(None))
            .scalar()
        ) or 0
        most_active = (
            db.query(ClaudeSessionClassification.project_name, func.count(ClaudeSessionClassification.id).label("cnt"))
            .filter(ClaudeSessionClassification.project_slug.isnot(None))
            .group_by(ClaudeSessionClassification.project_name)
            .order_by(func.count(ClaudeSessionClassification.id).desc())
            .first()
        )

        # Work projects
        work_total = db.query(func.count(Initiative.id)).filter(Initiative.category == CategoryEnum.work_project).scalar() or 0
        work_todos = db.query(func.count(Todo.id)).join(Initiative).filter(Initiative.category == CategoryEnum.work_project).scalar() or 0
        work_todos_done = (
            db.query(func.count(Todo.id))
            .join(Initiative)
            .filter(Initiative.category == CategoryEnum.work_project, Todo.completed == True)
            .scalar()
        ) or 0

        # Cost data
        import json, os
        costs_file = os.path.join(os.path.dirname(__file__), '..', 'project_costs.json')
        total_cost = 0.0
        if os.path.exists(costs_file):
            with open(costs_file, 'r') as f:
                for c in json.load(f):
                    total_cost += c.get('estimated_cost', 0)

        # Kaizen initiatives (non-work, non-ai)
        kaizen_total = db.query(func.count(Initiative.id)).filter(
            Initiative.category.notin_([CategoryEnum.work_project, CategoryEnum.ai_project, CategoryEnum.other])
        ).scalar() or 0

        return {
            "claude": {
                "projects": claude_projects,
                "sessions": claude_sessions,
                "most_active": most_active[0] if most_active else None,
                "most_active_count": most_active[1] if most_active else 0,
                "total_cost": round(total_cost, 2),
            },
            "work": {
                "projects": work_total,
                "todos_total": work_todos,
                "todos_done": work_todos_done,
                "completion_pct": round(work_todos_done / work_todos * 100, 1) if work_todos > 0 else 0,
            },
            "kaizen": {
                "initiatives": kaizen_total,
            },
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/timeline", response_model=List[TimelineEntry])
def get_timeline(db: Session = Depends(get_db)) -> List[TimelineEntry]:
    cutoff = _utcnow() - timedelta(days=365)
    completed = (
        db.query(Initiative)
        .filter(
            Initiative.completed_date.isnot(None),
            Initiative.completed_date >= cutoff,
        )
        .all()
    )

    counts: dict[str, int] = defaultdict(int)
    for initiative in completed:
        month_key = initiative.completed_date.strftime("%Y-%m")
        counts[month_key] += 1

    # Generate all 12 months even if zero (proper month arithmetic, no timedelta drift)
    result: list[TimelineEntry] = []
    now = _utcnow()
    for i in range(11, -1, -1):
        raw_month = now.month - i
        year = now.year + (raw_month - 1) // 12
        month = ((raw_month - 1) % 12) + 1
        key = f"{year}-{month:02d}"
        result.append(TimelineEntry(month=key, completed=counts.get(key, 0)))

    return result


@router.get("/top-improvements", response_model=List[TopImprovement])
def get_top_improvements(db: Session = Depends(get_db)) -> List[TopImprovement]:
    metrics = (
        db.query(Metric)
        .filter(Metric.after_value.isnot(None))
        .all()
    )

    scored: list[tuple[float, Metric]] = []
    for m in metrics:
        if m.before_value and m.before_value != 0:
            pct = (m.before_value - m.after_value) / abs(m.before_value) * 100
            scored.append((pct, m))

    scored.sort(key=lambda x: x[0], reverse=True)
    top10 = scored[:10]

    # Batch-load all parent initiatives (avoids N+1)
    initiative_ids = [m.initiative_id for _, m in top10]
    initiatives_map = {
        i.id: i
        for i in db.query(Initiative).filter(Initiative.id.in_(initiative_ids)).all()
    }

    result: list[TopImprovement] = []
    for pct, m in top10:
        initiative = initiatives_map.get(m.initiative_id)
        if not initiative:
            continue
        result.append(
            TopImprovement(
                id=initiative.id,
                title=initiative.title,
                category=initiative.category.value if hasattr(initiative.category, 'value') else str(initiative.category),
                owner=initiative.owner,
                improvement_pct=round(pct, 2),
                metric_name=m.name,
                unit=m.unit,
                before_value=m.before_value,
                after_value=m.after_value,
            )
        )

    return result
