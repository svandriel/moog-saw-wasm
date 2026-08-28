#include "moog_saw.h"

#include <math.h>
#include <stdlib.h>

#define MOOG_SAW_PI      3.141592653589793238462643383279502884
#define MOOG_SAW_TWO_PI  (2.0 * MOOG_SAW_PI)

struct MoogSaw {
    double phase;
    double sample_rate;
    float frequency_hz;
    float previous_sync;
};

static double wrap_phase(double phase)
{
    phase -= floor(phase);
    if (phase >= 1.0) {
        phase = 0.0;
    } else if (phase < 0.0) {
        phase += 1.0;
    }
    return phase;
}

static double phase_increment(float frequency_hz, double sample_rate)
{
    if (!isfinite((double)frequency_hz) || frequency_hz <= 0.0f ||
        !isfinite(sample_rate) || sample_rate <= 0.0) {
        return 0.0;
    }
    return (double)frequency_hz / sample_rate;
}

float moog_saw_p(float frequency_hz)
{
    /* Pekonen et al., equation (6). */
    if (!isfinite((double)frequency_hz)) {
        return 0.9924f;
    }

    float p = 0.9924f - 0.00002151f * frequency_hz;
    if (p < 0.0f) p = 0.0f;
    if (p > 1.0f) p = 1.0f;
    return p;
}

float moog_saw_waveform(double phase, float p)
{
    phase = wrap_phase(phase);

    /* The fitted operating range has 0 < P < 1. */
    if (p <= 0.0f) {
        p = 1.0e-7f;
    } else if (p >= 1.0f) {
        p = 1.0f - 1.0e-7f;
    }

    const double pd_amplitude = MOOG_SAW_PI - MOOG_SAW_TWO_PI * (double)p;
    double phi_mod;

    if (phase < (double)p) {
        phi_mod = pd_amplitude * phase / (double)p;
    } else {
        phi_mod = pd_amplitude * (1.0 - phase) / (1.0 - (double)p);
    }

    /* Equation (4). */
    return (float)(-cos(MOOG_SAW_TWO_PI * phase + phi_mod));
}

MoogSaw *moog_saw_create(double sample_rate)
{
    if (!isfinite(sample_rate) || sample_rate <= 0.0) {
        return NULL;
    }

    MoogSaw *osc = (MoogSaw *)calloc(1, sizeof(*osc));
    if (!osc) {
        return NULL;
    }

    osc->sample_rate = sample_rate;
    osc->phase = 0.0;
    osc->frequency_hz = 440.0f;
    osc->previous_sync = 0.0f;
    return osc;
}

void moog_saw_destroy(MoogSaw *osc)
{
    free(osc);
}

void moog_saw_reset(MoogSaw *osc, double phase)
{
    if (!osc) return;
    osc->phase = wrap_phase(phase);
    osc->previous_sync = 0.0f;
}

void moog_saw_set_frequency(MoogSaw *osc, float frequency_hz)
{
    if (!osc) return;
    osc->frequency_hz = frequency_hz;
}

double moog_saw_phase(const MoogSaw *osc)
{
    return osc ? osc->phase : 0.0;
}

void moog_saw_process(
    MoogSaw *osc,
    const float *frequency,
    const float *sync,
    float *output,
    uint32_t frames)
{
    if (!osc || !output || frames == 0) return;

    double phase = osc->phase;
    float prev_sync = osc->previous_sync;

    for (uint32_t i = 0; i < frames; ++i) {
        const float f = frequency ? frequency[i] : osc->frequency_hz;
        const double inc = phase_increment(f, osc->sample_rate);

        if (sync) {
            const float current_sync = sync[i];

            if (prev_sync <= 0.0f && current_sync > 0.0f) {
                /* Linear interpolation of the zero crossing. */
                const double delta = (double)current_sync - (double)prev_sync;
                double u = delta != 0.0 ? -(double)prev_sync / delta : 0.0;
                if (u < 0.0) u = 0.0;
                if (u > 1.0) u = 1.0;

                /*
                 * u is the fraction from sample i-1 to i. The sync event is
                 * therefore (1-u) samples before the current sample.
                 * Reset at the event, then advance to the current sample.
                 */
                const double samples_after_sync = 1.0 - u;
                phase = wrap_phase(samples_after_sync * inc);
            }

            prev_sync = current_sync;
        }

        output[i] = moog_saw_waveform(phase, moog_saw_p(f));
        phase = wrap_phase(phase + inc);
    }

    osc->phase = phase;
    osc->previous_sync = prev_sync;
}

void moog_saw_process_sample(
    MoogSaw *osc,
    float frequency_hz,
    int sync_event,
    double event_offset_samples,
    float *output)
{
    if (!osc || !output) return;

    const double inc = phase_increment(frequency_hz, osc->sample_rate);

    if (sync_event) {
        if (!isfinite(event_offset_samples)) event_offset_samples = 0.0;
        if (event_offset_samples < 0.0) event_offset_samples = 0.0;
        if (event_offset_samples > 1.0) event_offset_samples = 1.0;

        const double samples_after_sync = 1.0 - event_offset_samples;
        osc->phase = wrap_phase(samples_after_sync * inc);
    }

    *output = moog_saw_waveform(osc->phase, moog_saw_p(frequency_hz));
    osc->phase = wrap_phase(osc->phase + inc);
}
