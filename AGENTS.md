# AGENTS.md

Guidance for AI agents working in this repo.

## All changes go through pull requests

- Never push to `main` directly. Every change — code, docs, config — lands on
  `main` only via a pull request.
- Work happens on a feature branch (in a dedicated worktree), is pushed to
  `origin`, then merged through a PR.
- Keep PRs small and focused; one logical change per PR.
- Committing and pushing is not deferred until the work is done: design specs
  and implementation plans are committed and pushed to `origin` right away, so
  the branch state on the remote always reflects current progress.

## Always use a git worktree

- Never work directly on the main checkout. Create a dedicated git worktree
  for every piece of work (see `git worktree` / the existing `.worktrees/`
  directory).
- Before starting any session, update the worktree first: `git fetch --all`
  then `git pull --ff-only` (or rebase) so you're never working from stale
  state.

## Project

Pure-Rust implementation of the Pekonen 2011 phase-distortion model of the
Moog sawtooth oscillator. The core (`src/lib.rs`) is `#![no_std]`-clean and has
zero runtime dependencies, so it builds for `wasm32-unknown-unknown` for a
future AudioWorklet/npm package. `src/ffi.rs` holds the C-ABI exports.
(Float math uses the pure-Rust `libm` crate — stable `core` has no
`floor`/`cos`; the `core_float_math` re-addition is nightly-only.)

## Commands

- `cargo build` — build the crate (rlib)
- `cargo test` — numeric unit/integration tests + golden WAV fixture parity

## File layout

- `src/lib.rs` — DSP core (`MoogSaw`, `p`, `waveform`)
- `src/ffi.rs` — C-ABI exports for future WASM
- `tests/dsp.rs` — ported numeric tests (parameter fit, progression, fractional
  sync, explicit event)
- `tests/fixture_parity.rs` — bit-exact parity vs. golden WAV fixtures
- `tests/wav.rs` — minimal float32 WAV reader helper
- `tests/fixtures/*.wav` — committed golden outputs (float32, mono, 48 kHz,
  0.25 s, frequencies 55–3520 Hz)

## Conventions

- `#![no_std]`; zero external runtime dependencies; float math via
  `libm::{floor, cos}`, everything else via `core`.
- DSP in normalized phase units `[0,1)`; output normalized to approximately
  `[-1,+1]`.
- Golden fixtures are the reference: keep DSP arithmetic bit-identical. If
  arithmetic intentionally changes, regenerate fixtures and commit them
  together.
- Add behavior as pure Rust plus tests; run `cargo test` after any change.
- Unslop any text aimed at humans (PR descriptions, READMEs, commit messages):
  plain words, no em dashes, no AI tells.

## Key architecture notes

- **Phase-distortion model**: `p(f0)` gives the frequency-dependent `P` from
  the paper's linear fit; `waveform(phase, p)` evaluates the waveform.
- **Phase accumulator**: persistent `phase`; `None` frequency uses the
  constant frequency set on the oscillator.
- **Hard sync**: rising zero crossing when previous sync sample `<= 0` and
  current `> 0`; zero crossing linearly interpolated in time.
- **Two process paths**: `process()` is the block renderer (audio-rate
  frequency/sync via slices); `process_sample()` takes an explicit event
  offset for oscillators that know the exact master phase-wrap time.

## Scope / limitations

This models the waveform, not a complete anti-aliased oscillator. Oversampling,
BLEP/BLAMP correction, the AudioWorklet processor, and the WASM artifact are
out of scope here.

## Regenerating fixtures

Golden fixtures were produced by the original C implementation (float32 WAV,
mono, 48 kHz, 0.25 s, frequencies `{55, 110, 220, 440, 880, 1760, 3520}` Hz)
before it was deleted. They are the specification by example: if DSP arithmetic
intentionally changes, regenerate the fixtures from the new implementation and
commit them with the change.
