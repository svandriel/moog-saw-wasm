# Pekonen Moog Saw — C / WASM reference implementation

Reference implementation of the waveform-based phase-distortion model from:

J. Pekonen, V. Lazzarini, J. Timoney, J. Kleimola, and V. Välimäki,
“Discrete-Time Modelling of the Moog Sawtooth Oscillator Waveform”, 2011.

The paper presents two real-time models and reports the phase-distortion model as
one of the best matches to the recorded Moog sawtooth waveform.

## Included

- Pure C DSP implementation.
- Frequency-dependent `P` using the paper's linear fit.
- Persistent phase accumulator.
- Audio-rate frequency buffer.
- Audio-rate sync input.
- Rising-zero-crossing hard sync.
- Fractional-sample interpolation of sync events.
- An explicit-event single-sample API for oscillators that already know exact
  master phase-wrap timing.
- Minimal Emscripten/WASM wrapper.
- Native smoke tests.

## Build native

```sh
cc -std=c11 -O2 -Wall -Wextra -Wpedantic \
  -Iinclude src/moog_saw.c tests/test_moog_saw.c \
  -lm -o test_moog_saw
./test_moog_saw
```

## Build with Emscripten

```sh
emcc -O3 -std=c11 \
  -Iinclude \
  src/moog_saw.c src/moog_saw_wasm.c \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORTED_FUNCTIONS='["_moog_saw_wasm_create","_moog_saw_wasm_destroy","_moog_saw_wasm_reset","_moog_saw_wasm_set_frequency","_moog_saw_wasm_process","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPF32"]' \
  -o moog_saw.js
```

The AudioWorklet integration should allocate WASM buffers once, outside the render
callback, and reuse them for every render quantum.

## Sync semantics

`sync[n]` is a continuous signal. A sync event is detected when:

```text
sync[n-1] <= 0 && sync[n] > 0
```

The zero crossing is linearly interpolated. The oscillator is conceptually reset
to phase 0 at that interpolated time, and the phase at the current output sample
is advanced by the fractional elapsed time.

For a master oscillator running in the same DSP engine, prefer
`moog_saw_process_sample()` or an equivalent internal event path so exact phase-wrap
timing can be supplied without reconstructing it from audio samples.

## Scope / limitations

This is a faithful waveform-model implementation, not a complete anti-aliased
oscillator system. In particular, hard-sync creates abrupt phase resets and can
require additional anti-alias treatment for high-frequency operation. Oversampling,
BLEP/BLAMP-style correction, and a browser-level AudioWorklet wrapper are deliberate
follow-on layers rather than hidden inside this core C API.
