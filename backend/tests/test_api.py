from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "online"


def test_optimize_routes_and_caching():
    payload = {
        "depot": {"id": "HUB-DELHI", "lat": 28.6100, "lng": 77.2000},
        "vehicle_capacity": 10.0,
        "stops": [
            {"id": "ORD-1", "lat": 28.6200, "lng": 77.2100, "demand_weight": 4.0, "start_min": 540, "end_min": 600},
            {"id": "ORD-2", "lat": 28.6300, "lng": 77.2200, "demand_weight": 4.0, "start_min": 570, "end_min": 630},
            {"id": "ORD-3", "lat": 28.6400, "lng": 77.2300, "demand_weight": 5.0, "start_min": 660, "end_min": 720},
        ],
    }

    # First call: computes fresh routes (cache_hit should be False)
    res1 = client.post("/api/v1/optimize-routes", json=payload)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["cache_hit"] is False
    assert data1["total_vehicles_dispatched"] == 2
    assert len(data1["schedule_conflicts"]) == 1  # ORD-2 overlaps with ORD-1

    # Second identical call: served instantly from cache (cache_hit should be True)
    res2 = client.post("/api/v1/optimize-routes", json=payload)
    assert res2.status_code == 200
    assert res2.json()["cache_hit"] is True
