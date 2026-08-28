#ifndef POLYBLEP_H
#define POLYBLEP_H

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Return the standard two-sided polyBLEP correction for a discontinuity.
 *
 * t  : normalized phase in [0, 1)
 * dt : normalized phase increment per sample
 *
 * The returned value is the correction that should be added to a naive
 * waveform containing a unit downward step at phase 0/1.
 */
float polyblep(double t, double dt);

/*
 * Apply a polyBLEP correction to a normalized sawtooth whose naive value is
 * 2*t - 1 and whose discontinuity at phase wrap has amplitude `step`.
 */
float polyblep_saw(double phase, double phase_increment, float step);

#ifdef __cplusplus
}
#endif

#endif
