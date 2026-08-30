# Benchmark Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the hard-sync reset cost and attribute the frequency-dependent throughput gap by adding a dense-sync variant and a primitives micro-benchmark target.

**Architecture:** Refactor the shared sync-workload body in `benches/process.rs` into one helper and add a dense-sync variant. Add a second bench target `benches/primitives.rs` with `p`, `waveform`, and `process_sample` micro-benchmarks. Update the CI display step to run all bench targets.

**Tech Stack:** Rust (edition 2024), Criterion 0.5.

## Global Constraints

- Display-only tool: no perf gate, never fails on numbers.
- Stable toolchain only; `cargo test` stays green; DSP arithmetic, fixtures, and the rlib public API are untouched.
- No pub API changes: `wrap_phase` stays private.
- Bench targets: `process` (3 workloads × 7 frequencies) and `primitives` (3 primitives × 7 frequencies).
- Spec correction: `SYNC_DENSE_PERIOD = 2`, not 4. With the formula `(i / period).is_multiple_of(2)`, `period = 2` yields the spec's stated behavior (2 low / 2 high samples, rising edge every 4 samples, 256 edges per 1024-block); `period = 4` would yield 128 edges/block.
- Also corrects prior docs: the sparse variant (128-sample half-cycle) has **4** rising edges per block, not 7.
- All changes via PR on branch `feature/benchmark`. Worktree: `.worktrees/benchmark`.

---
### Task 1: Dense hard-sync variant in `benches/process.rs`

**Files:**
- Modify: `benches/process.rs`

**Interfaces:**
- Consumes: the two existing `process`-group bench functions and constants `BLOCK`, `SYNC_PERIOD`, `FREQS`.
- Produces: a new benchmark id `process/audio_rate_freq_sync_dense/{freq}`; sparse variant id unchanged.

- [ ] **Step 1: Add the dense-sync constant**

Add next to `SYNC_PERIOD`:

```rust
const SYNC_DENSE_PERIOD: usize = 2;
```

- [ ] **Step 2: Extract a shared sync-workload helper and add the dense variant**

Replace `bench_process_freq_sync` with a parameterized helper plus two thin wrappers:

```rust
fn bench_sync_variant(c: &mut Criterion, name: &str, sync_period: usize) {
    let mut group = c.benchmark_group("process");
    group.throughput(Throughput::Elements(BLOCK as u64));

    for &f in &FREQS {
        let freq = vec![f; BLOCK];
        let sync: Vec<f32> = (0..BLOCK)
            .map(|i| if (i / sync_period).is_multiple_of(2) { -1.0 } else { 1.0 })
            .collect();
        let mut out = vec![0.0f32; BLOCK];
        let mut osc = MoogSaw::new(SAMPLE_RATE).unwrap();

        group.bench_function(BenchmarkId::new(name, f), |b| {
            b.iter(|| {
                osc.process(
                    black_box(Some(&freq[..])),
                    Some(black_box(&sync[..])),
                    black_box(&mut out[..]),
                );
            });
        });
    }
    group.finish();
}

fn bench_process_freq_sync(c: &mut Criterion) {
    bench_sync_variant(c, "audio_rate_freq_sync", SYNC_PERIOD);
}

fn bench_process_freq_sync_dense(c: &mut Criterion) {
    bench_sync_variant(c, "audio_rate_freq_sync_dense", SYNC_DENSE_PERIOD);
}
```

- [ ] **Step 3: Register the dense variant**

```rust
criterion_group!(benches, bench_process_freq, bench_process_freq_sync, bench_process_freq_sync_dense);
```

- [ ] **Step 4: Run the process bench**

Run: `cargo bench --bench process -- --quick`
Expected: 21 functions listed and measured: 3 workloads (`audio_rate_freq`, `audio_rate_freq_sync`, `audio_rate_freq_sync_dense`) × 7 frequencies. Exit 0.

- [ ] **Step 5: Confirm tests still pass**

Run: `cargo test`
Expected: 6 tests pass, 0 failures.

- [ ] **Step 6: Commit and push**

```bash
git add benches/process.rs
git commit -m "bench: add dense hard-sync variant"
git push
```

### Task 2: Primitives micro-benchmark target

**Files:**
- Modify: `Cargo.toml` (add `[[bench]] name = "primitives"`)
- Create: `benches/primitives.rs`

**Interfaces:**
- Consumes: `moog_saw::{p, waveform, MoogSaw}`. Signatures: `p(frequency_hz: f32) -> f32`, `waveform(phase: f64, p: f32) -> f32`, `MoogSaw::new(sample_rate: f64) -> Option<Self>`, `MoogSaw::process_sample(&mut self, frequency_hz: f32, sync_event: bool, event_offset_samples: f64) -> f32`.
- Produces: benchmark ids `primitives/p/{freq}`, `primitives/waveform/{freq}`, `primitives/process_sample/{freq}`.

