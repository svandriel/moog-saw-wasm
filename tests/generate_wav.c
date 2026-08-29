#include "moog_saw.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define SAMPLE_RATE 48000
#define DURATION_SECONDS 5
#define NUM_SAMPLES (SAMPLE_RATE * DURATION_SECONDS)

static void write_u16_le(FILE *file, uint16_t value)
{
    fputc((int)(value & 0xffu), file);
    fputc((int)((value >> 8) & 0xffu), file);
}

static void write_u32_le(FILE *file, uint32_t value)
{
    fputc((int)(value & 0xffu), file);
    fputc((int)((value >> 8) & 0xffu), file);
    fputc((int)((value >> 16) & 0xffu), file);
    fputc((int)((value >> 24) & 0xffu), file);
}

static int write_wav(const char *path, float frequency)
{
    FILE *file = fopen(path, "wb");
    if (!file) {
        perror(path);
        return 0;
    }

    const uint32_t data_size = NUM_SAMPLES * sizeof(int16_t);
    const uint32_t riff_size = 36u + data_size;

    /* RIFF/WAVE header: mono, 48 kHz, signed 16-bit PCM. */
    fwrite("RIFF", 1, 4, file);
    write_u32_le(file, riff_size);
    fwrite("WAVE", 1, 4, file);
    fwrite("fmt ", 1, 4, file);
    write_u32_le(file, 16);
    write_u16_le(file, 1);
    write_u16_le(file, 1);
    write_u32_le(file, SAMPLE_RATE);
    write_u32_le(file, SAMPLE_RATE * sizeof(int16_t));
    write_u16_le(file, sizeof(int16_t));
    write_u16_le(file, 16);
    fwrite("data", 1, 4, file);
    write_u32_le(file, data_size);

    MoogSaw *osc = moog_saw_create(SAMPLE_RATE);
    if (!osc) {
        fclose(file);
        fprintf(stderr, "failed to create oscillator\n");
        return 0;
    }

    moog_saw_set_frequency(osc, frequency);

    float buffer[1024];
    int remaining = NUM_SAMPLES;
    while (remaining > 0) {
        const int count = remaining < (int)(sizeof(buffer) / sizeof(buffer[0]))
            ? remaining
            : (int)(sizeof(buffer) / sizeof(buffer[0]));

        moog_saw_process(osc, NULL, NULL, buffer, count);

        for (int i = 0; i < count; ++i) {
            if (!isfinite(buffer[i])) {
                fprintf(stderr, "non-finite sample at %d Hz, sample %d\n",
                        (int)frequency, NUM_SAMPLES - remaining + i);
                moog_saw_destroy(osc);
                fclose(file);
                return 0;
            }

            float sample = buffer[i];
            if (sample > 1.0f) sample = 1.0f;
            if (sample < -1.0f) sample = -1.0f;

            const int16_t pcm = (int16_t)lrintf(sample * 32767.0f);
            write_u16_le(file, (uint16_t)pcm);
        }

        remaining -= count;
    }

    moog_saw_destroy(osc);

    if (fclose(file) != 0) {
        perror(path);
        return 0;
    }

    return 1;
}

int main(void)
{
    static const float frequencies[] = {
        55.0f,
        110.0f,
        220.0f,
        440.0f,
        880.0f,
        1760.0f,
        3520.0f
    };

    for (size_t i = 0; i < sizeof(frequencies) / sizeof(frequencies[0]); ++i) {
        char path[128];
        snprintf(path, sizeof(path), "build/wav/moog_saw_%gHz.wav", frequencies[i]);
        printf("writing %s\n", path);
        if (!write_wav(path, frequencies[i])) return EXIT_FAILURE;
    }

    puts("WAV rendering passed");
    return EXIT_SUCCESS;
}
