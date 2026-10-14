import math
import heapq
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional


@dataclass
class LocationNode:
    """Represents a road intersection, warehouse (depot), or delivery stop."""
    id: str
    lat: float
    lng: float
    demand_weight: float = 0.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculates the real-world straight-line distance (in km) between two GPS
    coordinates on Earth. Used as the A* compass heuristic.
    """
    R = 6371.0  # Earth radius in kilometers
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


class RoadGraph:
    """
    Weighted Directed Graph modeling an urban road network with dynamic traffic weights.
    """
    def __init__(self):
        self.nodes: Dict[str, LocationNode] = {}
        # adjacency[from_id] = list of (to_id, base_distance_km, traffic_multiplier)
        self.adjacency: Dict[str, List[Tuple[str, float, float]]] = {}

    def add_node(self, node: LocationNode) -> None:
        self.nodes[node.id] = node
        if node.id not in self.adjacency:
            self.adjacency[node.id] = []

    def add_edge(
        self,
        from_id: str,
        to_id: str,
        distance_km: Optional[float] = None,
        traffic_multiplier: float = 1.0,
        bidirectional: bool = True
    ) -> None:
        """Connect two locations with a road and an optional traffic jam multiplier."""
        if distance_km is None:
            n1, n2 = self.nodes[from_id], self.nodes[to_id]
            distance_km = haversine_km(n1.lat, n1.lng, n2.lat, n2.lng)

        self.adjacency[from_id].append((to_id, distance_km, traffic_multiplier))
        if bidirectional:
            self.adjacency[to_id].append((from_id, distance_km, traffic_multiplier))

    def a_star_search(self, start_id: str, goal_id: str) -> Tuple[List[str], float]:
        """
        Finds the lowest-cost path from start_id to goal_id using A* Search and a Min-Heap.
        Returns (list_of_node_ids, total_weighted_cost).
        """
        if start_id not in self.nodes or goal_id not in self.nodes:
            return [], float("inf")

        goal_node = self.nodes[goal_id]

        # Min-Heap stores tuples of: (estimated_total_cost_f, current_cost_g, current_node_id)
        open_heap: List[Tuple[float, float, str]] = [(0.0, 0.0, start_id)]
        came_from: Dict[str, Optional[str]] = {start_id: None}
        g_score: Dict[str, float] = {start_id: 0.0}

        while open_heap:
            _, current_g, current_id = heapq.heappop(open_heap)

            if current_id == goal_id:
                # Reconstruct the winning street-by-street path
                path: List[str] = []
                curr: Optional[str] = goal_id
                while curr is not None:
                    path.append(curr)
                    curr = came_from[curr]
                path.reverse()
                return path, round(current_g, 4)

            if current_g > g_score.get(current_id, float("inf")):
                continue

            for neighbor_id, base_dist, traffic_mult in self.adjacency.get(current_id, []):
                edge_cost = base_dist * traffic_mult
                tentative_g = current_g + edge_cost

                if tentative_g < g_score.get(neighbor_id, float("inf")):
                    came_from[neighbor_id] = current_id
                    g_score[neighbor_id] = tentative_g
                    neighbor_node = self.nodes[neighbor_id]
                    # Heuristic h(n): straight-line distance to goal
                    h_score = haversine_km(
                        neighbor_node.lat, neighbor_node.lng,
                        goal_node.lat, goal_node.lng
                    )
                    f_score = tentative_g + h_score
                    heapq.heappush(open_heap, (f_score, tentative_g, neighbor_id))

        return [], float("inf")


def calculate_route_distance(route: List[LocationNode]) -> float:
    """Calculates total distance (km) of a sequence of stops."""
    if len(route) < 2:
        return 0.0
    total = 0.0
    for i in range(len(route) - 1):
        total += haversine_km(route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng)
    return round(total, 4)


def two_opt_optimize(route: List[LocationNode]) -> Tuple[List[LocationNode], float]:
    """
    2-Opt Local Search Heuristic: Iteratively untangles crisscrossing paths
    in a multi-stop tour to minimize total travel distance.
    Assumes route starts and ends at the warehouse (depot).
    """
    if len(route) <= 3:
        return route, calculate_route_distance(route)

    best_route = list(route)
    best_distance = calculate_route_distance(best_route)
    improved = True

    while improved:
        improved = False
        # Keep index 0 (start depot) and last index (end depot) fixed
        for i in range(1, len(best_route) - 2):
            for k in range(i + 1, len(best_route) - 1):
                # Reverse the sub-segment between i and k
                candidate_route = (
                    best_route[:i]
                    + best_route[i : k + 1][::-1]
                    + best_route[k + 1 :]
                )
                candidate_distance = calculate_route_distance(candidate_route)
                if candidate_distance < best_distance - 1e-6:
                    best_route = candidate_route
                    best_distance = candidate_distance
                    improved = True

    return best_route, best_distance


def solve_cvrp(
    depot: LocationNode,
    stops: List[LocationNode],
    vehicle_capacity: float
) -> List[Dict]:
    """
    Solves the Capacitated Vehicle Routing Problem (CVRP):
    1. Groups stops into vehicle batches without exceeding vehicle_capacity.
    2. Applies 2-Opt optimization on each vehicle's tour.
    """
    unassigned = list(stops)
    fleet_routes: List[Dict] = []
    vehicle_num = 1

    while unassigned:
        current_load = 0.0
        vehicle_stops: List[LocationNode] = []
        current_pos = depot

        # Greedily pick nearest unassigned stop that fits in the vehicle
        while unassigned:
            fitting_stops = [
                s for s in unassigned if current_load + s.demand_weight <= vehicle_capacity
            ]
            if not fitting_stops:
                break

            nearest_stop = min(
                fitting_stops,
                key=lambda s: haversine_km(current_pos.lat, current_pos.lng, s.lat, s.lng)
            )
            vehicle_stops.append(nearest_stop)
            current_load += nearest_stop.demand_weight
            current_pos = nearest_stop
            unassigned.remove(nearest_stop)

        # Form complete round-trip tour: Depot -> Stops -> Depot
        initial_tour = [depot] + vehicle_stops + [depot]
        optimized_tour, optimized_dist = two_opt_optimize(initial_tour)

        fleet_routes.append({
            "vehicle_id": f"VH-{vehicle_num}",
            "total_load": round(current_load, 2),
            "capacity": vehicle_capacity,
            "total_distance_km": optimized_dist,
            "stop_ids": [node.id for node in optimized_tour],
            "coordinates": [{"id": n.id, "lat": n.lat, "lng": n.lng} for n in optimized_tour],
        })
        vehicle_num += 1

    return fleet_routes
