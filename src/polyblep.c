#include "polyblep.h"

#include <math.h>

float polyblep(double t, double dt)
{
    if (!(dt > 0.0) || !isfinite(dt) || !isfinite(t)) {
        return 0.0f;
    }

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
    phase -= floor(phase);

    const float naive = (float)(2.0 * phase - 1.0);

    /*
     * polyblep() is the correction for a unit downward step when SUBTRACTED
     * from the naive waveform. Scale by half the requested discontinuity,
     * because a bipolar saw has a step magnitude of 2.
     */
    const float correction = polyblep(phase, phase_increment);
    return naive - 0.5f * step * correction;
}
