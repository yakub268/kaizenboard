from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from database import get_db
from models import Metric, Initiative, Activity
from schemas import MetricCreate, MetricUpdate, MetricResponse

router = APIRouter(tags=["metrics"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _log_activity(
    db: Session,
    initiative_id: int,
    user: str,
    action: str,
    details: str | None = None,
) -> None:
    entry = Activity(
        initiative_id=initiative_id,
        user=user,
        action=action,
        details=details,
        created_at=_utcnow(),
    )
    db.add(entry)


@router.post("/api/initiatives/{initiative_id}/metrics", response_model=MetricResponse, status_code=201)
def add_metric(
    initiative_id: int,
    payload: MetricCreate,
    db: Session = Depends(get_db),
) -> MetricResponse:
    initiative = db.query(Initiative).filter(Initiative.id == initiative_id).first()
    if not initiative:
        raise HTTPException(status_code=404, detail="Initiative not found")

    metric = Metric(
        initiative_id=initiative_id,
        measured_at=_utcnow(),
        **payload.model_dump(),
    )
    db.add(metric)
    db.flush()

    _log_activity(
        db,
        initiative_id,
        user=initiative.owner or "system",
        action="metric_added",
        details=f"Metric '{payload.name}' added. Before: {payload.before_value} {payload.unit or ''}.",
    )

    db.commit()
    db.refresh(metric)
    return metric


@router.put("/api/metrics/{metric_id}", response_model=MetricResponse)
def update_metric(
    metric_id: int,
    payload: MetricUpdate,
    db: Session = Depends(get_db),
) -> MetricResponse:
    metric = db.query(Metric).filter(Metric.id == metric_id).first()
    if not metric:
        raise HTTPException(status_code=404, detail="Metric not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(metric, field, value)

    after = metric.after_value
    before = metric.before_value
    details_parts = [f"Metric '{metric.name}' updated."]
    if after is not None and before is not None and before != 0:
        pct = round((before - after) / abs(before) * 100, 1)
        details_parts.append(f"Improvement: {pct}% ({before} → {after} {metric.unit or ''}).")

    _log_activity(
        db,
        metric.initiative_id,
        user="system",
        action="metric_updated",
        details=" ".join(details_parts),
    )

    db.commit()
    db.refresh(metric)
    return metric


@router.delete("/api/metrics/{metric_id}", status_code=204)
def delete_metric(
    metric_id: int,
    db: Session = Depends(get_db),
) -> None:
    metric = db.query(Metric).filter(Metric.id == metric_id).first()
    if not metric:
        raise HTTPException(status_code=404, detail="Metric not found")

    _log_activity(
        db,
        metric.initiative_id,
        user="system",
        action="metric_deleted",
        details=f"Metric '{metric.name}' deleted.",
    )

    db.delete(metric)
    db.commit()
