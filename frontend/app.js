const { useState, useEffect, useRef } = React;

const INITIAL_DEPOT = { id: "MAIN-HUB", lat: 28.6315, lng: 77.2167 };
const INITIAL_STOPS = [
  { id: "ORD-201", lat: 28.6519, lng: 77.1909, demand_weight: 4.0, start_min: 540, end_min: 600 },
  { id: "ORD-202", lat: 28.6448, lng: 77.2490, demand_weight: 5.0, start_min: 570, end_min: 630 },
  { id: "ORD-203", lat: 28.5921, lng: 77.2290, demand_weight: 4.0, start_min: 610, end_min: 670 },
  { id: "ORD-204", lat: 28.5672, lng: 77.2100, demand_weight: 6.0, start_min: 660, end_min: 720 }
];
const COLORS = ["#38bdf8", "#f43f5e", "#a855f7", "#eab308"];

function App() {
  const [stops, setStops] = useState(INITIAL_STOPS);
  const [capacity, setCapacity] = useState(15.0);
  const [result, setResult] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("Idle (Click permission below)");
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const vehicleMarkerRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: "map",
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [INITIAL_DEPOT.lng, INITIAL_DEPOT.lat],
      zoom: 11.5
    });

    map.on("click", (e) => {
      const newId = `ORD-${Math.floor(205 + Math.random() * 794)}`;
      setStops((prev) => [
        ...prev,
        {
          id: newId,
          lat: Number(e.lngLat.lat.toFixed(4)),
          lng: Number(e.lngLat.lng.toFixed(4)),
          demand_weight: 3.5,
          start_min: 600,
          end_min: 660
        }
      ]);
    });

    mapRef.current = map;
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Depot Marker
    const depotEl = document.createElement("div");
    depotEl.style.cssText = "background:#22c55e;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #22c55e;";
    const depotMarker = new maplibregl.Marker({ element: depotEl })
      .setLngLat([INITIAL_DEPOT.lng, INITIAL_DEPOT.lat])
      .setPopup(new maplibregl.Popup().setHTML("<b>Central Warehouse Hub</b>"))
      .addTo(map);
    markersRef.current.push(depotMarker);

    // Stop Markers
    stops.forEach((s) => {
      const el = document.createElement("div");
      el.style.cssText = "background:#f97316;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px #f97316;";
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([s.lng, s.lat])
        .setPopup(new maplibregl.Popup().setHTML(`<b>Order: ${s.id}</b><br/>Weight: ${s.demand_weight} kg`))
        .addTo(map);
      markersRef.current.push(m);
    });
  }, [stops]);

  const clearRoutesFromMap = () => {
    const map = mapRef.current;
    if (!map) return;
    for (let i = 0; i < 10; i++) {
      if (map.getLayer(`route-line-${i}`)) map.removeLayer(`route-line-${i}`);
      if (map.getSource(`route-${i}`)) map.removeSource(`route-${i}`);
    }
    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
  };

  const handleReset = () => {
    clearRoutesFromMap();
    setStops(INITIAL_STOPS);
    setCapacity(15.0);
    setResult(null);
    setGpsStatus("Idle (Click permission below)");
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [INITIAL_DEPOT.lng, INITIAL_DEPOT.lat], zoom: 11.5 });
    }
  };

  const requestGpsPermission = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Geolocation not supported by browser");
      return;
    }
    setGpsStatus("Requesting browser GPS permission...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setGpsStatus(`✅ GPS Active (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
        mapRef.current.flyTo({ center: [longitude, latitude], zoom: 13 });
      },
      (error) => {
        setGpsStatus("❌ GPS Permission Denied / Unavailable");
      }
    );
  };

  const optimizeRoutes = async () => {
    const res = await fetch("/api/v1/optimize-routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depot: INITIAL_DEPOT, stops, vehicle_capacity: Number(capacity) })
    });
    const data = await res.json();
    setResult(data);
    drawRoutes(data.fleet_routes);
  };

  const drawRoutes = (fleetRoutes) => {
    const map = mapRef.current;
    if (!map) return;

    clearRoutesFromMap();

    fleetRoutes.forEach((route, idx) => {
      const coords = route.coordinates.map((c) => [c.lng, c.lat]);
      map.addSource(`route-${idx}`, {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } }
      });
      map.addLayer({
        id: `route-line-${idx}`,
        type: "line",
        source: `route-${idx}`,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": COLORS[idx % COLORS.length], "line-width": 5 }
      });
    });
  };

  const startTelemetry = () => {
    if (!result || !result.fleet_routes.length) return;
    const route = result.fleet_routes[0];
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/telemetry/${route.vehicle_id}`);

    ws.onopen = () => {
      setGpsStatus(`Streaming GPS telemetry...`);
      ws.send(JSON.stringify({ coordinates: route.coordinates, delay_ms: 500 }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.status === "EN_ROUTE") {
        const { lat, lng, id } = msg.current_position;
        setGpsStatus(`🚚 Vehicle visiting stop ${id}`);
        if (!vehicleMarkerRef.current) {
          const el = document.createElement("div");
          el.style.cssText = "background:#fde047;width:22px;height:22px;border-radius:50%;border:3px solid #000;box-shadow:0 0 12px #fde047;";
          vehicleMarkerRef.current = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
        } else {
          vehicleMarkerRef.current.setLngLat([lng, lat]);
        }
      } else if (msg.status === "COMPLETED") {
        setGpsStatus(`✅ Route completed successfully!`);
        ws.close();
      }
    };
  };

  return (
    <React.Fragment>
      <div id="sidebar">
        <h1>ChakravyuhBreaker</h1>
        <div className="subtitle">AI Logistics & Route Optimization Command Center</div>

        <div className="section-title">How to Use</div>
        <div className="instruction-box">
          🖱️ <b>Click anywhere on the map</b> to add custom delivery stops dynamically.<br/>
          ⚙️ Adjust bike payload and request GPS permission below.
        </div>

        <button className="btn btn-primary" onClick={optimizeRoutes}>
          ⚡ Run Route Optimizer (CVRP + 2-Opt)
        </button>

        <button className="btn btn-ws" onClick={startTelemetry} disabled={!result}>
          📡 Watch Live Vehicle Simulation
        </button>

        <button className="btn btn-secondary" onClick={requestGpsPermission}>
          📍 Grant Live Browser GPS Permission
        </button>

        <button className="btn btn-secondary" onClick={handleReset}>
          🔄 Reset to Default Stops
        </button>

        <div className="card" style={{ marginTop: "10px" }}>
          <div className="stat-row">
            <span className="stat-label">Active Delivery Stops:</span>
            <span className="stat-value" style={{ color: "#38bdf8" }}>{stops.length} locations (User Added)</span>
          </div>
          <div className="stat-row" style={{ margin: "8px 0" }}>
            <span className="stat-label">Max Bike Payload Limit:</span>
            <input 
              type="number" 
              className="input-field" 
              value={capacity} 
              onChange={(e) => setCapacity(e.target.value)} 
              min="1" 
              max="100"
            />
          </div>
          <div className="stat-row" style={{ borderTop: "1px solid #374151", paddingTop: "8px" }}>
            <span className="stat-label">Live GPS Status:</span>
            <span className="stat-value" style={{ color: "#34d399", fontSize: "0.8rem" }}>{gpsStatus}</span>
          </div>
        </div>

        {result && (
          <React.Fragment>
            <div className="section-title" style={{ marginTop: "6px" }}>Engine Analytics</div>
            <div className="card">
              <div className="stat-row" style={{ alignItems: "center", marginBottom: "6px" }}>
                <span className="stat-label">Cache Engine:</span>
                <span className={`badge ${result.cache_hit ? "badge-hit" : "badge-miss"}`}>
                  {result.cache_hit ? "⚡ REDIS CACHE HIT" : "⚙️ FRESH COMPUTE"}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Spatial QuadTree Index:</span>
                <span className="stat-value">Active (O log N)</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Vehicles Dispatched:</span>
                <span className="stat-value">{result.total_vehicles_dispatched} bikes</span>
              </div>

              {result.schedule_conflicts.length > 0 && (
                <div className="conflict-alert">
                  ⚠️ {result.schedule_conflicts.length} time-window overlap conflict(s) detected!
                </div>
              )}
            </div>

            <div className="section-title">Optimized Fleet Routes</div>
            {result.fleet_routes.map((r, idx) => (
              <div className="route-card" key={r.vehicle_id} style={{ borderLeftColor: COLORS[idx % COLORS.length] }}>
                <div className="stat-row">
                  <b>{r.vehicle_id}</b>
                  <span style={{ color: "#38bdf8", fontWeight: "600" }}>{r.total_distance_km} km</span>
                </div>
                <div className="stat-row" style={{ fontSize: "0.78rem", color: "#9ca3af" }}>
                  <span>Load: {r.total_load} / {r.capacity} kg</span>
                </div>
                <div className="route-path">
                  {r.stop_ids.join(" ➔ ")}
                </div>
              </div>
            ))}
          </React.Fragment>
        )}
      </div>
      <div id="map-container"><div id="map"></div></div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);