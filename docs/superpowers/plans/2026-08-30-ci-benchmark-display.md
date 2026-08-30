# CI Display-Only Benchmark Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing Criterion benchmark in GitHub Actions so samples/sec appear in the CI job log, without any performance gate.

**Architecture:** Append one step to the existing `build-and-test` job in `.github/workflows/ci.yml`, reusing its `ubuntu-latest` runner and stable toolchain.

**Tech Stack:** GitHub Actions, Rust (stable), Criterion 0.5.

## Global Constraints

- No perf gate: the step never fails on benchmark numbers.
- Same triggers as existing steps: push to `main` and all PRs.
- Exact command: `cargo bench --bench process -- --quick` (fast smoke run, full 14-function sweep).
- Reuse the existing `ubuntu-latest` runner and `dtolnay/rust-toolchain@stable` step; no new jobs, actions, or third-party deps.
- Cannot run locally as a true workflow; the end-to-end check is the CI run on PR #5.
- All changes land via PR on branch `feature/benchmark`. Worktree: `.worktrees/benchmark`.

---
### Task 1: Add the display-only benchmark step to CI

**Files:**
- Modify: `.github/workflows/ci.yml` (append after the `- run: cargo build --release` step)

**Interfaces:**
- Consumes: `cargo bench --bench process` target defined in `Cargo.toml` and `benches/process.rs` (merged earlier in this branch).
- Produces: nothing on disk for the repo; criterion writes only under gitignored `target/criterion`.

- [ ] **Step 1: Append the benchmark step to `ci.yml`**

Edit `.github/workflows/ci.yml` so the `build-and-test` job ends with:

```yaml
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo test
      - run: cargo build --release
      - name: Benchmark (display only)
        run: cargo bench --bench process -- --quick
```

- [ ] **Step 2: Review the diff**

Run: `git diff .github/workflows/ci.yml`
Expected: exactly one added step, 12-space step indentation matching the existing steps, no other files changed.

- [ ] **Step 3: Confirm the benched command runs locally**

Run: `cargo bench --bench process -- --quick`
Expected: compiles, prints samples/sec for all 14 functions (`process/audio_rate_freq/{55..3520}` and `process/audio_rate_freq_sync/{55..3520}`), exits 0.

- [ ] **Step 4: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add display-only benchmark step"
git push
```

Pushing triggers the CI run on PR #5. Verify the `Benchmark (display only)` step in that run shows the criterion output and marks the job green: `gh pr checks 5 --watch`.

## Self-Review

- **Spec coverage:** one appended step in `build-and-test` ✓; same triggers ✓; exact command with `--quick` ✓; display only, no perf gate ✓; no new actions/runners ✓; pushed to origin per AGENTS.md ✓.
- **Placeholder scan:** no TBD/TODO; every step has concrete file content and commands.
- **Type consistency:** references `cargo bench --bench process` exactly as defined in `Cargo.toml` (`[[bench]] name = "process"`).