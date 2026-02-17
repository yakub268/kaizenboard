"""
Tests for the /api/dashboard router.

Routes covered:
  GET /api/dashboard/summary          — DashboardSummary
  GET /api/dashboard/timeline         — List[TimelineEntry]
  GET /api/dashboard/top-improvements — List[TopImprovement]
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta

from models import CategoryEnum, StatusEnum, PriorityEnum
from tests.conftest import make_initiative, make_metric


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------------------------------------------------------------------------
# SUMMARY
# ---------------------------------------------------------------------------


class TestDashboardSummary:
    def test_summary_empty_database(self, client: TestClient):
        response = client.get("/api/dashboard/summary")
        assert response.status_code == 200
        data = response.json()
        assert data["total_initiatives"] == 0
        assert data["by_status"] == []
        assert data["by_category"] == []
        assert data["total_metrics_improved"] == 0
        assert data["avg_improvement_pct"] is None
        assert data["completion_rate"] == 0.0

    def test_summary_total_initiatives_count(self, client: TestClient, db_session):
        for i in range(4):
            make_initiative(db_session, title=f"Init {i}")
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        assert response.status_code == 200
        assert response.json()["total_initiatives"] == 4

    def test_summary_by_status_grouping(self, client: TestClient, db_session):
        make_initiative(db_session, status=StatusEnum.identify)
        make_initiative(db_session, status=StatusEnum.identify)
        make_initiative(db_session, status=StatusEnum.plan)
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        by_status = {
            entry["status"]: entry["count"]
            for entry in response.json()["by_status"]
        }
        assert by_status.get("identify") == 2
        assert by_status.get("plan") == 1

    def test_summary_by_category_grouping(self, client: TestClient, db_session):
        make_initiative(db_session, category=CategoryEnum.quality)
        make_initiative(db_session, category=CategoryEnum.quality)
        make_initiative(db_session, category=CategoryEnum.safety)
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        by_category = {
            entry["category"]: entry["count"]
            for entry in response.json()["by_category"]
        }
        assert by_category.get("quality") == 2
        assert by_category.get("safety") == 1

    def test_summary_total_metrics_improved(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        # Only metrics WITH after_value count as improved
        make_metric(db_session, initiative_id=init.id, before_value=100.0, after_value=60.0)
        make_metric(db_session, initiative_id=init.id, before_value=50.0, after_value=None)
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        assert response.json()["total_metrics_improved"] == 1

    def test_summary_avg_improvement_pct(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        # 60% improvement (100→40) and 40% improvement (100→60) → avg 50%
        make_metric(db_session, initiative_id=init.id, before_value=100.0, after_value=40.0)
        make_metric(db_session, initiative_id=init.id, before_value=100.0, after_value=60.0)
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        avg = response.json()["avg_improvement_pct"]
        assert avg is not None
        assert abs(avg - 50.0) < 0.1

    def test_summary_completion_rate_all_sustained(self, client: TestClient, db_session):
        make_initiative(db_session, status=StatusEnum.sustain)
        make_initiative(db_session, status=StatusEnum.sustain)
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        assert response.json()["completion_rate"] == 100.0

    def test_summary_completion_rate_partial(self, client: TestClient, db_session):
        make_initiative(db_session, status=StatusEnum.sustain)
        make_initiative(db_session, status=StatusEnum.plan)
        make_initiative(db_session, status=StatusEnum.analyze)
        make_initiative(db_session, status=StatusEnum.identify)
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        # 1 out of 4 sustained = 25.0%
        assert response.json()["completion_rate"] == 25.0

    def test_summary_cost_savings_detected_by_dollar_unit(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        make_metric(
            db_session,
            initiative_id=init.id,
            name="Annual spend",
            unit="$",
            before_value=50000.0,
            after_value=30000.0,
        )
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        savings = response.json()["total_cost_savings"]
        assert savings is not None
        assert savings == pytest.approx(20000.0)

    def test_summary_cost_savings_detected_by_cost_keyword(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        make_metric(
            db_session,
            initiative_id=init.id,
            name="Processing cost per unit",
            unit="dollars",
            before_value=10.0,
            after_value=3.0,
        )
        db_session.commit()

        response = client.get("/api/dashboard/summary")
        savings = response.json()["total_cost_savings"]
        assert savings is not None
        assert savings == pytest.approx(7.0)


# ---------------------------------------------------------------------------
# TIMELINE
# ---------------------------------------------------------------------------


class TestDashboardTimeline:
    def test_timeline_returns_12_months(self, client: TestClient):
        response = client.get("/api/dashboard/timeline")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 12

    def test_timeline_entry_format(self, client: TestClient):
        response = client.get("/api/dashboard/timeline")
        for entry in response.json():
            assert "month" in entry
            assert "completed" in entry
            # month format YYYY-MM
            parts = entry["month"].split("-")
            assert len(parts) == 2
            assert len(parts[0]) == 4  # year
            assert len(parts[1]) == 2  # month

    def test_timeline_counts_recently_completed_initiative(
        self, client: TestClient, db_session
    ):
        now = _utcnow()
        init = make_initiative(
            db_session,
            status=StatusEnum.sustain,
            completed_date=now,
        )
        db_session.commit()

        response = client.get("/api/dashboard/timeline")
        this_month = now.strftime("%Y-%m")
        month_counts = {e["month"]: e["completed"] for e in response.json()}
        assert month_counts.get(this_month, 0) >= 1

    def test_timeline_ignores_old_completions(self, client: TestClient, db_session):
        # Initiative completed 2 years ago — should NOT appear in 12-month window
        two_years_ago = _utcnow() - timedelta(days=730)
        make_initiative(
            db_session,
            status=StatusEnum.sustain,
            completed_date=two_years_ago,
        )
        db_session.commit()

        response = client.get("/api/dashboard/timeline")
        total_completed = sum(e["completed"] for e in response.json())
        assert total_completed == 0

    def test_timeline_all_zeros_for_empty_db(self, client: TestClient):
        response = client.get("/api/dashboard/timeline")
        for entry in response.json():
            assert entry["completed"] == 0


# ---------------------------------------------------------------------------
# TOP IMPROVEMENTS
# ---------------------------------------------------------------------------


class TestTopImprovements:
    def test_top_improvements_empty_when_no_metrics_with_after_value(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        make_metric(db_session, initiative_id=init.id, before_value=100.0, after_value=None)
        db_session.commit()

        response = client.get("/api/dashboard/top-improvements")
        assert response.status_code == 200
        assert response.json() == []

    def test_top_improvements_returns_correct_fields(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session, title="Improvement Hero", owner="Jane")
        make_metric(
            db_session,
            initiative_id=init.id,
            name="Defect Count",
            unit="count",
            before_value=200.0,
            after_value=20.0,
        )
        db_session.commit()

        response = client.get("/api/dashboard/top-improvements")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        entry = data[0]
        assert entry["title"] == "Improvement Hero"
        assert entry["owner"] == "Jane"
        assert entry["metric_name"] == "Defect Count"
        assert entry["unit"] == "count"
        assert entry["before_value"] == 200.0
        assert entry["after_value"] == 20.0
        assert entry["improvement_pct"] == pytest.approx(90.0)

    def test_top_improvements_sorted_by_pct_descending(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        # 20% improvement
        make_metric(
            db_session, initiative_id=init.id,
            name="Low Gain", before_value=100.0, after_value=80.0
        )
        # 80% improvement
        make_metric(
            db_session, initiative_id=init.id,
            name="High Gain", before_value=100.0, after_value=20.0
        )
        db_session.commit()

        response = client.get("/api/dashboard/top-improvements")
        data = response.json()
        assert data[0]["metric_name"] == "High Gain"
        assert data[1]["metric_name"] == "Low Gain"

    def test_top_improvements_capped_at_10(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        for i in range(15):
            make_metric(
                db_session, initiative_id=init.id,
                name=f"Metric {i}",
                before_value=100.0,
                after_value=float(i),  # all different improvements
            )
        db_session.commit()

        response = client.get("/api/dashboard/top-improvements")
        assert len(response.json()) == 10

    def test_top_improvements_initiative_id_matches(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session, title="Linked Init")
        make_metric(
            db_session, initiative_id=init.id,
            before_value=100.0, after_value=10.0
        )
        db_session.commit()

        response = client.get("/api/dashboard/top-improvements")
        data = response.json()
        assert data[0]["id"] == init.id
