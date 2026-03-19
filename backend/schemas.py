from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import datetime
from models import CategoryEnum, PriorityEnum, StatusEnum


# ── Metric ────────────────────────────────────────────────────────────────────

class MetricCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    unit: Optional[str] = Field(None, max_length=50)
    before_value: float
    after_value: Optional[float] = None
    notes: Optional[str] = None


class MetricUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    unit: Optional[str] = None
    before_value: Optional[float] = None
    after_value: Optional[float] = None
    notes: Optional[str] = None


class MetricResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    initiative_id: int
    name: str
    unit: Optional[str]
    before_value: float
    after_value: Optional[float]
    measured_at: datetime
    notes: Optional[str]

    @property
    def improvement_pct(self) -> Optional[float]:
        if self.after_value is not None and self.before_value != 0:
            return round((self.before_value - self.after_value) / abs(self.before_value) * 100, 2)
        return None


# ── Activity ──────────────────────────────────────────────────────────────────

class ActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    initiative_id: int
    user: str
    action: str
    details: Optional[str]
    created_at: datetime


# ── Initiative ────────────────────────────────────────────────────────────────

class InitiativeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: CategoryEnum = CategoryEnum.other
    status: StatusEnum = StatusEnum.identify
    priority: PriorityEnum = PriorityEnum.medium
    owner: Optional[str] = None
    department: Optional[str] = None
    target_date: Optional[datetime] = None


class InitiativeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[CategoryEnum] = None
    status: Optional[StatusEnum] = None
    priority: Optional[PriorityEnum] = None
    owner: Optional[str] = None
    department: Optional[str] = None
    target_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None


class InitiativeStatusUpdate(BaseModel):
    status: StatusEnum
    user: str = Field(default="system", min_length=1)


class InitiativeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    category: CategoryEnum
    status: StatusEnum
    priority: PriorityEnum
    owner: Optional[str]
    department: Optional[str]
    created_at: datetime
    updated_at: datetime
    target_date: Optional[datetime]
    completed_date: Optional[datetime]


class InitiativeDetailResponse(InitiativeResponse):
    metrics: List[MetricResponse] = []
    activities: List[ActivityResponse] = []


# ── Dashboard ─────────────────────────────────────────────────────────────────

class StatusCount(BaseModel):
    status: str
    count: int


class CategoryCount(BaseModel):
    category: str
    count: int


class DashboardSummary(BaseModel):
    total_initiatives: int
    by_status: List[StatusCount]
    by_category: List[CategoryCount]
    total_metrics_improved: int
    avg_improvement_pct: Optional[float]
    total_cost_savings: Optional[float]
    completion_rate: float


class TimelineEntry(BaseModel):
    month: str          # "YYYY-MM"
    completed: int


class TopImprovement(BaseModel):
    id: int
    title: str
    category: str
    owner: Optional[str]
    improvement_pct: float
    metric_name: str
    unit: Optional[str]
    before_value: float
    after_value: float


# ── Claude Projects ────────────────────────────────────────────────────────────

class ClaudeProjectTodoCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    order_index: int = 0


class ClaudeProjectTodoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_slug: str
    text: str
    completed: bool
    order_index: int
    created_at: datetime
    completed_at: Optional[datetime]


class ClaudeTimeEntryStart(BaseModel):
    project_slug: str
    notes: Optional[str] = None


class ClaudeTimeEntryStop(BaseModel):
    notes: Optional[str] = None


class ClaudeTimeEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_slug: str
    start_time: datetime
    end_time: Optional[datetime]
    duration_seconds: Optional[int]
    notes: Optional[str]


class ClaudeTimeSummary(BaseModel):
    project_slug: str
    total_seconds: int
    session_count: int
    last_session: Optional[datetime]


class ClaudeActiveTimer(BaseModel):
    project_slug: str
    project_name: str
    start_time: datetime
    elapsed_seconds: int


class ClaudeProject(BaseModel):
    id: str                      # slug, e.g. "jarvis", "trading-bot"
    name: str
    status: str                  # active | deferred | complete
    phase: Optional[str]
    last_updated: Optional[str]
    notes: List[str]
    section_header: str
    claude_url: Optional[str] = None    # link to claude.ai or project repo
    project_path: Optional[str] = None  # local path for resume command
    todos: List[ClaudeProjectTodoResponse] = []
    time_summary: Optional[ClaudeTimeSummary] = None
    # Code session activity (from DB classification or dir scan)
    code_sessions: Optional[int] = None
    code_last_session: Optional[datetime] = None
    recent_topics: List[str] = []
    # Source: "memory" = auto-detected from MEMORY.md, "registered" = manually added
    source: str = "memory"


class ClaudeProjectRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    status: str = "active"
    phase: Optional[str] = None
    notes: List[str] = []
    claude_url: Optional[str] = None
    project_path: Optional[str] = None


class DailyActivity(BaseModel):
    date: str
    messageCount: int
    sessionCount: int
    toolCallCount: int


class SessionStats(BaseModel):
    total_sessions: int
    total_messages: int
    daily_activity: List[DailyActivity]
    most_active_hour: Optional[int]
    streak_days: int


class BacklogItem(BaseModel):
    text: str
    reason: Optional[str]


class SyncResult(BaseModel):
    created: int
    updated: int
    projects: List[str]


# ── Todo ──────────────────────────────────────────────────────────────────────

class TodoCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    order_index: int = 0


class TodoUpdate(BaseModel):
    text: Optional[str] = Field(None, min_length=1, max_length=500)
    completed: Optional[bool] = None
    order_index: Optional[int] = None


class TodoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    initiative_id: int
    text: str
    completed: bool
    order_index: int
    created_at: datetime
    completed_at: Optional[datetime]


# ── Time Tracking ─────────────────────────────────────────────────────────────

class TimeEntryStart(BaseModel):
    initiative_id: int
    notes: Optional[str] = None


class TimeEntryStop(BaseModel):
    notes: Optional[str] = None


class TimeEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    initiative_id: int
    start_time: datetime
    end_time: Optional[datetime]
    duration_seconds: Optional[int]
    notes: Optional[str]


class TimeEntrySummary(BaseModel):
    initiative_id: int
    total_seconds: int
    session_count: int
    last_session: Optional[datetime]


class ActiveTimer(BaseModel):
    initiative_id: int
    initiative_title: str
    start_time: datetime
    elapsed_seconds: int


# ── Work Projects ─────────────────────────────────────────────────────────────

class WorkProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: Optional[str]
    status: StatusEnum
    priority: PriorityEnum
    created_at: datetime
    updated_at: datetime
    todos: List[TodoResponse] = []
    time_summary: Optional[TimeEntrySummary] = None
    path: Optional[str] = None
    url: Optional[str] = None
    phase: Optional[str] = None
