from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from datetime import datetime, timezone, date, timedelta
from collections import defaultdict

from database import get_db
from models import Initiative, Todo, TimeEntry, CategoryEnum
from schemas import (
    TodoCreate,
    TodoUpdate,
    TodoResponse,
    TimeEntryStart,
    TimeEntryStop,
    TimeEntryResponse,
    TimeEntrySummary,
    ActiveTimer,
    WorkProjectResponse,
)

router = APIRouter(prefix="/api/work", tags=["work_projects"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_initiative_or_404(db: Session, initiative_id: int) -> Initiative:
    initiative = db.query(Initiative).filter(Initiative.id == initiative_id).first()
    if not initiative:
        raise HTTPException(status_code=404, detail="Initiative not found")
    return initiative


def _get_todo_or_404(db: Session, todo_id: int) -> Todo:
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


def _build_time_summary(db: Session, initiative_id: int) -> TimeEntrySummary:
    entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.initiative_id == initiative_id,
            TimeEntry.duration_seconds.isnot(None),
        )
        .all()
    )
    total_seconds = sum(e.duration_seconds for e in entries if e.duration_seconds)
    session_count = len(entries)
    last_session = max((e.end_time for e in entries if e.end_time), default=None)
    return TimeEntrySummary(
        initiative_id=initiative_id,
        total_seconds=total_seconds,
        session_count=session_count,
        last_session=last_session,
    )


# ── Todos ─────────────────────────────────────────────────────────────────────

