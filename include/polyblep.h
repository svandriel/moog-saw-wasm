#ifndef POLYBLEP_H
#define POLYBLEP_H

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Standard two-sided polyBLEP correction for a discontinuity at phase 0.
 *
 * t  : normalized phase in [0, 1)
 * dt : normalized phase increment per sample
 *
 * For a downward unit step, subtract the returned correction from the
 * naive waveform. The function is zero away from the transition.
 */
float polyblep(double t, double dt);

/*
 * Apply a polyBLEP correction to a bipolar sawtooth whose naive value is
 * 2*t - 1. `step` is the magnitude of the downward discontinuity at phase
 * wrap; for a bipolar saw this is 2.
 */
float polyblep_saw(double phase, double phase_increment, float step);

#ifdef __cplusplus
}
#endif

#endif
