import hashlib
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    import redis
except ImportError:
    redis = None

from backend.app.algorithms.quadtree import DeliveryPoint, BoundingBox, QuadTree
from backend.app.algorithms.interval_tree import TimeWindow, IntervalTree
from backend.app.algorithms.routing_engine import LocationNode, RoadGraph, solve_cvrp

app = FastAPI(
    title="ChakravyuhBreaker Routing Engine API",
    description="Real-Time Dynamic Delivery & Multi-Stop Route Optimizer using A*, 2-Opt, QuadTree, and Interval Tree.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_HTML = Path(__file__).resolve().parents[2] / "frontend" / "index.html"


class HybridCache:
    """
    Attempts to cache hot routes in Redis. Automatically falls back to
    an in-memory dictionary if a local Redis server is not running.
    """
    def __init__(self):
        self.memory_store: Dict[str, str] = {}
        self.redis_client = None
        if redis is not None:
            try:
                client = redis.Redis(host="localhost", port=6379, db=0, socket_connect_timeout=0.5)
                client.ping()
                self.redis_client = client
            except Exception:
                self.redis_client = None

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        if self.redis_client:
            data = self.redis_client.get(key)
            return json.loads(data) if data else None
        raw = self.memory_store.get(key)
        return json.loads(raw) if raw else None

    def set(self, key: str, value: Dict[str, Any], ttl_seconds: int = 300) -> None:
        serialized = json.dumps(value)
        if self.redis_client:
            self.redis_client.setex(key, ttl_seconds, serialized)
        else:
            self.memory_store[key] = serialized


cache = HybridCache()


class StopInput(BaseModel):
    id: str = Field(..., examples=["ORD-101"])
    lat: float = Field(..., examples=[28.6139])
    lng: float = Field(..., examples=[77.2090])
    demand_weight: float = Field(default=2.0, gt=0)
    start_min: int = Field(default=540, description="Window start in minutes from midnight (540 = 09:00 AM)")
    end_min: int = Field(default=600, description="Window end in minutes from midnight (600 = 10:00 AM)")


class DepotInput(BaseModel):
    id: str = Field(default="DEPOT-MAIN")
    lat: float = Field(default=28.6100)
    lng: float = Field(default=77.2000)


class OptimizeRequest(BaseModel):
    depot: DepotInput
    stops: List[StopInput]
    vehicle_capacity: float = Field(default=15.0, gt=0)


@app.get("/")
def serve_dashboard():
    """Serves the interactive React + MapLibre GL frontend dashboard."""
    return FileResponse(FRONTEND_HTML)


@app.get("/health")
def health_check():
    """Verify the server is online and check which cache engine is active."""
    return {
        "status": "online",
        "engine": "ChakravyuhBreaker",
        "cache_backend": "redis" if cache.redis_client else "in-memory-fallback",
    }


@app.post("/api/v1/optimize-routes")
def optimize_routes(payload: OptimizeRequest):
    payload_json = payload.model_dump_json()
    cache_key = "route_opt:" + hashlib.sha256(payload_json.encode()).hexdigest()

    cached_result = cache.get(cache_key)
    if cached_result is not None:
        cached_result["cache_hit"] = True
        return cached_result

    boundary = BoundingBox(
        center_lat=payload.depot.lat,
        center_lng=payload.depot.lng,
        half_lat=2.0,
        half_lng=2.0,
    )
    quadtree = QuadTree(boundary=boundary, capacity=4)

    interval_tree = IntervalTree()
    time_conflicts = []

    location_nodes: List[LocationNode] = []
    for stop in payload.stops:
        quadtree.insert(DeliveryPoint(id=stop.id, lat=stop.lat, lng=stop.lng, demand_weight=stop.demand_weight))

        window = TimeWindow(order_id=stop.id, start_min=stop.start_min, end_min=stop.end_min)
        overlapping = interval_tree.find_conflicts(window)
        if overlapping:
            time_conflicts.append({
                "order_id": stop.id,
                "conflicts_with": [w.order_id for w in overlapping],
            })
        interval_tree.insert(window)

        location_nodes.append(
            LocationNode(id=stop.id, lat=stop.lat, lng=stop.lng, demand_weight=stop.demand_weight)
        )

    depot_node = LocationNode(id=payload.depot.id, lat=payload.depot.lat, lng=payload.depot.lng)
    fleet_routes = solve_cvrp(depot=depot_node, stops=location_nodes, vehicle_capacity=payload.vehicle_capacity)

    response_data = {
        "cache_hit": False,
        "total_vehicles_dispatched": len(fleet_routes),
        "spatial_quadtree_subdivided": quadtree.divided,
        "schedule_conflicts": time_conflicts,
        "fleet_routes": fleet_routes,
    }

    cache.set(cache_key, response_data)
    return response_data


@app.websocket("/ws/telemetry/{vehicle_id}")
async def vehicle_telemetry_ws(websocket: WebSocket, vehicle_id: str):
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        waypoints = data.get("coordinates", [])
        delay_sec = data.get("delay_ms", 50) / 1000.0
        for point in waypoints:
            await websocket.send_json({
                "vehicle_id": vehicle_id,
                "status": "EN_ROUTE",
                "current_position": point,
            })
            await asyncio.sleep(delay_sec)
        await websocket.send_json({"vehicle_id": vehicle_id, "status": "COMPLETED"})
    except WebSocketDisconnect:
        pass