@router.post("/{initiative_id}/todos", response_model=TodoResponse, status_code=201)
def create_todo(
    initiative_id: int,
    payload: TodoCreate,
    db: Session = Depends(get_db),
) -> TodoResponse:
    _get_initiative_or_404(db, initiative_id)
    todo = Todo(
        initiative_id=initiative_id,
        text=payload.text,
        order_index=payload.order_index,
        created_at=_utcnow(),
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.get("/{initiative_id}/todos", response_model=List[TodoResponse])
def list_todos(
    initiative_id: int,
    db: Session = Depends(get_db),
) -> List[TodoResponse]:
    _get_initiative_or_404(db, initiative_id)
    return (
        db.query(Todo)
        .filter(Todo.initiative_id == initiative_id)
        .order_by(Todo.order_index)
        .all()
    )


@router.patch("/todos/{todo_id}", response_model=TodoResponse)
def update_todo(
    todo_id: int,
    payload: TodoUpdate,
    db: Session = Depends(get_db),
) -> TodoResponse:
    todo = _get_todo_or_404(db, todo_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(todo, field, value)
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/todos/{todo_id}", status_code=204)
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
) -> None:
    todo = _get_todo_or_404(db, todo_id)
    db.delete(todo)
    db.commit()


@router.patch("/todos/{todo_id}/toggle", response_model=TodoResponse)
def toggle_todo(
    todo_id: int,
    db: Session = Depends(get_db),
) -> TodoResponse:
    todo = _get_todo_or_404(db, todo_id)
    todo.completed = not todo.completed
    todo.completed_at = _utcnow() if todo.completed else None
    db.commit()
    db.refresh(todo)
    return todo


# ── Time Tracking ─────────────────────────────────────────────────────────────

@router.post("/time/start", response_model=TimeEntryResponse, status_code=201)
def start_timer(
    payload: TimeEntryStart,
    db: Session = Depends(get_db),
) -> TimeEntryResponse:
    _get_initiative_or_404(db, payload.initiative_id)

    # If another timer is already running, stop it first
    active = db.query(TimeEntry).filter(TimeEntry.end_time.is_(None)).first()
    if active:
        now = _utcnow()
        active.end_time = now
        active.duration_seconds = int((now - active.start_time).total_seconds())

    now = _utcnow()
    entry = TimeEntry(
        initiative_id=payload.initiative_id,
        start_time=now,
        notes=payload.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/time/stop", response_model=TimeEntryResponse)
def stop_timer(
    payload: TimeEntryStop,
    db: Session = Depends(get_db),
) -> TimeEntryResponse:
    active = db.query(TimeEntry).filter(TimeEntry.end_time.is_(None)).first()
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


@router.get("/time/active", response_model=ActiveTimer)
def get_active_timer(
    db: Session = Depends(get_db),
) -> ActiveTimer:
    active = (
        db.query(TimeEntry)
        .filter(TimeEntry.end_time.is_(None))
        .first()
    )
    if not active:
        raise HTTPException(status_code=404, detail="No active timer running")

    initiative = db.query(Initiative).filter(Initiative.id == active.initiative_id).first()
    now = _utcnow()
    elapsed = int((now - active.start_time).total_seconds())
    return ActiveTimer(
        initiative_id=active.initiative_id,
        initiative_title=initiative.title if initiative else "Unknown",
        start_time=active.start_time,
        elapsed_seconds=elapsed,
    )


@router.get("/time/{initiative_id}/summary", response_model=TimeEntrySummary)
def get_time_summary(
    initiative_id: int,
    db: Session = Depends(get_db),
) -> TimeEntrySummary:
    _get_initiative_or_404(db, initiative_id)
    return _build_time_summary(db, initiative_id)


@router.get("/time/{initiative_id}/entries", response_model=List[TimeEntryResponse])
def list_time_entries(
    initiative_id: int,
    db: Session = Depends(get_db),
) -> List[TimeEntryResponse]:
    _get_initiative_or_404(db, initiative_id)
    return (
        db.query(TimeEntry)
        .filter(TimeEntry.initiative_id == initiative_id)
        .order_by(TimeEntry.start_time.desc())
        .all()
    )


# ── Work Projects List ─────────────────────────────────────────────────────────

@router.get("/projects", response_model=List[WorkProjectResponse])
def list_work_projects(
    db: Session = Depends(get_db),
) -> List[WorkProjectResponse]:
    initiatives = (
        db.query(Initiative)
        .options(joinedload(Initiative.todos))
        .filter(Initiative.category == CategoryEnum.work_project)
        .order_by(Initiative.created_at.desc())
        .all()
    )

    # Batch-load all time entries (avoids N+1 — one query instead of one per project)
    initiative_ids = [i.id for i in initiatives]
    all_entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.initiative_id.in_(initiative_ids),
            TimeEntry.duration_seconds.isnot(None),
        )
        .all()
    )
    entries_by_id: dict[int, list] = defaultdict(list)
    for e in all_entries:
        entries_by_id[e.initiative_id].append(e)

    def _build_summary_from_entries(initiative_id: int) -> TimeEntrySummary:
        entries = entries_by_id[initiative_id]
        total_seconds = sum(e.duration_seconds for e in entries if e.duration_seconds)
        last_session = max((e.end_time for e in entries if e.end_time), default=None)
        return TimeEntrySummary(
            initiative_id=initiative_id,
            total_seconds=total_seconds,
            session_count=len(entries),
            last_session=last_session,
        )

    results = []
    for initiative in initiatives:
        summary = _build_summary_from_entries(initiative.id)
        project = WorkProjectResponse(
            id=initiative.id,
            title=initiative.title,
            description=initiative.description,
            status=initiative.status,
            priority=initiative.priority,
            created_at=initiative.created_at,
            updated_at=initiative.updated_at,
            todos=[TodoResponse.model_validate(t) for t in initiative.todos],
            time_summary=summary,
            path=initiative.path,
            url=initiative.url,
            phase=initiative.phase,
        )
        results.append(project)

    return results


@router.get("/stats")
def get_work_stats(db: Session = Depends(get_db)) -> dict:
    entries = db.query(TimeEntry).filter(TimeEntry.duration_seconds.isnot(None)).all()

    daily: dict[str, int] = defaultdict(int)
    for e in entries:
        day = e.start_time.date().isoformat()
        daily[day] += e.duration_seconds or 0

    today = date.today()
    daily_activity = [
        {"date": (today - timedelta(days=29 - i)).isoformat(),
         "seconds": daily.get((today - timedelta(days=29 - i)).isoformat(), 0)}
        for i in range(30)
    ]

    total_seconds = sum(e.duration_seconds for e in entries if e.duration_seconds)
    session_count = len(entries)

    return {
        "total_seconds": total_seconds,
        "session_count": session_count,
        "daily_activity": daily_activity,
    }
