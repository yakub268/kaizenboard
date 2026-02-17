from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from database import get_db
from models import Initiative, Activity, StatusEnum, CategoryEnum
from schemas import (
    InitiativeCreate,
    InitiativeUpdate,
    InitiativeResponse,
    InitiativeDetailResponse,
    InitiativeStatusUpdate,
    ActivityResponse,
)

router = APIRouter(prefix="/api/initiatives", tags=["initiatives"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _log_activity(
    db: Session,
    initiative_id: int,
    user: str,
    action: str,
    details: Optional[str] = None,
) -> None:
    entry = Activity(
        initiative_id=initiative_id,
        user=user,
        action=action,
        details=details,
        created_at=_utcnow(),
    )
    db.add(entry)


@router.get("", response_model=List[InitiativeResponse])
def list_initiatives(
    status: Optional[StatusEnum] = Query(None),
    category: Optional[CategoryEnum] = Query(None),
    db: Session = Depends(get_db),
) -> List[InitiativeResponse]:
    query = db.query(Initiative)
    if status is not None:
        query = query.filter(Initiative.status == status)
    if category is not None:
        query = query.filter(Initiative.category == category)
    return query.order_by(Initiative.created_at.desc()).all()


@router.post("", response_model=InitiativeResponse, status_code=201)
def create_initiative(
    payload: InitiativeCreate,
    db: Session = Depends(get_db),
) -> InitiativeResponse:
    now = _utcnow()
    initiative = Initiative(
        **payload.model_dump(),
        created_at=now,
        updated_at=now,
    )
    db.add(initiative)
    db.flush()

    _log_activity(
        db,
        initiative.id,
        user=payload.owner or "system",
        action="created",
        details=f"Initiative created with status '{payload.status.value}' "
                f"and priority '{payload.priority.value}'.",
    )

    db.commit()
    db.refresh(initiative)
    return initiative


@router.get("/{initiative_id}", response_model=InitiativeDetailResponse)
def get_initiative(
    initiative_id: int,
    db: Session = Depends(get_db),
) -> InitiativeDetailResponse:
    initiative = db.query(Initiative).filter(Initiative.id == initiative_id).first()
    if not initiative:
        raise HTTPException(status_code=404, detail="Initiative not found")
    return initiative


@router.put("/{initiative_id}", response_model=InitiativeResponse)
def update_initiative(
    initiative_id: int,
    payload: InitiativeUpdate,
    user: str = Query(default="system"),
    db: Session = Depends(get_db),
) -> InitiativeResponse:
    initiative = db.query(Initiative).filter(Initiative.id == initiative_id).first()
    if not initiative:
        raise HTTPException(status_code=404, detail="Initiative not found")

    changes: list[str] = []
    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        old_val = getattr(initiative, field)
        if old_val != value:
            changes.append(f"{field}: '{old_val}' → '{value}'")
        setattr(initiative, field, value)

    initiative.updated_at = _utcnow()

    if changes:
        _log_activity(
            db,
            initiative_id,
            user=user,
            action="updated",
            details="; ".join(changes),
        )

    db.commit()
    db.refresh(initiative)
    return initiative


@router.delete("/{initiative_id}", status_code=204)
def delete_initiative(
    initiative_id: int,
    db: Session = Depends(get_db),
) -> None:
    initiative = db.query(Initiative).filter(Initiative.id == initiative_id).first()
    if not initiative:
        raise HTTPException(status_code=404, detail="Initiative not found")
    db.delete(initiative)
    db.commit()


@router.patch("/{initiative_id}/status", response_model=InitiativeResponse)
def update_status(
    initiative_id: int,
    payload: InitiativeStatusUpdate,
    db: Session = Depends(get_db),
) -> InitiativeResponse:
    initiative = db.query(Initiative).filter(Initiative.id == initiative_id).first()
    if not initiative:
        raise HTTPException(status_code=404, detail="Initiative not found")

    old_status = initiative.status
    initiative.status = payload.status
    initiative.updated_at = _utcnow()

    if payload.status == StatusEnum.sustain:
        initiative.completed_date = initiative.completed_date or _utcnow()

    _log_activity(
        db,
        initiative_id,
        user=payload.user,
        action="status_changed",
        details=f"Status moved from '{old_status.value}' to '{payload.status.value}'.",
    )

    db.commit()
    db.refresh(initiative)
    return initiative
