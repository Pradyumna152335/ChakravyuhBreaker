const { useState, useEffect, useRef } = React;

const INITIAL_DEPOT = { id: "MAIN-HUB", lat: 28.6315, lng: 77.2167 };
const INITIAL_STOPS = [
  { id: "ORD-201", lat: 28.6519, lng: 77.1909, demand_weight: 4.0, start_min: 540, end_min: 600 },
  { id: "ORD-202", lat: 28.6448, lng: 77.2490, demand_weight: 5.0, start_min: 570, end_min: 630 },
  { id: "ORD-203", lat: 28.5921, lng: 77.2290, demand_weight: 4.0, start_min: 610, end_min: 670 },
  { id: "ORD-204", lat: 28.5672, lng: 77.2100, demand_weight: 6.0, start_min: 660, end_min: 720 }
];
const COLORS = ["#0284c7", "#e11d48", "#9333ea", "#ca8a04"];

function App() {
  const [stops, setStops] = useState(INITIAL_STOPS);
  const [capacity, setCapacity] = useState(15.0);
  const [result, setResult] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("Idle (Click permission below)");
  const [showModal, setShowModal] = useState(false);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const vehicleMarkerRef = useRef(null);
  const activeWsRef = useRef(null);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: "map",
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [INITIAL_DEPOT.lng, INITIAL_DEPOT.lat],
      zoom: 11.5
    });

    // Make state and country borders bold when map loads
    map.on("load", () => {
      const layers = map.getStyle().layers;
      layers.forEach((layer) => {
        if (layer.id.includes("boundary") || layer.id.includes("admin") || layer.id.includes("state") || layer.id.includes("country")) {
          if (layer.type === "line") {
            map.setPaintProperty(layer.id, "line-width", 2.5);
            map.setPaintProperty(layer.id, "line-color", "#64748b");
            map.setPaintProperty(layer.id, "line-opacity", 0.85);
          }
        }
      });
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
    depotEl.style.cssText = "background:#16a34a;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #16a34a;";
    const depotMarker = new maplibregl.Marker({ element: depotEl })
      .setLngLat([INITIAL_DEPOT.lng, INITIAL_DEPOT.lat])
      .setPopup(new maplibregl.Popup().setHTML("<b>Central Warehouse Hub</b>"))
      .addTo(map);
    markersRef.current.push(depotMarker);

    // Stop Markers with Order ID Labels
    stops.forEach((s) => {
      const el = document.createElement("div");
      el.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;";
      el.innerHTML = `
        <div style="background:#ea580c;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px #ea580c;flex-shrink:0;"></div>
        <div style="background:rgba(255, 255, 255, 0.95);color:#0284c7;padding:2px 6px;border-radius:4px;font-size:0.72rem;font-weight:700;border:1px solid rgba(2,132,199,0.3);white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.08);">${s.id}</div>
      `;
      
      const m = new maplibregl.Marker({ element: el, anchor: "left" })
        .setLngLat([s.lng, s.lat])
        .setPopup(new maplibregl.Popup().setHTML(`<b>Order: ${s.id}</b><br/>Weight: ${s.demand_weight} kg<br/>Lat/Lng: ${s.lat}, ${s.lng}`))
        .addTo(map);
      markersRef.current.push(m);
    });
  }, [stops]);

  const updateStopWeight = (index, newWeight) => {
    const updatedStops = [...stops];
    updatedStops[index].demand_weight = Math.max(0.1, Number(newWeight));
    setStops(updatedStops);
  };

  const adjustWeight = (index, delta) => {
    const updatedStops = [...stops];
    const current = updatedStops[index].demand_weight;
    updatedStops[index].demand_weight = Number(Math.max(0.5, (current + delta)).toFixed(1));
    setStops(updatedStops);
  };

  const clearRoutesFromMap = () => {
    const map = mapRef.current;
    if (!map) return;
    for (let i = 0; i < 10; i++) {
      if (map.getLayer(`route-line-${i}`)) map.removeLayer(`route-line-${i}`);
      if (map.getSource(`route-${i}`)) map.removeSource(`route-${i}`);
    }
    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
  };

  const handleReset = () => {
    clearRoutesFromMap();
    setStops(JSON.parse(JSON.stringify(INITIAL_STOPS)));
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
    drawRoutesSequentially(data.fleet_routes);
  };

  const drawRoutesSequentially = async (fleetRoutes) => {
    const map = mapRef.current;
    if (!map) return;

    clearRoutesFromMap();

    for (let idx = 0; idx < fleetRoutes.length; idx++) {
      const route = fleetRoutes[idx];
      const vehicleColor = COLORS[idx % COLORS.length];
      const fullCoords = route.coordinates.map((c) => [c.lng, c.lat]);
      if (fullCoords.length === 0) continue;

      const sourceId = `route-${idx}`;
      const layerId = `route-line-${idx}`;

      map.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [fullCoords[0]]
          }
        }
      });

      map.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": vehicleColor, "line-width": 5 }
      });

      setGpsStatus(`✨ Drawing route for ${route.vehicle_id}...`);

      for (let p = 1; p < fullCoords.length; p++) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        if (!mapRef.current) return;
        const currentCoords = fullCoords.slice(0, p + 1);
        const source = map.getSource(sourceId);
        if (source) {
          source.setData({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: currentCoords
            }
          });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setGpsStatus("✅ All optimized routes rendered successfully!");
  };

  const simulateSingleRoute = (route, vehicleColor) => {
    return new Promise((resolve) => {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/telemetry/${route.vehicle_id}`);
      activeWsRef.current = ws;

      ws.onopen = () => {
        setGpsStatus(`🚚 Simulating ${route.vehicle_id} deliveries...`);
        ws.send(JSON.stringify({ coordinates: route.coordinates, delay_ms: 400 }));
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.status === "EN_ROUTE") {
          const { lat, lng, id } = msg.current_position;
          setGpsStatus(`🚚 ${route.vehicle_id} visiting stop ${id}`);

          if (!vehicleMarkerRef.current) {
            const el = document.createElement("div");
            el.innerHTML = `📍`;
            el.style.cssText = `background:${vehicleColor};color:#fff;font-size:14px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 0 14px ${vehicleColor};`;
            
            vehicleMarkerRef.current = new maplibregl.Marker({ element: el })
              .setLngLat([lng, lat])
              .addTo(mapRef.current);
          } else {
            vehicleMarkerRef.current.getElement().style.background = vehicleColor;
            vehicleMarkerRef.current.getElement().style.boxShadow = `0 0 14px ${vehicleColor}`;
            vehicleMarkerRef.current.setLngLat([lng, lat]);
          }
        } else if (msg.status === "COMPLETED") {
          setGpsStatus(`✅ ${route.vehicle_id} completed tour!`);
          ws.close();
          resolve();
        }
      };

      ws.onerror = () => resolve();
    });
  };

  const startSequentialSimulation = async () => {
    if (!result || !result.fleet_routes.length) return;

    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }

    for (let idx = 0; idx < result.fleet_routes.length; idx++) {
      const route = result.fleet_routes[idx];
      const vehicleColor = COLORS[idx % COLORS.length];
      await simulateSingleRoute(route, vehicleColor);
      await new Promise((r) => setTimeout(r, 600));
    }

    setGpsStatus("🎉 All delivery partners finished their routes!");
    if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
  };

  return (
    <React.Fragment>
      <div id="sidebar">
        {/* Creator Profile Header with Professional Links */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
          <img 
            src="https://github.com/Pradyumna152335.png" 
            alt="Pradyumna Tripathi" 
            style={{ width: "48px", height: "48px", borderRadius: "50%", border: "2px solid #0284c7", objectFit: "cover" }} 
            onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=Pradyumna+Tripathi&background=0284c7&color=fff"; }}
          />
          <div>
            <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "#0f172a" }}>Pradyumna Tripathi</div>
            <div style={{ fontSize: "0.75rem", color: "#0284c7", marginBottom: "4px" }}>Software Engineer</div>
            <div style={{ display: "flex", gap: "10px", fontSize: "0.72rem", fontWeight: "600" }}>
              <a href="https://www.linkedin.com/in/pradyumnatripathi/" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", textDecoration: "none" }}>LinkedIn</a>
              <span style={{ color: "#cbd5e1" }}>•</span>
              <a href="https://github.com/Pradyumna152335" target="_blank" rel="noopener noreferrer" style={{ color: "#0f172a", textDecoration: "none" }}>GitHub</a>
              <span style={{ color: "#cbd5e1" }}>•</span>
              <a href="https://leetcode.com/u/tripathi152335/" target="_blank" rel="noopener noreferrer" style={{ color: "#d97706", textDecoration: "none" }}>LeetCode</a>
              <span style={{ color: "#cbd5e1" }}>•</span>
              <a href="https://drive.google.com/file/d/1n6fUsj56iwUAkDF5QzIgpTlJ4RZVmDbj/view?usp=sharing" target="_blank" rel="noopener noreferrer" style={{ color: "#dc2626", textDecoration: "none" }}>Resume</a>
            </div>
          </div>
        </div>

        <h1>ChakravyuhBreaker</h1>
        <div className="subtitle">AI Logistics & Route Optimization Command Center</div>

        <div className="section-title">How to Use</div>
        <div className="instruction-box">
          🖱️ <b>Click anywhere on the map</b> to add custom delivery stops dynamically.<br/>
          ⚙️ Run optimizer and manage parcel weights below.
        </div>

        <button className="btn btn-primary" onClick={optimizeRoutes}>
          ⚡ Run Route Optimizer (CVRP + 2-Opt)
        </button>

        <button className="btn btn-ws" onClick={startSequentialSimulation} disabled={!result}>
          📡 Watch Sequential Fleet Simulation
        </button>

        <button className="btn btn-secondary" onClick={() => setShowModal(true)}>
          🔍 Explain CVRP + 2-Opt Algorithm
        </button>

        <button className="btn btn-secondary" onClick={requestGpsPermission}>
          📍 Grant Live Browser GPS Permission
        </button>

        <button className="btn btn-secondary" onClick={handleReset}>
          🔄 Reset to Default Stops
        </button>

        {/* Spacious, Scrollable Parcel Weight Customizer with Custom Steppers */}
        <div className="section-title" style={{ marginTop: "20px" }}>Parcel Weights & Stops ({stops.length})</div>
        <div className="card" style={{ maxHeight: "420px", minHeight: "280px", overflowY: "auto", padding: "18px" }}>
          {stops.map((stop, idx) => (
            <div key={stop.id} className="stat-row" style={{ alignItems: "center", marginBottom: "16px", borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: "14px" }}>
              <div>
                <div style={{ fontWeight: "700", fontSize: "0.85rem", color: "#0284c7" }}>{stop.id}</div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "4px" }}>Lat/Lng: {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <button className="weight-btn" onClick={() => adjustWeight(idx, -0.5)} title="Decrease weight">-</button>
                <input 
                  type="number" 
                  className="input-field" 
                  value={stop.demand_weight} 
                  onChange={(e) => updateStopWeight(idx, e.target.value)} 
                  step="0.5" 
                  min="0.1" 
                  max="50"
                  style={{ width: "65px", padding: "8px 6px", fontSize: "0.9rem", textAlign: "center" }}
                />
                <button className="weight-btn" onClick={() => adjustWeight(idx, 0.5)} title="Increase weight">+</button>
                <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: "600", marginLeft: "2px" }}>kg</span>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginTop: "12px" }}>
          <div className="stat-row" style={{ margin: "4px 0" }}>
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
          <div className="stat-row" style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: "8px", marginTop: "8px" }}>
            <span className="stat-label">Live GPS Status:</span>
            <span className="stat-value" style={{ color: "#16a34a", fontSize: "0.8rem" }}>{gpsStatus}</span>
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
                  <b style={{ color: "#0f172a" }}>{r.vehicle_id}</b>
                  <span style={{ color: COLORS[idx % COLORS.length], fontWeight: "600" }}>{r.total_distance_km} km</span>
                </div>
                <div className="stat-row" style={{ fontSize: "0.78rem", color: "#64748b" }}>
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

      {/* Algorithm Explanation Modal */}
      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(8px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#ffffff", border: "1px solid rgba(2, 132, 199, 0.3)", borderRadius: "16px", width: "100%", maxWidth: "650px", maxHeight: "85vh", overflowY: "auto", padding: "28px", boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: "12px" }}>
              <h2 style={{ fontSize: "1.25rem", color: "#0284c7", fontWeight: "800" }}>🧠 How CVRP + 2-Opt Works</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(0,0,0,0.05)", border: "none", color: "#334155", width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ fontSize: "0.88rem", lineHeight: "1.6", color: "#334155" }}>
              <p style={{ marginBottom: "12px" }}>
                The <b style={{ color: "#0284c7" }}>ChakravyuhBreaker</b> routing engine combines two robust optimization techniques to solve complex multi-vehicle delivery challenges efficiently:
              </p>

              <div style={{ background: "rgba(241, 245, 249, 0.8)", borderLeft: "4px solid #0284c7", padding: "12px 14px", borderRadius: "0 8px 8px 0", marginBottom: "12px" }}>
                <b style={{ color: "#0f172a" }}>1. CVRP (Capacitated Vehicle Routing Problem):</b>
                <p style={{ marginTop: "4px", fontSize: "0.83rem", color: "#64748b" }}>
                  CVRP ensures that no delivery vehicle exceeds its maximum weight payload limit (e.g., 15 kg). The engine greedily assigns customer orders to available bikes based on spatial proximity while strictly validating total weight constraints per tour.
                </p>
              </div>

              <div style={{ background: "rgba(241, 245, 249, 0.8)", borderLeft: "4px solid #10b981", padding: "12px 14px", borderRadius: "0 8px 8px 0", marginBottom: "16px" }}>
                <b style={{ color: "#0f172a" }}>2. 2-Opt Local Search Heuristic:</b>
                <p style={{ marginTop: "4px", fontSize: "0.83rem", color: "#64748b" }}>
                  Once initial routes are clustered, the 2-Opt algorithm iteratively scans each vehicle's path. If two route edges cross each other (creating inefficient detours), it uncrosses them by reversing the segment order, completely eliminating self-intersections and minimizing total travel distance.
                </p>
              </div>

              <div style={{ fontSize: "0.82rem", color: "#0284c7", background: "rgba(2, 132, 199, 0.08)", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(2, 132, 199, 0.2)" }}>
                ⚡ <b>Bonus Performance Feature:</b> Results are indexed using spatial QuadTrees and cached with Redis lookup logic to guarantee lightning-fast response times.
              </div>
            </div>

            <button onClick={() => setShowModal(false)} className="btn btn-primary" style={{ marginTop: "20px" }}>
              Got It, Close Guide
            </button>
          </div>
        </div>
      )}

      <div id="map-container"><div id="map"></div></div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);