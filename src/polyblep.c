#include "polyblep.h"

#include <math.h>

float polyblep(double t, double dt)
{
    if (!(dt > 0.0) || !isfinite(dt) || !isfinite(t)) {
        return 0.0f;
    }

    /* PolyBLEP is meaningful while the transition spans at most one sample. */
    if (dt >= 1.0) {
        return 0.0f;
    }

    if (t < dt) {
        const double x = t / dt;
        return (float)(x + x - x * x - 1.0);
    }

    if (t > 1.0 - dt) {
        const double x = (t - 1.0) / dt;
        return (float)(x * x + x + x + 1.0);
    }

    return 0.0f;
}

float polyblep_saw(double phase, double phase_increment, float step)
{
    /*
     * A naive bipolar saw is 2*phase - 1. Its wrap is a downward step of
     * amplitude 2. The correction is scaled by half the actual discontinuity
     * so callers can also use this helper for differently scaled saws.
     */
    phase -= floor(phase);

    const float naive = (float)(2.0 * phase - 1.0);
    const float correction = polyblep(phase, phase_increment);
    return naive + step * correction;
}
