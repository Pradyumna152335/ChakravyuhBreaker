from backend.app.algorithms.interval_tree import TimeWindow, IntervalTree


def test_interval_tree_conflict_detection():
    tree = IntervalTree()

    # Existing driver schedule:
    # ORD-1: 09:00 - 09:30 (540 - 570)
    # ORD-2: 10:00 - 10:45 (600 - 645)
    # ORD-3: 11:30 - 12:00 (690 - 720)
    tree.insert(TimeWindow(order_id="ORD-2", start_min=600, end_min=645))
    tree.insert(TimeWindow(order_id="ORD-1", start_min=540, end_min=570))
    tree.insert(TimeWindow(order_id="ORD-3", start_min=690, end_min=720))

    # Case 1: New order from 10:30 to 11:00 (630 - 660) -> Clashes with ORD-2!
    overlapping_order = TimeWindow(order_id="ORD-NEW-1", start_min=630, end_min=660)
    assert tree.has_conflict(overlapping_order) is True
    conflicts = tree.find_conflicts(overlapping_order)
    assert len(conflicts) == 1
    assert conflicts[0].order_id == "ORD-2"

    # Case 2: New order from 09:30 to 10:00 (570 - 600) -> Fits right between ORD-1 and ORD-2!
    clean_order = TimeWindow(order_id="ORD-NEW-2", start_min=570, end_min=600)
    assert tree.has_conflict(clean_order) is False
