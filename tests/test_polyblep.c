#include "polyblep.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>

static void test_zero_outside_transition(void)
{
    const double dt = 0.01;

    assert(polyblep(0.25, dt) == 0.0f);
    assert(polyblep(0.50, dt) == 0.0f);
    assert(polyblep(0.75, dt) == 0.0f);
}

static void test_start_and_end_corrections(void)
{
    const double dt = 0.1;

    /* At the exact wrap, the unit correction is -1. */
    assert(fabsf(polyblep(0.0, dt) + 1.0f) < 1e-6f);

    /* At the other edge of the correction, it approaches zero. */
    assert(fabsf(polyblep(dt, dt)) < 1e-6f);
    assert(fabsf(polyblep(1.0 - dt, dt)) < 1e-6f);

    /* Just before wrap, the correction approaches +1. */
    assert(fabsf(polyblep(1.0 - 1e-12, dt) - 1.0f) < 1e-5f);
}

static void test_symmetry(void)
{
    const double dt = 0.125;
    const double t = 0.03;

    assert(fabsf(polyblep(t, dt) + polyblep(1.0 - t, dt)) < 1e-6f);
}

static void test_invalid_inputs(void)
{
    assert(polyblep(0.5, 0.0) == 0.0f);
    assert(polyblep(0.5, -0.1) == 0.0f);
    assert(polyblep(0.5, 1.0) == 0.0f);
    assert(polyblep(NAN, 0.1) == 0.0f);
    assert(polyblep(0.5, NAN) == 0.0f);
}

static void test_saw_correction(void)
{
    const double dt = 0.01;

    /*
     * A bipolar saw has a downward step of 2. At phase zero the naive value
     * is -1 and the polyBLEP correction adds +1, producing the continuous
     * limiting value +0.0.
     */
    const float corrected = polyblep_saw(0.0, dt, 2.0f);
    assert(fabsf(corrected) < 1e-6f);

    /* Away from the discontinuity, the result is exactly the naive saw. */
    const double phase = 0.5;
    const float expected = (float)(2.0 * phase - 1.0);
    assert(fabsf(polyblep_saw(phase, dt, 2.0f) - expected) < 1e-6f);
}

int main(void)
{
    test_zero_outside_transition();
    test_start_and_end_corrections();
    test_symmetry();
    test_invalid_inputs();
    test_saw_correction();

    puts("all polyBLEP tests passed");
    return 0;
}
