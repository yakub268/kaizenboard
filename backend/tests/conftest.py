"""
Shared pytest fixtures for KaizenBoard backend tests.

Uses an in-memory SQLite database so tests never touch kaizenboard.db.
The `get_db` FastAPI dependency is overridden for every request so all
routers transparently receive the test session.
"""
import sys
import os

# Ensure the backend package root is importable regardless of how pytest is
# invoked (e.g. `python -m pytest tests/` from inside the backend directory).
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from fastapi.testclient import TestClient

from database import Base, get_db
from main import app
from models import Initiative, Metric, CategoryEnum, StatusEnum, PriorityEnum


# ---------------------------------------------------------------------------
# In-memory engine shared across the whole test session
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Create all tables once for the entire test session."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def db_session(create_tables) -> Session:
    """
    Yields a fresh database session for each test and rolls back afterwards
    so tests are fully isolated from each other.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    """
    Returns a TestClient whose requests use the same in-memory session as the
    test itself, ensuring data created in the test is visible to the router
    and vice-versa.
    """

    def override_get_db():
        try:
            yield db_session
        finally:
            pass  # rollback is handled by db_session fixture

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def make_initiative(
    db: Session,
    title: str = "Test Initiative",
    category: CategoryEnum = CategoryEnum.quality,
    status: StatusEnum = StatusEnum.identify,
    priority: PriorityEnum = PriorityEnum.medium,
    owner: str = "Test Owner",
    department: str = "Test Dept",
    description: str = "A test initiative description.",
    target_date=None,
    completed_date=None,
) -> Initiative:
    """Insert and return a persisted Initiative in the given session."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    initiative = Initiative(
        title=title,
        description=description,
        category=category,
        status=status,
        priority=priority,
        owner=owner,
        department=department,
        created_at=now,
        updated_at=now,
        target_date=target_date,
        completed_date=completed_date,
    )
    db.add(initiative)
    db.flush()
    return initiative


def make_metric(
    db: Session,
    initiative_id: int,
    name: str = "Cycle time",
    unit: str = "minutes",
    before_value: float = 100.0,
    after_value: float | None = None,
    notes: str | None = None,
) -> Metric:
    """Insert and return a persisted Metric in the given session."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    metric = Metric(
        initiative_id=initiative_id,
        name=name,
        unit=unit,
        before_value=before_value,
        after_value=after_value,
        notes=notes,
        measured_at=now,
    )
    db.add(metric)
    db.flush()
    return metric
