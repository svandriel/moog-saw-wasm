# Benchmark: local Criterion throughput tool

Date: 2026-08-30

Status: Approved (design review)

## Why

Tuning the DSP arithmetic changes output only if it also changes fixture
parity, and when arithmetic intentionally changes, knowing its performance
impact matters. This adds a local, stable-toolchain `cargo bench` tool to
eyeball samples/sec when tuning. It is a dev tool only: no CI gate.

## Scope

- Two workloads, both on the block renderer `process()`:
  - audio-rate frequency, no sync (`process(Some(&freq), None, &mut out)`)
  - audio-rate frequency + sync pulse train
    (`process(Some(&freq), Some(&sync), &mut out)`)
- Frequency sweep over the canonical fixture set
  `{55, 110, 220, 440, 880, 1760, 3520}` Hz, since `p()` and the phase
  update path are frequency-dependent.
- Out of scope: constant-frequency `process()` path, `process_sample()`,
  the C-ABI `ffi` path, WASM, CI wiring.

## Approach

- `[dev-dependencies] criterion = "0.5"` and a
  `[[bench]] name = "process"` (`harness = false`) in `Cargo.toml`.
  Dev-dependencies never ship; the rlib stays zero-runtime-dep and
  `#![no_std]`-clean.
- New file `benches/process.rs` with two Criterion benchmarks
  (`process_freq`, `process_freq_sync`).
- Each benchmark loops all seven frequencies, one block per frequency.

## Data flow

- Fixed block size of 1024 samples (an AudioWorklet-friendly size).
- `freq` slice filled with the target frequency for that block.
- `sync` slice: a slow pulse pattern with a few rising edges per block
  (square wave at ~1 Hz), so the hard-sync reset path is actually
  exercised rather than compiled-away/dead.
- Output buffer and input slices wrapped in `criterion::black_box` so the
  optimizer cannot elide the per-sample work.
- Reports throughput in samples/sec (Criterion `Throughput::Elements`,
  grouped via `BenchmarkGroup`) so a tweak shows as an immediate % change.

## Error handling

- Benchmark setup is infallible; `criterion_group!` / `criterion_main!`
  as usual.

## Testing

- `cargo test` remains green (no behavior change; fixtures untouched).
- Manual verification: `cargo bench` completes on the stable toolchain and
  prints samples/sec for both benchmarks.

## Workflow

- Feature branch `feature/benchmark` in worktree `.worktrees/benchmark`,
  pushed to `origin`, merged via PR (AGENTS.md requirement).