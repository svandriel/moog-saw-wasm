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

## Web build

The repo is a Cargo workspace with three parts:

- `moog_saw`: the `#![no_std]` DSP core.
- `moog_saw_wasm`: a `cdylib` that exports the core over the C ABI and
  compiles to `wasm32-unknown-unknown`.
- `web/`: a pnpm + Vite TypeScript app with a demo synth and an installable
  `moog-saw` NPM package built from `web/src/lib/`.

Run the demo:

```sh
cd web
pnpm install
pnpm run dev
```

The wasm build needs the rustup toolchain. On a machine where the stable
toolchain is not on PATH, prepend its `bin` directory, for example:

```sh
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
```

The demo runs the DSP in an AudioWorklet. The main thread fetches the compiled
wasm bytes and posts them to the processor, which instantiates the module and
calls into the exported functions to render audio on the audio thread.

The publishable deliverable is the `moog-saw` NPM package under
`web/dist-lib`, built with `pnpm run lib`.

## Scope / limitations

This models the waveform, not a complete anti-aliased oscillator. Oversampling
and BLEP/BLAMP correction remain out of scope for the DSP core.
