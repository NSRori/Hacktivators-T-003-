"""Core SimPy model: products, machines, buffers and the factory itself."""
from dataclasses import dataclass, field

import numpy as np
import simpy

from config import FactoryConfig
from telemetry import TelemetryLog
from wear import WearModel

IDLE = "IDLE"              # waiting for a product to arrive
PROCESSING = "PROCESSING"  # working on a product
BLOCKED = "BLOCKED"        # finished, but the next buffer is full


@dataclass
class Product:
    id: int
    created_at: float
    finished_at: float = None
    history: list = field(default_factory=list)  # (stage name, time it left stage)


class Machine:
    """A workstation: takes from in_buffer, works, puts into out_buffer
    (or just counts the product as complete if out_buffer is None)."""

    def __init__(self, env, name, in_buffer, out_buffer, time_mean, factory):
        self.env = env
        self.name = name
        self.in_buffer = in_buffer
        self.out_buffer = out_buffer
        self.time_mean = time_mean
        self.factory = factory
        self.status = IDLE
        self.processed = 0
        self.busy_time = 0.0         # minutes spent on COMPLETED jobs
        self.process_start = None    # start time of the job in progress (None if none)
        self.last_process_time = 0.0
        self.wear = None             # set to a WearModel to make this machine slow down over time
        self.job_log = []            # (finish time, duration) of every finished job
        env.process(self.run())

    def run(self):
        f = self.factory
        while True:
            self.status = IDLE
            product = yield self.in_buffer.get()

            self.status = PROCESSING
            self.process_start = self.env.now
            duration = f.sample_time(self.time_mean)   # same random draw as before
            if self.wear is not None:                  # silent wear: just a slower job
                duration *= self.wear.time_multiplier(self.env.now)
            yield self.env.timeout(duration)
            self.process_start = None
            self.busy_time += duration
            self.last_process_time = duration
            self.job_log.append((self.env.now, duration))
            self.processed += 1
            product.history.append((self.name, self.env.now))

            if self.out_buffer is None:          # last stage
                product.finished_at = self.env.now
                f.completed.append(product)
            else:
                self.status = BLOCKED            # only stays blocked if buffer is full
                yield self.out_buffer.put(product)

    def total_busy_time(self):
        """Completed jobs plus the elapsed part of the job in progress."""
        extra = self.env.now - self.process_start if self.process_start is not None else 0.0
        return self.busy_time + extra

    def utilization(self):
        now = self.env.now
        return self.total_busy_time() / now if now > 0 else 0.0


class Factory:
    def __init__(self, env: simpy.Environment, cfg: FactoryConfig):
        self.env = env
        self.cfg = cfg
        self.rng = np.random.default_rng(cfg.seed)
        self.completed = []
        self.raw_released = 0

        # WIP buffers (simpy Stores hold Product objects)
        self.buffers = {
            "raw":     simpy.Store(env, capacity=cfg.raw_buffer_cap),
            "cnc_out": simpy.Store(env, capacity=cfg.cnc_buffer_cap),
            "asm_out": simpy.Store(env, capacity=cfg.assembly_buffer_cap),
            "qc_out":  simpy.Store(env, capacity=cfg.qc_buffer_cap),
        }
        b = self.buffers
        self.machines = [
            Machine(env, "CNC_A",     b["raw"],     b["cnc_out"], cfg.cnc_time_mean, self),
            Machine(env, "CNC_B",     b["raw"],     b["cnc_out"], cfg.cnc_time_mean, self),
            Machine(env, "Assembly",  b["cnc_out"], b["asm_out"], cfg.assembly_time_mean, self),
            Machine(env, "QC",        b["asm_out"], b["qc_out"],  cfg.qc_time_mean, self),
            Machine(env, "Packaging", b["qc_out"],  None,         cfg.packaging_time_mean, self),
        ]

        # Vibration sensor on the wear machine (always present). It only makes
        # the machine slower when the scenario is "wear".
        wear_on = cfg.scenario == "wear"
        self.wear = WearModel(cfg, wear_enabled=wear_on)
        self.telemetry = TelemetryLog()
        if wear_on:
            for m in self.machines:
                if m.name == cfg.wear_machine:
                    m.wear = self.wear

        env.process(self.raw_material_feed())
        env.process(self.status_reporter())
        env.process(self.telemetry_sampler())

    def sample_time(self, mean):
        """Random processing time: normal around the mean, never below 10% of it."""
        t = self.rng.normal(mean, mean * self.cfg.time_variation)
        return max(t, mean * 0.1)

    def raw_material_feed(self):
        """Releases a new raw product at random intervals."""
        while True:
            gap = self.rng.exponential(self.cfg.feed_interval_mean)
            yield self.env.timeout(gap)
            self.raw_released += 1
            product = Product(self.raw_released, self.env.now)
            yield self.buffers["raw"].put(product)   # waits here if raw buffer is full

    # ---------- telemetry (read-only: never changes the simulation) ----------
    def record_telemetry(self):
        """Append one row per machine describing the factory right now."""
        for m in self.machines:
            has_sensor = m.name == self.cfg.wear_machine
            self.telemetry.add(
                time=round(self.env.now, 3),
                machine=m.name,
                status=m.status,
                processing_time=round(m.last_process_time, 3),
                vibration=round(self.wear.vibration(self.env.now), 4) if has_sensor else None,
                completed_count=len(self.completed),
            )

    def telemetry_sampler(self):
        while True:
            self.record_telemetry()
            yield self.env.timeout(self.cfg.telemetry_interval)

    # ---------- reporting ----------
    def snapshot(self):
        """Current state as a plain dict (handy for later modules)."""
        return {
            "time": self.env.now,
            "raw_released": self.raw_released,
            "completed": len(self.completed),
            "buffers": {k: len(v.items) for k, v in self.buffers.items()},
            "machines": {
                m.name: {"status": m.status, "processed": m.processed,
                         "busy_time": round(m.total_busy_time(), 2),
                         "utilization": round(m.utilization(), 3),
                         "last_process_time": round(m.last_process_time, 2)}
                for m in self.machines
            },
        }

    def status_reporter(self):
        while True:
            yield self.env.timeout(self.cfg.status_interval)
            self.print_status()

    def print_status(self):
        s = self.snapshot()
        caps = {"raw": self.cfg.raw_buffer_cap, "cnc_out": self.cfg.cnc_buffer_cap,
                "asm_out": self.cfg.assembly_buffer_cap, "qc_out": self.cfg.qc_buffer_cap}
        print(f"\n=== t = {s['time']:7.1f} min | raw released: {s['raw_released']} "
              f"| COMPLETED: {s['completed']} ===")
        print(f"  {'Machine':<10}{'Status':<12}{'Done':>5}{'Busy(min)':>11}{'Util':>7}{'LastTime':>10}")
        for name, m in s["machines"].items():
            print(f"  {name:<10}{m['status']:<12}{m['processed']:>5}{m['busy_time']:>11.1f}"
                  f"{m['utilization'] * 100:>6.0f}%{m['last_process_time']:>10.2f}")
        print("  Buffers: " + " | ".join(f"{k} {v}/{caps[k]}" for k, v in s["buffers"].items()))
        if self.cfg.scenario == "wear":      # extra line only in the wear scenario
            t = s["time"]
            print(f"  {self.cfg.wear_machine} wear: progress {self.wear.progress(t) * 100:.0f}% "
                  f"| time x{self.wear.time_multiplier(t):.3f} "
                  f"| vibration {self.wear.vibration(t):.2f} mm/s")
