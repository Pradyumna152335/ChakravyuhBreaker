from dataclasses import dataclass
from typing import List, Optional


@dataclass
class TimeWindow:
    """
    Represents a delivery time window in minutes from midnight.
    Example: 10:00 AM to 10:30 AM -> start_min=600, end_min=630
    """
    order_id: str
    start_min: int
    end_min: int

    def __post_init__(self):
        if self.start_min > self.end_min:
            raise ValueError("start_min cannot be greater than end_min")

    def overlaps(self, other: "TimeWindow") -> bool:
        """Two time windows overlap if one starts before the other ends."""
        return self.start_min < other.end_min and other.start_min < self.end_min


class IntervalNode:
    """A single node inside the Interval Tree."""
    def __init__(self, window: TimeWindow):
        self.window: TimeWindow = window
        self.max_end: int = window.end_min
        self.left: Optional["IntervalNode"] = None
        self.right: Optional["IntervalNode"] = None


class IntervalTree:
    """
    Augmented Binary Search Tree for O(log N) delivery time-window
    conflict detection and schedule validation.
    """
    def __init__(self):
        self.root: Optional[IntervalNode] = None

    def insert(self, window: TimeWindow) -> None:
        """Insert a new delivery time window into the tree."""
        self.root = self._insert(self.root, window)

    def _insert(self, node: Optional[IntervalNode], window: TimeWindow) -> IntervalNode:
        if node is None:
            return IntervalNode(window)

        # Standard BST ordering by start time
        if window.start_min < node.window.start_min:
            node.left = self._insert(node.left, window)
        else:
            node.right = self._insert(node.right, window)

        # Update the maximum end time in this subtree
        if node.max_end < window.end_min:
            node.max_end = window.end_min

        return node

    def find_conflicts(self, query: TimeWindow) -> List[TimeWindow]:
        """Return all scheduled time windows that overlap with the query window."""
        conflicts: List[TimeWindow] = []
        self._search_conflicts(self.root, query, conflicts)
        return conflicts

    def has_conflict(self, query: TimeWindow) -> bool:
        """Quick boolean check if a proposed delivery slot clashes with existing slots."""
        return len(self.find_conflicts(query)) > 0

    def _search_conflicts(
        self,
        node: Optional[IntervalNode],
        query: TimeWindow,
        conflicts: List[TimeWindow]
    ) -> None:
        if node is None:
            return

        # If current node overlaps with query, record the conflict
        if node.window.overlaps(query):
            conflicts.append(node.window)

        # If left child exists and its latest end time exceeds query's start time,
        # an overlap could exist in the left subtree.
        if node.left is not None and node.left.max_end > query.start_min:
            self._search_conflicts(node.left, query, conflicts)

        # Only search right subtree if current node starts before the query ends
        if node.right is not None and node.window.start_min < query.end_min:
            self._search_conflicts(node.right, query, conflicts)
