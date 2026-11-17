"""Entry point.

    python main.py                                  # normal operation
    python main.py --scenario wear                  # Assembly slowly wears
    python main.py --scenario wear --duration 480 --interval 30 --seed 7
    python main.py --scenario wear --telemetry-csv wear_telemetry.csv
"""
import argparse

import simpy

from config import FactoryConfig
from factory import Factory


def main():
    d = FactoryConfig()
    p = argparse.ArgumentParser(description="BeyondFactoryFloor - basic factory simulation")
    p.add_argument("--scenario", choices=["normal", "wear"], default=d.scenario,
                   help="normal = healthy machines, wear = gradual Assembly wear")
    p.add_argument("--duration", type=float, default=d.sim_duration, help="simulated minutes")
    p.add_argument("--interval", type=float, default=d.status_interval, help="minutes between status reports")
    p.add_argument("--seed", type=int, default=d.seed, help="random seed")
    p.add_argument("--wear-degradation", type=float, default=d.wear_final_degradation,
                   help="wear scenario: fractional slowdown at 480 min (0.125 = +12.5%%)")
    p.add_argument("--telemetry-csv", default=None, help="optional path to save the telemetry log as CSV")
    a = p.parse_args()

    cfg = FactoryConfig(sim_duration=a.duration, status_interval=a.interval, seed=a.seed,
                        scenario=a.scenario, wear_final_degradation=a.wear_degradation)
    env = simpy.Environment()
    factory = Factory(env, cfg)

    if cfg.scenario == "wear":
        print(f"Scenario: WEAR ({cfg.wear_machine} slows by {cfg.wear_final_degradation * 100:.1f}% "
              f"per {cfg.wear_reference_time:.0f} min; vibration in mm/s RMS)")
    print(f"Starting factory simulation for {cfg.sim_duration} simulated minutes...")
    env.run(until=cfg.sim_duration)
    factory.record_telemetry()          # final telemetry row at the end time

    print("\n" + "#" * 60)
    print("FINAL SUMMARY")
    factory.print_status()
    n = len(factory.completed)
    if n:
        avg = sum(x.finished_at - x.created_at for x in factory.completed) / n
        print(f"\nTotal completed: {n} | Throughput: {n / cfg.sim_duration * 60:.1f}/hour "
              f"| Avg time in factory: {avg:.1f} min")

    if a.telemetry_csv:
        factory.telemetry.write_csv(a.telemetry_csv)
        print(f"Telemetry saved: {a.telemetry_csv} ({len(factory.telemetry.records)} rows)")


if __name__ == "__main__":
    main()
