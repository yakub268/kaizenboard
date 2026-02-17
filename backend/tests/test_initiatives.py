"""
Tests for the /api/initiatives router.

Covers:
- List (empty, populated, filters by status and category)
- Create (success, defaults, validation errors)
- Get by ID (success, 404)
- Update (partial, no-op, 404)
- Delete (success, 404)
- Status patch (sustain auto-sets completed_date, activity log, 404)
"""
import pytest
from fastapi.testclient import TestClient

from models import CategoryEnum, StatusEnum, PriorityEnum
from tests.conftest import make_initiative, make_metric


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------


class TestListInitiatives:
    def test_empty_database_returns_empty_list(self, client: TestClient):
        response = client.get("/api/initiatives")
        assert response.status_code == 200
        assert response.json() == []

    def test_returns_all_initiatives(self, client: TestClient, db_session):
        make_initiative(db_session, title="Alpha")
        make_initiative(db_session, title="Beta")
        db_session.commit()

        response = client.get("/api/initiatives")
        assert response.status_code == 200
        titles = [i["title"] for i in response.json()]
        assert "Alpha" in titles
        assert "Beta" in titles

    def test_filter_by_status(self, client: TestClient, db_session):
        make_initiative(db_session, title="In Plan", status=StatusEnum.plan)
        make_initiative(db_session, title="In Verify", status=StatusEnum.verify)
        db_session.commit()

        response = client.get("/api/initiatives", params={"status": "plan"})
        assert response.status_code == 200
        data = response.json()
        assert all(i["status"] == "plan" for i in data)
        titles = [i["title"] for i in data]
        assert "In Plan" in titles
        assert "In Verify" not in titles

    def test_filter_by_category(self, client: TestClient, db_session):
        make_initiative(db_session, title="Safety One", category=CategoryEnum.safety)
        make_initiative(db_session, title="Quality One", category=CategoryEnum.quality)
        db_session.commit()

        response = client.get("/api/initiatives", params={"category": "safety"})
        assert response.status_code == 200
        data = response.json()
        assert all(i["category"] == "safety" for i in data)

    def test_filter_by_status_and_category_combined(self, client: TestClient, db_session):
        make_initiative(
            db_session, title="Match", status=StatusEnum.analyze,
            category=CategoryEnum.cost_savings,
        )
        make_initiative(
            db_session, title="Wrong Status", status=StatusEnum.plan,
            category=CategoryEnum.cost_savings,
        )
        make_initiative(
            db_session, title="Wrong Category", status=StatusEnum.analyze,
            category=CategoryEnum.quality,
        )
        db_session.commit()

        response = client.get(
            "/api/initiatives",
            params={"status": "analyze", "category": "cost_savings"},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["title"] == "Match"

    def test_ordered_newest_first(self, client: TestClient, db_session):
        from datetime import datetime, timezone, timedelta

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        older = make_initiative(db_session, title="Older")
        older.created_at = now - timedelta(days=10)
        newer = make_initiative(db_session, title="Newer")
        newer.created_at = now
        db_session.commit()

        response = client.get("/api/initiatives")
        data = response.json()
        titles = [i["title"] for i in data]
        assert titles.index("Newer") < titles.index("Older")


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------


class TestCreateInitiative:
    def test_create_minimal_returns_201(self, client: TestClient):
        payload = {"title": "Minimal Initiative"}
        response = client.post("/api/initiatives", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Minimal Initiative"
        assert data["id"] is not None

    def test_create_defaults_are_applied(self, client: TestClient):
        payload = {"title": "Defaults Check"}
        response = client.post("/api/initiatives", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "identify"
        assert data["priority"] == "medium"
        assert data["category"] == "other"

    def test_create_full_payload(self, client: TestClient):
        payload = {
            "title": "Full Initiative",
            "description": "Some description",
            "category": "quality",
            "status": "analyze",
            "priority": "high",
            "owner": "Jane Doe",
            "department": "Engineering",
        }
        response = client.post("/api/initiatives", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["category"] == "quality"
        assert data["status"] == "analyze"
        assert data["priority"] == "high"
        assert data["owner"] == "Jane Doe"
        assert data["department"] == "Engineering"

    def test_create_logs_activity(self, client: TestClient):
        payload = {"title": "Activity Check", "owner": "Bob"}
        response = client.post("/api/initiatives", json=payload)
        assert response.status_code == 201
        initiative_id = response.json()["id"]

        detail = client.get(f"/api/initiatives/{initiative_id}")
        activities = detail.json()["activities"]
        assert any(a["action"] == "created" for a in activities)

    def test_create_empty_title_rejected(self, client: TestClient):
        response = client.post("/api/initiatives", json={"title": ""})
        assert response.status_code == 422

    def test_create_invalid_status_rejected(self, client: TestClient):
        response = client.post(
            "/api/initiatives", json={"title": "Bad", "status": "nonexistent"}
        )
        assert response.status_code == 422

    def test_create_invalid_priority_rejected(self, client: TestClient):
        response = client.post(
            "/api/initiatives", json={"title": "Bad", "priority": "ultra"}
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET BY ID
# ---------------------------------------------------------------------------


class TestGetInitiative:
    def test_get_existing_returns_detail(self, client: TestClient, db_session):
        init = make_initiative(db_session, title="Detail Test")
        make_metric(db_session, initiative_id=init.id, name="Speed", before_value=50.0)
        db_session.commit()

        response = client.get(f"/api/initiatives/{init.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Detail Test"
        assert isinstance(data["metrics"], list)
        assert len(data["metrics"]) == 1
        assert data["metrics"][0]["name"] == "Speed"
        assert isinstance(data["activities"], list)

    def test_get_nonexistent_returns_404(self, client: TestClient):
        response = client.get("/api/initiatives/99999")
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# UPDATE (PUT)
# ---------------------------------------------------------------------------


class TestUpdateInitiative:
    def test_update_title(self, client: TestClient, db_session):
        init = make_initiative(db_session, title="Original")
        db_session.commit()

        response = client.put(
            f"/api/initiatives/{init.id}",
            json={"title": "Updated Title"},
        )
        assert response.status_code == 200
        assert response.json()["title"] == "Updated Title"

    def test_update_partial_leaves_other_fields(self, client: TestClient, db_session):
        init = make_initiative(
            db_session, title="Keep Me", priority=PriorityEnum.critical
        )
        db_session.commit()

        response = client.put(
            f"/api/initiatives/{init.id}",
            json={"description": "Only description changed"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Keep Me"
        assert data["priority"] == "critical"
        assert data["description"] == "Only description changed"

    def test_update_nonexistent_returns_404(self, client: TestClient):
        response = client.put("/api/initiatives/99999", json={"title": "Ghost"})
        assert response.status_code == 404

    def test_update_logs_activity(self, client: TestClient, db_session):
        init = make_initiative(db_session, title="Log Me")
        db_session.commit()

        client.put(
            f"/api/initiatives/{init.id}",
            json={"title": "Log Me Updated"},
            params={"user": "Alice"},
        )

        detail = client.get(f"/api/initiatives/{init.id}")
        activities = detail.json()["activities"]
        assert any(a["action"] == "updated" for a in activities)


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------


class TestDeleteInitiative:
    def test_delete_existing_returns_204(self, client: TestClient, db_session):
        init = make_initiative(db_session, title="Delete Me")
        db_session.commit()

        response = client.delete(f"/api/initiatives/{init.id}")
        assert response.status_code == 204

        # Confirm it's gone
        get_response = client.get(f"/api/initiatives/{init.id}")
        assert get_response.status_code == 404

    def test_delete_nonexistent_returns_404(self, client: TestClient):
        response = client.delete("/api/initiatives/99999")
        assert response.status_code == 404

    def test_delete_cascades_metrics(self, client: TestClient, db_session):
        init = make_initiative(db_session, title="Cascade Test")
        metric = make_metric(db_session, initiative_id=init.id)
        db_session.commit()
        metric_id = metric.id

        client.delete(f"/api/initiatives/{init.id}")

        # Metric should be gone too (cascade delete at DB level)
        from models import Metric as MetricModel
        remaining = db_session.query(MetricModel).filter(
            MetricModel.id == metric_id
        ).first()
        assert remaining is None


# ---------------------------------------------------------------------------
# STATUS PATCH
# ---------------------------------------------------------------------------


class TestStatusPatch:
    def test_patch_status_updates_field(self, client: TestClient, db_session):
        init = make_initiative(db_session, status=StatusEnum.identify)
        db_session.commit()

        response = client.patch(
            f"/api/initiatives/{init.id}/status",
            json={"status": "analyze", "user": "Carol"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "analyze"

    def test_patch_status_to_sustain_sets_completed_date(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session, status=StatusEnum.verify)
        db_session.commit()

        response = client.patch(
            f"/api/initiatives/{init.id}/status",
            json={"status": "sustain", "user": "Dave"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "sustain"
        assert data["completed_date"] is not None

    def test_patch_status_sustain_does_not_overwrite_existing_completed_date(
        self, client: TestClient, db_session
    ):
        from datetime import datetime, timezone

        fixed_date = datetime(2024, 1, 15, tzinfo=timezone.utc).replace(tzinfo=None)
        init = make_initiative(
            db_session,
            status=StatusEnum.verify,
            completed_date=fixed_date,
        )
        db_session.commit()

        response = client.patch(
            f"/api/initiatives/{init.id}/status",
            json={"status": "sustain", "user": "Eve"},
        )
        assert response.status_code == 200
        returned_date = response.json()["completed_date"]
        # The date should still reflect the original fixed date (year 2024)
        assert "2024" in returned_date

    def test_patch_status_logs_activity(self, client: TestClient, db_session):
        init = make_initiative(db_session, status=StatusEnum.identify)
        db_session.commit()

        client.patch(
            f"/api/initiatives/{init.id}/status",
            json={"status": "plan", "user": "Frank"},
        )

        detail = client.get(f"/api/initiatives/{init.id}")
        activities = detail.json()["activities"]
        assert any(a["action"] == "status_changed" for a in activities)

    def test_patch_status_nonexistent_returns_404(self, client: TestClient):
        response = client.patch(
            "/api/initiatives/99999/status",
            json={"status": "analyze", "user": "Nobody"},
        )
        assert response.status_code == 404

    def test_patch_invalid_status_value_rejected(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        db_session.commit()

        response = client.patch(
            f"/api/initiatives/{init.id}/status",
            json={"status": "bogus", "user": "Error"},
        )
        assert response.status_code == 422
