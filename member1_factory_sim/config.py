"""All tunable settings for the factory simulation (normal operation only)."""
from dataclasses import dataclass


@dataclass
class FactoryConfig:
    # --- run settings ---
    sim_duration: float = 480.0      # simulated minutes (one 8-hour shift)
    status_interval: float = 60.0    # print a status report every N sim-minutes
    seed: int = 42                   # random seed -> reproducible runs

    # --- scenario: "normal" (healthy machines) or "wear" (Assembly slowly wears) ---
    scenario: str = "normal"

    # --- mechanical wear (only used when scenario == "wear"; see wear.py for units) ---
    wear_machine: str = "Assembly"        # the only machine that wears
    wear_final_degradation: float = 0.125  # +12.5 % processing time at wear_reference_time
    wear_reference_time: float = 480.0     # minutes at which full degradation is reached

    # --- vibration sensor on the wear machine (mm/s RMS; healthy in BOTH scenarios) ---
    vibration_baseline: float = 2.0        # healthy reading, mm/s
    vibration_wear_gain: float = 0.6       # +60 % at wear_reference_time (-> ~3.2 mm/s)
    vibration_noise_std: float = 0.03      # sensor noise, mm/s (clipped at +/-3 sigma)

    # --- telemetry recording ---
    telemetry_interval: float = 5.0        # minutes between telemetry samples

    # --- raw material feed ---
    feed_interval_mean: float = 1.5  # average minutes between new raw items

    # --- mean processing time per product (minutes) ---
    cnc_time_mean: float = 4.0       # each CNC machine (A and B)
    assembly_time_mean: float = 2.5
    qc_time_mean: float = 1.5
    packaging_time_mean: float = 1.2
    time_variation: float = 0.10     # std-dev as a fraction of the mean

    # --- buffer capacities (max products waiting) ---
    raw_buffer_cap: int = 20         # raw feed  -> CNC_A / CNC_B
    cnc_buffer_cap: int = 10         # CNC       -> Assembly
    assembly_buffer_cap: int = 10    # Assembly  -> Quality Control
    qc_buffer_cap: int = 10          # QC        -> Packaging
