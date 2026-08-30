# CI Display-Only Benchmark Step Design

Date: 2026-08-30

Status: Approved (design review)

## Why

PR #5 adds a local Criterion benchmark. This adds a GitHub Actions step so
the benchmark also runs in CI, purely for display: numbers appear in the job
log. It is explicitly not a performance gate — no thresholds, baselines, or
fail-on-regression.

## Scope

- Append one step to the existing `build-and-test` job in
  `.github/workflows/ci.yml`.
- Runs on the same triggers as the existing steps: push to `main` and PRs.
- Command: `cargo bench --bench process -- --quick` — full 14-function sweep
  (7 frequencies × 2 workloads) in fast, deliberately approximate mode
  (≈1–2 min of CI time).
- Display only: results printed to the Actions log via criterion's normal
  output. No PR comment, no third-party actions, no new jobs or runners,
  no committed artifacts (`target/criterion` is under gitignored `/target`).
- Out of scope: perf gating, baseline tracking, gh-pages charts, filtering
  benchmarks, running on anything other than the stable toolchain already
  installed by `dtolnay/rust-toolchain@stable`.

## Approach

`build-and-test` gains one step after `cargo build --release`:

```yaml
- name: Benchmark (display only)
  run: cargo bench --bench process -- --quick
```

Reuses the job's `ubuntu-latest` runner and `stable` toolchain — no extra
setup. Criterion already compiles the bench in release profile; shared cache
`target/` removes most rebuild cost.

## Failure semantics

- Fails the job if `cargo bench` errors (genuine signal: bench does not
  compile or run).
- Never fails on the benchmark *numbers* — output is informational only.

## Testing

- YAML workflow change; no unit tests.
- Verification: CI run on the PR exercises the step end-to-end and shows
  samples/sec output in the log.