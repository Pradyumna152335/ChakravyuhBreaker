from backend.app.algorithms.quadtree import DeliveryPoint, BoundingBox, QuadTree


def test_quadtree_insertion_and_range_query():
    # Create a map box covering central Delhi/NCR (Center: 28.6, 77.2, Span: +/- 1.0 degree)
    city_boundary = BoundingBox(center_lat=28.6, center_lng=77.2, half_lat=1.0, half_lng=1.0)
    qt = QuadTree(boundary=city_boundary, capacity=2)

    # Add 4 closely packed stops in Zone A (around 28.61, 77.21) and 1 far away stop in Zone B
    points = [
        DeliveryPoint(id="ORD-1", lat=28.61, lng=77.21),
        DeliveryPoint(id="ORD-2", lat=28.62, lng=77.22),
        DeliveryPoint(id="ORD-3", lat=28.63, lng=77.23),
        DeliveryPoint(id="ORD-4", lat=28.60, lng=77.20),
        DeliveryPoint(id="ORD-FAR", lat=28.05, lng=76.50),
    ]

    for p in points:
        assert qt.insert(p) is True

    # Because capacity is 2 and we inserted 5 points, the tree must have subdivided automatically
    assert qt.divided is True

    # Search only around Zone A (28.61, 77.21 with small radius 0.05)
    neighborhood_box = BoundingBox(center_lat=28.61, center_lng=77.21, half_lat=0.05, half_lng=0.05)
    nearby_orders = qt.query_range(neighborhood_box)

    nearby_ids = {p.id for p in nearby_orders}
    assert len(nearby_ids) == 4
    assert "ORD-FAR" not in nearby_ids
