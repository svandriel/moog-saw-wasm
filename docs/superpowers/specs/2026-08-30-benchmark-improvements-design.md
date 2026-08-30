# Benchmark Improvements: Dense-Sync Model and Primitive Micro-Benchmarks

Date: 2026-08-30

Status: Approved (design review)

## Why

The first benchmark round exposed two blind spots (see PR #5):

1. The sync workload barely measures sync. With only 7 rising edges per
   1024-sample block the hard-sync reset path fires ~0.7% of the time, so the
   `freq_sync` numbers sit on top of `freq` and hide any change to the sync
   math.
2. The frequency-dependent throughput gap (55 Hz benches slower than 3520 Hz)
   is unattributed. Cost drivers (`p`, `waveform`, phase accumulation) are
   mixed inside the `process` benches.

## Scope

- Add one dense-sync variant to the `process` bench group: rising sync edge
  every 4 samples (256 edges per 1024-sample block). Keep the existing
  7-edge variant.
- Add a `primitives` bench target with `p`, `waveform`, and `process_sample`
  micro-benchmarks, each swept across the seven canonical frequencies.
- Update the CI display step to run all bench targets (`cargo bench -- --quick`)
  so the new target is compiled and exercised in CI.
- Out of scope: baseline tracking, perf gating, exposing private `wrap_phase`,
  const-block-size changes, `process_sample` event-path variants.

## Approach

### `benches/process.rs`

Extract the shared sync-workload body into one helper; the two variants differ
only in sync period. Keep `audio_rate_freq_sync` (period 128, 7 edges/block).
Add `audio_rate_freq_sync_dense` with `SYNC_DENSE_PERIOD = 4`: a square wave
(2 low / 2 high samples) produces a rising edge every 4 samples, 256 edges
per block. Both keep `black_box` on inputs and output.

### `benches/primitives.rs` (new)

New target `[[bench]] name = "primitives"` in `Cargo.toml`. Constants shared
with the process bench: `SAMPLE_RATE = 48_000.0` and the 7-element `FREQS`.
One benchmark group `primitives`, throughput per call:

- `p` — `black_box(p(black_box(f)))` per frequency.
- `waveform` — p fixed per frequency; phase cycles through a 1024-point ramp
  in `[0,1)` (both branches and a range of `cos` arguments), result
  `black_box`'d.
- `process_sample` — a fresh oscillator per frequency, b.iter calls
  `black_box(osc.process_sample(f, false, 0.0))`, exercising the accumulator
  + waveform + p per sample.

Per-sample overhead is observable as `process_sample − waveform − p`; no
private function (notably `wrap_phase`) is exposed for the bench.

### CI display step

`.github/workflows/ci.yml`: change the display command from
`cargo bench --bench process -- --quick` to `cargo bench -- --quick`, so both
bench targets compile and run. Still display-only, no perf gate, same triggers.

## Data flow

- Benchmarks live in the worktree `benches/`; Criterion writes only under
  gitignored `target/criterion`. No committed artifacts.
- DSP arithmetic, fixtures, and the rlib API are untouched.

## Error handling

- Setup is infallible. Benchmarks keep Criterion defaults; failure semantics
  unchanged (fail on bench errors, never on numbers).

## Testing

- No new unit tests: benchmarks are not unit-tested; the process benches stay
  as-is aside from the added variant.
- Verification: `cargo test` stays green, `cargo bench --bench primitives -- --quick`
  and `cargo bench --bench process -- --quick` both run, CI on PR #5 exercises
  both targets and stays green.