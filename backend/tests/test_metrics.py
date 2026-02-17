"""
Tests for the metrics router.

Routes covered:
  POST   /api/initiatives/{initiative_id}/metrics   — add_metric
  PUT    /api/metrics/{metric_id}                   — update_metric
  DELETE /api/metrics/{metric_id}                   — delete_metric
"""
import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_initiative, make_metric


# ---------------------------------------------------------------------------
# ADD METRIC
# ---------------------------------------------------------------------------


class TestAddMetric:
    def test_add_metric_to_existing_initiative(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        db_session.commit()

        payload = {
            "name": "Defect Rate",
            "unit": "%",
            "before_value": 15.0,
            "after_value": 3.0,
            "notes": "30-day sample",
        }
        response = client.post(
            f"/api/initiatives/{init.id}/metrics", json=payload
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Defect Rate"
        assert data["unit"] == "%"
        assert data["before_value"] == 15.0
        assert data["after_value"] == 3.0
        assert data["initiative_id"] == init.id
        assert data["id"] is not None

    def test_add_metric_without_after_value(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        db_session.commit()

        payload = {"name": "Processing Time", "unit": "hours", "before_value": 8.0}
        response = client.post(
            f"/api/initiatives/{init.id}/metrics", json=payload
        )
        assert response.status_code == 201
        data = response.json()
        assert data["after_value"] is None

    def test_add_metric_appears_in_initiative_detail(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        db_session.commit()

        client.post(
            f"/api/initiatives/{init.id}/metrics",
            json={"name": "Speed", "unit": "rpm", "before_value": 200.0},
        )

        detail = client.get(f"/api/initiatives/{init.id}")
        metrics = detail.json()["metrics"]
        assert any(m["name"] == "Speed" for m in metrics)

    def test_add_metric_logs_activity(self, client: TestClient, db_session):
        init = make_initiative(db_session, owner="Tester")
        db_session.commit()

        client.post(
            f"/api/initiatives/{init.id}/metrics",
            json={"name": "Throughput", "unit": "units/hr", "before_value": 50.0},
        )

        detail = client.get(f"/api/initiatives/{init.id}")
        activities = detail.json()["activities"]
        assert any(a["action"] == "metric_added" for a in activities)

    def test_add_metric_to_nonexistent_initiative_returns_404(
        self, client: TestClient
    ):
        payload = {"name": "Ghost Metric", "before_value": 1.0}
        response = client.post("/api/initiatives/99999/metrics", json=payload)
        assert response.status_code == 404

    def test_add_metric_missing_before_value_rejected(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        db_session.commit()

        response = client.post(
            f"/api/initiatives/{init.id}/metrics",
            json={"name": "Incomplete"},
        )
        assert response.status_code == 422

    def test_add_metric_empty_name_rejected(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        db_session.commit()

        response = client.post(
            f"/api/initiatives/{init.id}/metrics",
            json={"name": "", "before_value": 10.0},
        )
        assert response.status_code == 422

    def test_add_multiple_metrics_to_same_initiative(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        db_session.commit()

        for i in range(3):
            client.post(
                f"/api/initiatives/{init.id}/metrics",
                json={"name": f"Metric {i}", "before_value": float(i + 1)},
            )

        detail = client.get(f"/api/initiatives/{init.id}")
        assert len(detail.json()["metrics"]) == 3


# ---------------------------------------------------------------------------
# UPDATE METRIC
# ---------------------------------------------------------------------------


class TestUpdateMetric:
    def test_update_after_value(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        metric = make_metric(
            db_session, initiative_id=init.id, before_value=100.0, after_value=None
        )
        db_session.commit()

        response = client.put(
            f"/api/metrics/{metric.id}", json={"after_value": 40.0}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["after_value"] == 40.0
        assert data["before_value"] == 100.0

    def test_update_name_and_unit(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        metric = make_metric(
            db_session, initiative_id=init.id, name="Old Name", unit="ms"
        )
        db_session.commit()

        response = client.put(
            f"/api/metrics/{metric.id}",
            json={"name": "New Name", "unit": "seconds"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"
        assert data["unit"] == "seconds"

    def test_update_logs_activity(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        metric = make_metric(
            db_session,
            initiative_id=init.id,
            before_value=50.0,
            after_value=None,
        )
        db_session.commit()

        client.put(f"/api/metrics/{metric.id}", json={"after_value": 20.0})

        detail = client.get(f"/api/initiatives/{init.id}")
        activities = detail.json()["activities"]
        assert any(a["action"] == "metric_updated" for a in activities)

    def test_update_nonexistent_metric_returns_404(self, client: TestClient):
        response = client.put("/api/metrics/99999", json={"after_value": 1.0})
        assert response.status_code == 404

    def test_update_partial_preserves_other_fields(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        metric = make_metric(
            db_session,
            initiative_id=init.id,
            name="Preserved",
            unit="kg",
            before_value=200.0,
            after_value=100.0,
            notes="Keep this",
        )
        db_session.commit()

        response = client.put(
            f"/api/metrics/{metric.id}", json={"notes": "Updated notes"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Preserved"
        assert data["unit"] == "kg"
        assert data["before_value"] == 200.0
        assert data["after_value"] == 100.0
        assert data["notes"] == "Updated notes"


# ---------------------------------------------------------------------------
# DELETE METRIC
# ---------------------------------------------------------------------------


class TestDeleteMetric:
    def test_delete_existing_metric_returns_204(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        metric = make_metric(db_session, initiative_id=init.id)
        db_session.commit()

        response = client.delete(f"/api/metrics/{metric.id}")
        assert response.status_code == 204

    def test_deleted_metric_no_longer_in_initiative_detail(
        self, client: TestClient, db_session
    ):
        init = make_initiative(db_session)
        metric = make_metric(db_session, initiative_id=init.id, name="Gone")
        db_session.commit()

        client.delete(f"/api/metrics/{metric.id}")

        detail = client.get(f"/api/initiatives/{init.id}")
        names = [m["name"] for m in detail.json()["metrics"]]
        assert "Gone" not in names

    def test_delete_logs_activity(self, client: TestClient, db_session):
        init = make_initiative(db_session)
        metric = make_metric(db_session, initiative_id=init.id, name="Log Delete")
        db_session.commit()

        client.delete(f"/api/metrics/{metric.id}")

        detail = client.get(f"/api/initiatives/{init.id}")
        activities = detail.json()["activities"]
        assert any(a["action"] == "metric_deleted" for a in activities)

    def test_delete_nonexistent_metric_returns_404(self, client: TestClient):
        response = client.delete("/api/metrics/99999")
        assert response.status_code == 404
