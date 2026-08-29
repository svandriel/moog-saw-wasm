# AGENTS.md

Guidance for AI agents working in this repo.

## Project

C11 implementation of the Pekonen 2011 phase-distortion model of the Moog
sawtooth oscillator, with an Emscripten/WASM wrapper. No runtime dependencies.

The end goal is to ship this as an npm package (likely for AudioWorklet /
browser use). No package.json exists yet — very early phase. Structure the
WASM/ESM wrapper and keep the DSP core portable so it stays buildable toward
that goal. Don't lock in a specific package layout until it's decided.

## Commands

- `make` — build both native and WASM targets
- `make native` — build `build/native/test_moog_saw`
- `make test` — build and run native smoke tests (expect `all tests passed`)
- `make wasm` — build `build/wasm/moog_saw.js` (requires `emcc` on PATH); output is ESM (`-sMODULARIZE=1 -sEXPORT_ES6=1`), so it's already consumable from a future npm wrapper
- `make clean` — remove `build/`

## File layout

- `include/moog_saw.h` — public C API (single header)
- `src/moog_saw.c` — DSP core
- `src/moog_saw_wasm.c` — Emscripten wrapper (included only in WASM build)
- `tests/test_moog_saw.c` — native unit tests, run by `make test`
- `dist/` — build artifacts (gitignored via `build/` only; `dist/` is untracked)

## Conventions

- C11, compiled with `-std=c11 -O2 -Wall -Wextra -Wpedantic`; keep warning-free.
- Prefix public symbols with `moog_saw_`; opaque struct returned via
  `create`/`destroy`.
- Core API is in C with no WASM specifics; keep WASM-specific glue in
  `src/moog_saw_wasm.c`.
- DSP in normalized phase units `[0,1)`; output normalized to approximately
  `[-1,+1]`.
- Add features as pure DSP plus tests in `tests/test_moog_saw.c`; run
  `make test` after any DSP change.

## Key architecture notes

- **Phase-distortion model**: `moog_saw_p()` gives frequency-dependent `P(f0)`
  from the paper's linear fit; `moog_saw_waveform(phase, p)` evaluates the
  waveform.
- **Phase accumulator**: persistent state; `frequency == NULL` uses the
  constant frequency set on the oscillator.
- **Hard sync**: rising zero crossing when previous sync sample `<= 0` and
  current `> 0`; zero crossing linearly interpolated in time. Oscillator
  resets to phase 0 at the interpolated time.
- **Two process paths**: `moog_saw_process()` is the block renderer
  (audio-rate frequency/sync via arrays); `moog_saw_process_sample()` takes an
  explicit event offset for oscillators that know the exact master phase-wrap
  time (e.g. in an AudioWorklet engine).

## Scope / limitations

This models the waveform, not a complete anti-aliased oscillator. Oversampling,
BLEP/BLAMP correction, and the browser-level AudioWorklet wrapper are expected
to live outside this core C API.

WASM build is ESM/modularized, so the future npm wrapper should consume it
directly from the WASM output rather than re-wrapping in extra glue.