- [ ] **Step 1: Register the target in `Cargo.toml`**

```toml
[[bench]]
name = "primitives"
harness = false
```

- [ ] **Step 2: Write `benches/primitives.rs`**

```rust
use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use moog_saw::{MoogSaw, p, waveform};

const SAMPLE_RATE: f64 = 48_000.0;
const PHASES: usize = 1024;
const FREQS: [f32; 7] = [55.0, 110.0, 220.0, 440.0, 880.0, 1760.0, 3520.0];

fn bench_p(c: &mut Criterion) {
    let mut group = c.benchmark_group("primitives");
    group.throughput(Throughput::Elements(1));

    for &f in &FREQS {
        group.bench_function(BenchmarkId::new("p", f), |b| {
            b.iter(|| {
                black_box(p(black_box(f)));
            });
        });
    }
    group.finish();
}

fn bench_waveform(c: &mut Criterion) {
    let mut group = c.benchmark_group("primitives");
    group.throughput(Throughput::Elements(PHASES as u64));

    let phases: Vec<f64> = (0..PHASES).map(|i| i as f64 / PHASES as f64).collect();

    for &f in &FREQS {
        let p_f = p(f);
        group.bench_function(BenchmarkId::new("waveform", f), |b| {
            b.iter(|| {
                let mut acc = 0.0f32;
                for &ph in black_box(&phases) {
                    acc = waveform(ph, p_f);
                }
                black_box(acc);
            });
        });
    }
    group.finish();
}

fn bench_process_sample(c: &mut Criterion) {
    let mut group = c.benchmark_group("primitives");
    group.throughput(Throughput::Elements(1));

    for &f in &FREQS {
        let mut osc = MoogSaw::new(SAMPLE_RATE).unwrap();
        group.bench_function(BenchmarkId::new("process_sample", f), |b| {
            b.iter(|| {
                black_box(osc.process_sample(f, false, 0.0));
            });
        });
    }
    group.finish();
}

criterion_group!(benches, bench_p, bench_waveform, bench_process_sample);
criterion_main!(benches);
```

- [ ] **Step 3: Run the primitives bench**

Run: `cargo bench --bench primitives -- --quick`
Expected: 21 functions listed and measured (`p`, `waveform`, `process_sample` × 7 frequencies). Exit 0.

- [ ] **Step 4: Check for clippy warnings**

Run: `cargo clippy --benches`
Expected: no warnings in `benches/` (pre-existing lib warnings are out of scope).

- [ ] **Step 5: Confirm tests still pass**

Run: `cargo test`
Expected: 6 tests pass, 0 failures.

- [ ] **Step 6: Commit and push**

```bash
git add Cargo.toml benches/primitives.rs
git commit -m "bench: add primitives micro-benchmark target"
git push
```

### Task 3: CI display step covers all bench targets

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `benches/process.rs` and `benches/primitives.rs` targets from Tasks 1 and 2.
- Produces: a CI job whose log shows all 42 benchmark functions in quick mode.

- [ ] **Step 1: Run all bench targets in CI**

Replace the display step command:

```yaml
      - name: Benchmark (display only)
        run: cargo bench --bench process --bench primitives -- --quick
```

- [ ] **Step 2: Review the diff**

Run: `git diff .github/workflows/ci.yml`
Expected: single-command change inside the `Benchmark (display only)` step only.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run all bench targets in display step"
git push
```

- [ ] **Step 4: Verify the CI run**

Run: `gh pr checks 5 --watch`
Expected: `build-and-test` passes; the `Benchmark (display only)` log shows `process/audio_rate_freq_sync_dense` and `primitives/` outputs. `gh run view <run-id> --log | rg "audio_rate_freq_sync_dense|BenchmarkId"` is a spot check; the step's truncated log is easiest to confirm via the run page.

## Self-Review

- **Spec coverage:** dense variant with 256 edges/block ✓ (Task 1, `SYNC_DENSE_PERIOD = 2` per the correction); sparse variant kept ✓; primitives `p`/`waveform`/`process_sample` each × 7 frequencies ✓ (Task 2); CI runs all targets ✓ (Task 3); no pub API changes ✓; fixtures/DSP untouched ✓.
- **Placeholder scan:** no TBD/TODO; every step has concrete file contents and commands.
- **Type consistency:** `p(f: f32) -> f32`, `waveform(phase: f64, p: f32) -> f32`, `process_sample(f: f32, false, 0.0) -> f32` all match `src/lib.rs` exactly; helper signature `bench_sync_variant(&mut Criterion, &str, usize)` used consistently across both wrappers.