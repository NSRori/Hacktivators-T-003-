"""Silent mechanical wear + vibration sensor model for ONE machine (Assembly).

ASSUMPTIONS / UNITS (all illustrative, tune them in config.py)
--------------------------------------------------------------
* Time is in simulated minutes.
* wear progress  p(t) = t / wear_reference_time  (0 = brand new, 1 = end of the
  reference 480-minute shift). It is NOT capped, so a longer run keeps wearing.
* Processing time is multiplied by   1 + wear_final_degradation * p(t)
  e.g. 0.125 -> 12.5 % slower at t = 480 min.  The machine never stops; it only
  gets slower ("silent" wear).
* Vibration is a velocity RMS reading in mm/s (the unit used by ISO 10816-style
  machine health guidelines):
      vibration(t) = baseline * (1 + vibration_wear_gain * p(t)) + noise
  baseline 2.0 mm/s, gain 0.6 -> about 3.2 mm/s at t = 480 min.
* noise is small, bounded Gaussian (clipped at +/-3 sigma), so readings never
  jump to extreme values.
* The noise is a pure function of (seed, time): the same seed and the same time
  always give the same reading, no matter how often or in what order you read it.
  It also uses its own generator, so reading vibration NEVER changes the
  production random numbers (normal results stay identical).
"""
import numpy as np

# Keeps the vibration noise stream separate from the production stream.
_NOISE_STREAM_ID = 1000


class WearModel:
    def __init__(self, cfg, wear_enabled):
        self.cfg = cfg
        self.wear_enabled = wear_enabled   # False -> healthy machine (normal scenario)

    def progress(self, t):
        """0 at t=0, 1 at wear_reference_time. Always 0 when wear is disabled."""
        if not self.wear_enabled:
            return 0.0
        return t / self.cfg.wear_reference_time

    def time_multiplier(self, t):
        """Factor applied to the processing time of a job that starts at time t."""
        return 1.0 + self.cfg.wear_final_degradation * self.progress(t)

    def vibration(self, t):
        """Simulated vibration reading in mm/s at time t."""
        c = self.cfg
        trend = c.vibration_baseline * (1.0 + c.vibration_wear_gain * self.progress(t))
        # Deterministic noise: seed the generator from (seed, stream id, time in ms).
        rng = np.random.default_rng([c.seed, _NOISE_STREAM_ID, int(round(t * 1000))])
        noise = float(np.clip(rng.normal(0.0, c.vibration_noise_std),
                              -3 * c.vibration_noise_std, 3 * c.vibration_noise_std))
        return trend + noise
