"""
Per-node sliding window of recent telemetry readings.

Keeps the last N readings per node in memory so the LLM analyzer can reason
about *trends* (e.g. "voltage dropping ~0.02V per reading") rather than a
single snapshot.
"""

from collections import defaultdict, deque
from typing import Dict, List

from schema import TelemetryReading


class TelemetryBuffer:
    def __init__(self, window_size: int = 12):
        """window_size=12 at a 5s telemetry interval ~= 60s of history per node."""
        self.window_size = window_size
        self._nodes: Dict[str, deque] = defaultdict(lambda: deque(maxlen=self.window_size))

    def add(self, reading: TelemetryReading) -> None:
        self._nodes[reading.node_id].append(reading)

    def node_ids(self) -> List[str]:
        return list(self._nodes.keys())

    def snapshot(self) -> Dict[str, List[dict]]:
        """Return {node_id: [reading dicts oldest->newest]} for every known node."""
        return {
            node_id: [r.model_dump() for r in readings]
            for node_id, readings in self._nodes.items()
            if readings
        }

    def reading_count(self) -> int:
        return sum(len(d) for d in self._nodes.values())
