from dataclasses import dataclass, field
from typing import List, Optional, Any


@dataclass
class DeliveryPoint:
    """Represents a single customer delivery location on the map."""
    id: str
    lat: float          # Latitude (Y-axis)
    lng: float          # Longitude (X-axis)
    demand_weight: float = 1.0
    metadata: Any = None


@dataclass
class BoundingBox:
    """Represents a rectangular area on the map using center coordinates and half-dimensions."""
    center_lat: float
    center_lng: float
    half_lat: float
    half_lng: float

    def contains(self, point: DeliveryPoint) -> bool:
        """Check if a delivery point falls inside this map box."""
        return (
            (self.center_lat - self.half_lat <= point.lat <= self.center_lat + self.half_lat) and
            (self.center_lng - self.half_lng <= point.lng <= self.center_lng + self.half_lng)
        )

    def intersects(self, other: "BoundingBox") -> bool:
        """Check if another search box overlaps with this map box."""
        return not (
            other.center_lng - other.half_lng > self.center_lng + self.half_lng or
            other.center_lng + other.half_lng < self.center_lng - self.half_lng or
            other.center_lat - other.half_lat > self.center_lat + self.half_lat or
            other.center_lat + other.half_lat < self.center_lat - self.half_lat
        )


class QuadTree:
    """
    2D Spatial Index (QuadTree) for clustering delivery stops and executing
    fast O(log N) neighborhood range queries.
    """
    def __init__(self, boundary: BoundingBox, capacity: int = 4):
        self.boundary = boundary
        self.capacity = capacity
        self.points: List[DeliveryPoint] = []
        self.divided: bool = False

        # The 4 sub-quadrants (created only when this box gets full)
        self.nw: Optional[QuadTree] = None
        self.ne: Optional[QuadTree] = None
        self.sw: Optional[QuadTree] = None
        self.se: Optional[QuadTree] = None

    def subdivide(self) -> None:
        """Slice the current map box into 4 equal smaller quadrants."""
        c_lat, c_lng = self.boundary.center_lat, self.boundary.center_lng
        h_lat, h_lng = self.boundary.half_lat / 2.0, self.boundary.half_lng / 2.0

        self.nw = QuadTree(BoundingBox(c_lat + h_lat, c_lng - h_lng, h_lat, h_lng), self.capacity)
        self.ne = QuadTree(BoundingBox(c_lat + h_lat, c_lng + h_lng, h_lat, h_lng), self.capacity)
        self.sw = QuadTree(BoundingBox(c_lat - h_lat, c_lng - h_lng, h_lat, h_lng), self.capacity)
        self.se = QuadTree(BoundingBox(c_lat - h_lat, c_lng + h_lng, h_lat, h_lng), self.capacity)
        self.divided = True

    def insert(self, point: DeliveryPoint) -> bool:
        """Insert a delivery stop into the spatial tree."""
        if not self.boundary.contains(point):
            return False

        if len(self.points) < self.capacity:
            self.points.append(point)
            return True

        if not self.divided:
            self.subdivide()

        return (
            self.nw.insert(point) or
            self.ne.insert(point) or
            self.sw.insert(point) or
            self.se.insert(point)
        )

    def query_range(self, search_box: BoundingBox) -> List[DeliveryPoint]:
        """Find all delivery stops inside a specific map region in O(log N) time."""
        found: List[DeliveryPoint] = []

        if not self.boundary.intersects(search_box):
            return found

        for p in self.points:
            if search_box.contains(p):
                found.append(p)

        if self.divided:
            found.extend(self.nw.query_range(search_box))
            found.extend(self.ne.query_range(search_box))
            found.extend(self.sw.query_range(search_box))
            found.extend(self.se.query_range(search_box))

        return found
