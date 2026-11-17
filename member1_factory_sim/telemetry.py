"""Structured telemetry log - the hand-off point for Member 2's predictive maintenance.

One row = one machine sampled at one moment. Columns:

    time              simulated minutes
    machine           CNC_A, CNC_B, Assembly, QC, Packaging
    status            IDLE / PROCESSING / BLOCKED at that moment
    processing_time   duration (min) of the machine's most recent finished job
    vibration         mm/s RMS - only the Assembly machine has a sensor (others: None)
    completed_count   total finished products in the whole factory at that moment
"""
import csv
from dataclasses import dataclass, asdict, fields


@dataclass
class TelemetryRecord:
    time: float
    machine: str
    status: str
    processing_time: float
    vibration: float            # None when the machine has no vibration sensor
    completed_count: int


class TelemetryLog:
    def __init__(self):
        self.records = []

    def add(self, **kwargs):
        self.records.append(TelemetryRecord(**kwargs))

    def to_dicts(self, machine=None):
        """Plain list of dicts (easy to turn into a pandas DataFrame or JSON later)."""
        return [asdict(r) for r in self.records if machine is None or r.machine == machine]

    def write_csv(self, path):
        names = [f.name for f in fields(TelemetryRecord)]
        with open(path, "w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=names)
            writer.writeheader()
            writer.writerows(self.to_dicts())
