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
