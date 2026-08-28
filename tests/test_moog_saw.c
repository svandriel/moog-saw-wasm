#include "moog_saw.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>

static void test_parameter_fit(void)
{
    const float expected = 0.9924f - 0.00002151f * 440.0f;
    assert(fabsf(moog_saw_p(440.0f) - expected) < 1e-6f);
}

static void test_progression(void)
{
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    moog_saw_set_frequency(osc, 480.0f);

    float out[4];
    moog_saw_process(osc, NULL, NULL, out, 4);

    for (int i = 0; i < 4; ++i) assert(isfinite(out[i]));

    const double expected_phase = 4.0 * 480.0 / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected_phase) < 1e-12);
    moog_saw_destroy(osc);
}

static void test_fractional_sync(void)
{
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    moog_saw_reset(osc, 0.37);

    const float sync[] = {-1.0f, 1.0f};
    const float freq[] = {480.0f, 480.0f};
    float out[2];

    moog_saw_process(osc, freq, sync, out, 2);

    /*
     * Event is half-way between samples 0 and 1. At sample 1, 0.5 sample has
     * elapsed since reset; after rendering sample 1, another one sample has
     * elapsed, hence final phase is 1.5 * increment.
     */
    const double expected = 1.5 * 480.0 / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected) < 1e-12);
    moog_saw_destroy(osc);
}

static void test_explicit_event(void)
{
    MoogSaw *osc = moog_saw_create(48000.0);
    assert(osc);

    float out;
    moog_saw_process_sample(osc, 480.0f, 1, 0.25, &out);

    /* 0.75 sample elapsed since the event, then one sample was rendered. */
    const double expected = 1.75 * 480.0 / 48000.0;
    assert(fabs(moog_saw_phase(osc) - expected) < 1e-12);
    assert(isfinite(out));
    moog_saw_destroy(osc);
}

int main(void)
{
    test_parameter_fit();
    test_progression();
    test_fractional_sync();
    test_explicit_event();
    puts("all tests passed");
    return 0;
}
