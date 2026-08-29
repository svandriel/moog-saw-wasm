# Rust Port of the Moog Saw DSP Core — Design

Date: 2026-08-29
Status: Approved

## Motivation

Replace the C11 implementation of the Pekonen 2011 phase-distortion Moog
sawtooth oscillator with a pure-Rust core. The C sources, Emscripten wrapper,
Makefile, and C test harness are removed once the Rust port is proven against
golden fixtures. The end goal remains an npm/AudioWorklet package, with WASM
later — this phase ships a native Rust crate built for WASM from day one.

## Goal / Success Criteria

- A single root-level crate named `moog_saw` whose public API is idiomatic
  Rust and whose DSP semantics are bit-identical to the reference C code.
- Golden float32 WAV fixtures committed to the repo, generated from the C
  implementation, against which the Rust port is verified (TDD: fixtures
  first, implementation second).
- The four C numeric tests ported to Rust (parameter fit, phase progression,
  fractional sync, explicit event) and passing.
- C code, Makefile, and Emscripten artifacts removed from the tree.
- `cargo test` is the single verification command.
- A GitHub Actions workflow runs `cargo test` + `cargo build --release` on
  push to `main` and on pull requests.

## Architecture

Single crate at repo root: `moog_saw`, `crate-type = ["rlib"]`,
with no external runtime dependencies (source-only `libm` for float
math — see below). (cdylib is deliberately deferred
to the WASM phase as a separate thin wrapper crate: combining `crate-type
= ["cdylib", "rlib"]` with `#![no_std]` makes `cargo test` fail on stable
Rust — rust-lang/rust#151083 — and the reference pattern for Rust audio
worklets keeps the DSP core as a host-tested rlib.)

File layout after the port:

```
Cargo.toml
src/lib.rs       # MoogSaw struct + free functions (pure DSP, no_std-clean)
src/ffi.rs       # #[no_mangle] extern "C" exports for future WASM/AudioWorklet
tests/           # integration tests (WAV fixture parity + numeric)
tests/fixtures/  # committed golden float32 WAV files
.github/workflows/ci.yml
AGENTS.md
README.md
.gitignore
```

