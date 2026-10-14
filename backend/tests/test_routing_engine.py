from backend.app.algorithms.routing_engine import (
    LocationNode,
    RoadGraph,
    calculate_route_distance,
    two_opt_optimize,
    solve_cvrp,
)


def test_a_star_avoids_congested_road():
    graph = RoadGraph()
    graph.add_node(LocationNode("HUB", 28.60, 77.20))
    graph.add_node(LocationNode("MID_FAST", 28.62, 77.22))
    graph.add_node(LocationNode("DEST", 28.65, 77.25))

    # Direct road is short (5 km) but has a massive traffic jam (5x multiplier = cost 25)
    graph.add_edge("HUB", "DEST", distance_km=5.0, traffic_multiplier=5.0)

    # Detour through MID_FAST is slightly longer (4 km + 4 km = 8 km) but clear traffic (1x = cost 8)
    graph.add_edge("HUB", "MID_FAST", distance_km=4.0, traffic_multiplier=1.0)
    graph.add_edge("MID_FAST", "DEST", distance_km=4.0, traffic_multiplier=1.0)

    path, cost = graph.a_star_search("HUB", "DEST")
    assert path == ["HUB", "MID_FAST", "DEST"]
    assert cost == 8.0


def test_two_opt_untangles_crossed_route():
    depot = LocationNode("DEPOT", 28.60, 77.20)
    s1 = LocationNode("S1", 28.60, 77.30)
    s2 = LocationNode("S2", 28.70, 77.20)
    s3 = LocationNode("S3", 28.70, 77.30)

    # Deliberately tangled X-shaped tour: DEPOT -> S3 (diagonal) -> S1 -> S2 (diagonal) -> DEPOT
    tangled_tour = [depot, s3, s1, s2, depot]
    tangled_dist = calculate_route_distance(tangled_tour)

    optimized_tour, optimized_dist = two_opt_optimize(tangled_tour)
    assert optimized_dist < tangled_dist


def test_cvrp_respects_vehicle_capacity():
    depot = LocationNode("DEPOT", 28.60, 77.20)
    stops = [
        LocationNode("ORD-1", 28.61, 77.21, demand_weight=6.0),
        LocationNode("ORD-2", 28.62, 77.22, demand_weight=6.0),
        LocationNode("ORD-3", 28.65, 77.25, demand_weight=6.0),
    ]

    # Total weight is 18 kg, each bike holds max 12 kg -> Must dispatch 2 vehicles
    routes = solve_cvrp(depot, stops, vehicle_capacity=12.0)
    assert len(routes) == 2
    assert routes[0]["total_load"] <= 12.0
    assert routes[1]["total_load"] <= 12.0
