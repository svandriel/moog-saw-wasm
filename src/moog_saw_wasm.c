#include "moog_saw.h"

#ifdef __cplusplus
extern "C" {
#endif

MoogSaw *moog_saw_wasm_create(double sample_rate)
{
    return moog_saw_create(sample_rate);
}

void moog_saw_wasm_destroy(MoogSaw *osc)
{
    moog_saw_destroy(osc);
}

void moog_saw_wasm_reset(MoogSaw *osc, double phase)
{
    moog_saw_reset(osc, phase);
}

void moog_saw_wasm_set_frequency(MoogSaw *osc, float frequency_hz)
{
    moog_saw_set_frequency(osc, frequency_hz);
}

void moog_saw_wasm_process(
    MoogSaw *osc,
    const float *frequency,
    const float *sync,
    float *output,
    uint32_t frames)
{
    moog_saw_process(osc, frequency, sync, output, frames);
}

#ifdef __cplusplus
}
#endif
