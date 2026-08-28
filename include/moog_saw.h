#ifndef MOOG_SAW_H
#define MOOG_SAW_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct MoogSaw MoogSaw;

MoogSaw *moog_saw_create(double sample_rate);
void moog_saw_destroy(MoogSaw *osc);
void moog_saw_reset(MoogSaw *osc, double phase);
void moog_saw_set_frequency(MoogSaw *osc, float frequency_hz);

double moog_saw_phase(const MoogSaw *osc);

/* Pekonen et al. linear fit for P(f0). */
float moog_saw_p(float frequency_hz);

/* Evaluate the phase-distortion waveform at normalized phase [0,1). */
float moog_saw_waveform(double phase, float p);

/*
 * Block renderer.
 *
 * frequency == NULL: use the constant frequency set on the oscillator.
 * sync == NULL: free-running oscillator.
 * sync != NULL: a rising zero crossing (prev <= 0, current > 0) triggers
 * hard sync. The zero crossing is linearly interpolated in time.
 *
 * The output is normalized to approximately [-1, +1].
 */
void moog_saw_process(
    MoogSaw *osc,
    const float *frequency,
    const float *sync,
    float *output,
    uint32_t frames);

/*
 * Process one sample with an explicitly supplied sync event.
 * event_offset_samples is the time from the current sample back to the
 * sync event, in [0,1]. 0 means the event occurs at the current sample;
 * 1 means it occurs at the previous-sample boundary.
 */
void moog_saw_process_sample(
    MoogSaw *osc,
    float frequency_hz,
    int sync_event,
    double event_offset_samples,
    float *output);

#ifdef __cplusplus
}
#endif

#endif
