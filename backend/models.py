from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime, ForeignKey, Enum as SAEnum, Boolean
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from database import Base


class CategoryEnum(str, enum.Enum):
    waste_reduction = "waste_reduction"
    cycle_time = "cycle_time"
    quality = "quality"
    cost_savings = "cost_savings"
    safety = "safety"
    ai_project = "ai_project"
    work_project = "work_project"
    other = "other"


class StatusEnum(str, enum.Enum):
    identify = "identify"
    analyze = "analyze"
    plan = "plan"
    implement = "implement"
    verify = "verify"
    sustain = "sustain"


class PriorityEnum(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Initiative(Base):
    __tablename__ = "initiatives"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    path = Column(String(500), nullable=True)
    url = Column(String(500), nullable=True)
    phase = Column(String(255), nullable=True)
    category = Column(
        SAEnum(CategoryEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=CategoryEnum.other,
    )
    status = Column(
        SAEnum(StatusEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=StatusEnum.identify,
    )
    priority = Column(
        SAEnum(PriorityEnum, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=PriorityEnum.medium,
    )
    owner = Column(String(150), nullable=True)
    department = Column(String(150), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    target_date = Column(DateTime, nullable=True)
    completed_date = Column(DateTime, nullable=True)

    metrics = relationship(
        "Metric", back_populates="initiative", cascade="all, delete-orphan"
    )
    activities = relationship(
        "Activity", back_populates="initiative", cascade="all, delete-orphan"
    )
    todos = relationship(
        "Todo",
        back_populates="initiative",
        cascade="all, delete-orphan",
        order_by="Todo.order_index",
    )
    time_entries = relationship(
        "TimeEntry", back_populates="initiative", cascade="all, delete-orphan"
    )


class Metric(Base):
    __tablename__ = "metrics"

    id = Column(Integer, primary_key=True, index=True)
    initiative_id = Column(
        Integer, ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(255), nullable=False)
    unit = Column(String(50), nullable=True)
    before_value = Column(Float, nullable=False)
    after_value = Column(Float, nullable=True)
    measured_at = Column(DateTime, nullable=False, default=utcnow)
    notes = Column(Text, nullable=True)

    initiative = relationship("Initiative", back_populates="metrics")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    initiative_id = Column(
        Integer, ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=False
    )
    user = Column(String(150), nullable=False)
    action = Column(String(255), nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)

    initiative = relationship("Initiative", back_populates="activities")


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    initiative_id = Column(
        Integer, ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=False
    )
    text = Column(String(500), nullable=False)
    completed = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    completed_at = Column(DateTime, nullable=True)

    initiative = relationship("Initiative", back_populates="todos")


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id = Column(Integer, primary_key=True, index=True)
    initiative_id = Column(
        Integer, ForeignKey("initiatives.id", ondelete="CASCADE"), nullable=False
    )
    start_time = Column(DateTime, nullable=False, default=utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)  # filled on stop
    notes = Column(String(500), nullable=True)

    initiative = relationship("Initiative", back_populates="time_entries")


class ClaudeProjectTodo(Base):
    __tablename__ = "claude_project_todos"

    id = Column(Integer, primary_key=True, index=True)
    project_slug = Column(String(100), nullable=False, index=True)
    text = Column(String(500), nullable=False)
    completed = Column(Boolean, default=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    completed_at = Column(DateTime, nullable=True)


class ClaudeTimeEntry(Base):
    __tablename__ = "claude_time_entries"

    id = Column(Integer, primary_key=True, index=True)
    project_slug = Column(String(100), nullable=False, index=True)
    start_time = Column(DateTime, nullable=False, default=utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    notes = Column(String(500), nullable=True)


class ClaudeSessionClassification(Base):
    """LLM-classified project attribution for each Claude Code session."""
    __tablename__ = "claude_session_classifications"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), nullable=False, unique=True, index=True)
    project_dir = Column(String(200), nullable=False)   # e.g. "C--Users-yakub"
    project_slug = Column(String(100), nullable=True)   # null = unknown/unclassifiable
    project_name = Column(String(255), nullable=True)
    first_message = Column(Text, nullable=True)         # preview stored for debugging
    confidence = Column(Float, nullable=True)
    classified_at = Column(DateTime, nullable=False, default=utcnow)


class ClaudeRegisteredProject(Base):
    """Manually registered projects (Desktop-only or not in MEMORY.md)."""
    __tablename__ = "claude_registered_projects"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)
    status = Column(String(50), default="active")
    phase = Column(String(255), nullable=True)
    notes_json = Column(Text, nullable=True)   # JSON list of strings
    claude_url = Column(String(500), nullable=True)
    project_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow)
