# Pekonen Moog Saw

A pure `#![no_std]` Rust oscillator using the waveform-based phase-distortion
model from:

J. Pekonen, V. Lazzarini, J. Timoney, J. Kleimola, and V. Välimäki,
"Discrete-Time Modelling of the Moog Sawtooth Oscillator Waveform", 2011.[^paper]

[^paper]: https://www.researchgate.net/publication/220057893_Discrete-Time_Modelling_of_the_Moog_Sawtooth_Oscillator_Waveform

## Building

Rust (stable, edition 2024), zero runtime dependencies.
Float math uses the pure-Rust `libm` crate.

```sh
cargo build
cargo test
```

The core is `#![no_std]`-clean, so it compiles for `wasm32-unknown-unknown`
for web/AudioWorklet use. The WASM cdylib lives in a thin wrapper crate (stable
`cargo test` doesn't mix with a `cdylib` + `no_std` crate).

## API

- `MoogSaw::new(sample_rate) -> Option<MoogSaw>` creates the oscillator, default
  440 Hz.
- `set_frequency(hz)`, `reset(phase)`, and `phase()` control and inspect state.
- `process(frequency, sync, output)` renders a block. `frequency` and `sync`
  are optional audio-rate slices; a rising zero crossing of `sync` triggers
  hard sync, linearly interpolated in time.
- `process_sample(frequency_hz, sync_event, event_offset_samples) -> f32`
  renders a single sample for oscillators that know the exact master phase-wrap
  time.
- `p(frequency_hz)` and `waveform(phase, p)` expose the Pekonen linear fit and
  the phase-distortion waveform.

DSP runs in normalized phase units `[0,1)`; output is approximately `[-1,+1]`.

## Testing

`cargo test` runs:

- numeric tests for the parameter fit, phase progression, fractional sync, and
  explicit event, and
- bit-exact parity checks against golden WAV fixtures (`tests/fixtures/`,
  float32 mono 48 kHz, frequencies 55–3520 Hz).

## Scope / limitations

This models the waveform, not a complete anti-aliased oscillator. Oversampling,
BLEP/BLAMP correction, and the browser-level AudioWorklet wrapper are expected
to live outside this core API.
