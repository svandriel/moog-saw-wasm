# Pekonen Moog Saw: C / WASM implementation

This repository implements the waveform-based phase-distortion model from:

J. Pekonen, V. Lazzarini, J. Timoney, J. Kleimola, and V. Välimäki,
"Discrete-Time Modelling of the Moog Sawtooth Oscillator Waveform", 2011.

The paper compares two real-time models. It reports that the phase-distortion
model closely matches the recorded Moog sawtooth waveform.

## Included

- Pure C DSP code.
- Frequency-dependent `P` from the paper's linear fit.
- A persistent phase accumulator.
- Audio-rate frequency and sync inputs.
- Hard sync on rising zero crossings.
- Fractional-sample interpolation for sync events.
- An explicit-event single-sample API for oscillators that know the exact
  master phase-wrap time.
- A small Emscripten/WASM wrapper.
- Native smoke tests.

## AudioWorklet use

For AudioWorklet use, allocate the WASM buffers once outside the render callback.
Reuse them for every render quantum.

## Sync semantics

`sync[n]` is a continuous signal. A sync event is detected when:

```text
sync[n-1] <= 0 && sync[n] > 0
```

The zero crossing is linearly interpolated. The oscillator is conceptually reset
to phase 0 at that interpolated time, and the phase at the current output sample
is advanced by the fractional elapsed time.

If a master oscillator runs in the same DSP engine, use
`moog_saw_process_sample()` or an equivalent internal event path. This lets the
caller pass the exact phase-wrap time instead of estimating it from audio samples.

## Scope / limitations

This code models the waveform. It is not a complete anti-aliased oscillator.
Hard sync creates abrupt phase resets, so high-frequency use may need more
anti-aliasing. Oversampling, BLEP/BLAMP correction, and a browser-level
AudioWorklet wrapper belong outside this core C API.