`lib.rs` must stay `#![no_std]`-clean: float math via the pure-Rust `libm`
crate (`libm::floor`, `libm::cos`); everything else (`is_finite`, casts,
constants, comparisons) via `core`. Rationale: stable Rust 1.98 removed
`f64::floor`/`f32::cos`/`sqrt` from `core` (they now live in `std` only;
the `core` re-addition is nightly-only `core_float_math`, tracking issue
#137578). `libm` is wasm-portable, and its `cos`/`floor` are bit-identical to
glibc on the fixture output range (verified over a 1.2M-point sweep at f32
granularity). Integration tests may use `std`.

Rust edition: latest stable (2024 edition). Toolchain: stable rustc/cargo;
no pinned MSRV.

## Behavioral Contract (port 1:1 from C)

All numbers are the exact constants and arithmetic from
`src/moog_saw.c` / `include/moog_saw.h`:

### `p(frequency_hz) -> f32`

- Non-finite input returns `0.9924`.
- `p = 0.9924 - 0.00002151 * frequency_hz`, clamped to `[0, 1]`.

### `waveform(phase: f64, p_: f32) -> f32`

- Wraps `phase` into `[0, 1)` via `phase - floor(phase)`.
- Clamps `p` to `[1e-7, 1 - 1e-7]`.
- `pd_amplitude = PI - 2*PI*p` (f64 constants).
- Two-branch phase distortion on `phase < p` vs `>= p`.
- Result: `-cos(2*PI*phase + phi_mod)` cast to `f32`.

### Phase accumulator

- `phase_increment(f0, sample_rate)` returns `0.0` when frequency or sample
  rate is non-finite or `<= 0`; otherwise `f0 / sample_rate` (f64).
- `MoogSaw` state: `phase: f64`, `sample_rate: f64`, `frequency_hz: f32`,
  `previous_sync: f32`.
- Default frequency `440.0`; `new(sample_rate)` returns `None` when sample
  rate is non-finite or `<= 0` (mirrors NULL from C's `create`).

### Hard sync (block renderer)

- Rising zero crossing when `previous_sync <= 0` and `sync[i] > 0`.
- Zero crossing linearly interpolated; clamp `u` to `[0, 1]`.
- Phase reset to `wrap( (1-u) * inc )` at the event, then advanced to the
  current sample as in C.

### Two process paths

- `process(&mut self, frequency: Option<&[f32]>, sync: Option<&[f32]>,
  output: &mut [f32])` — block renderer; slices must be the same length as
  `output`. `frequency == None` → constant frequency; `sync == None`
  → free-running. Invalid `freq`/`sync` values behave exactly like C.
- `process_sample(&mut self, frequency_hz, sync_event: bool,
  event_offset_samples: f64) -> f32` — explicit-event path. `event_offset`
  clamped to `[0, 1]`, phase reset to `wrap((1 - event_offset) * inc)` when
  `sync_event` is true, output sample returned after rendering.

### Other API

- `reset(phase)` sets phase (wrapped) and `previous_sync = 0`.
- `set_frequency(f32)`; `phase() -> f64` returns current phase.
- No panics on valid usage; slice length mismatch between inputs/output is a
  documented caller contract (C read past the end; Rust does not — behavior
  divergence is acceptable and safer here, and does not affect correctness
  tests which use equal lengths).

## TDD / Fixtures Strategy

Fixtures-first ordering:

1. Patch `tests/generate_wav.c` to write **float32 mono 48 kHz WAV** files
   (0.25 s duration = 12000 samples), one per frequency in
   `{55, 110, 220, 440, 880, 1760, 3520}` Hz, into `build/wav/`.
   Float32 WAV means **no rounding at all** on the C side, so the committed
   fixtures carry the exact f32 output of the reference implementation.
2. Generate the fixtures, copy to `tests/fixtures/moog_saw_{f}Hz.wav`
   (≈48 KB each), and commit them.
3. Write the Rust tests first (red):
   - **Fixture parity**: read each WAV, run the Rust oscillator over the same
     samples (constant frequency, no sync), compare against the fixture
     samples with zero tolerance (bit-exact), because the arithmetic is
     identical. Must assert per-sample inequality count is zero.
   - **Numeric units** (ported): parameter fit, phase progression
     (`4 * 480/48000` phase after four samples), fractional sync
     (`1.5 * 480/48000`), explicit event (`1.75 * 480/48000`).
4. Implement `lib.rs` + `ffi.rs` until green.
5. Remove the C implementation and Makefile.

WAV file format for fixtures: standard RIFF/WAVE, `fmt ` chunk (16-byte,
PCM=3 for IEEE float), mono, 48000 Hz, float32. The test harness includes a
minimal WAV reader; no third-party crate is used.

## GitHub Actions CI

`.github/workflows/ci.yml`: one workflow, Ubuntu latest, on
`push: [main]` and `pull_request:`.

- `actions/checkout@v4`
- `dtolnay/rust-toolchain@stable`
- `cargo test`
- `cargo build --release`

No Homebrew dependency on CI; GitHub-hosted rustup provides the toolchain.
No WASM target built in this phase (covered next phase).

## Cleanup After Green

Delete/remove from the tree:

- `src/moog_saw.c`, `src/moog_saw_wasm.c`, `include/`
- `tests/test_moog_saw.c`, `tests/generate_wav.c`
- `Makefile`, `build/`, `dist/`
- `tests` C-related fixtures are replaced by the committed golden WAVs.

Update:

- `AGENTS.md` to the Rust reality (commands, layout, conventions).
- `README.md` to the Rust implementation.
- `.gitignore`: keep `.worktrees/`, add `/target`; drop `build/` if removed.

Verification post-cleanup: `cargo test` and `cargo build` pass; `git status`
shows a clean tree.

## Non-Goals (this phase)

- AudioWorklet processor / browser wrapper (next phase).
- `wasm32-unknown-unknown` build artifact (next phase; core is already
  no_std-clean so the target addition is trivial).
- npm packaging.
- PolyBLEP/BLAMP anti-aliasing beyond the existing model.