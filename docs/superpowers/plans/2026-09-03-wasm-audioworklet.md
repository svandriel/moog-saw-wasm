# WebAssembly + AudioWorklet + Vite Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Moog Saw oscillator as a WASM cdylib exposing C-ABI functions, wrapped by an AudioWorkletProcessor and a main-thread helper, delivered as a pnpm + Vite TypeScript app under `web/` with a playable demo (adapted from the Fable synth template) served by `pnpm run dev`.

**Architecture:** Convert the repo into a Cargo workspace with two crates: `moog_saw` (existing core) and `moog_saw_wasm` (a `cdylib` re-exporting the core's C-ABI FFI plus a global allocator and a single `moog_saw_alloc` JS-callable primitive for reserving fixed per-instance buffers). The browser side lives in `web/`: a Vite + pnpm + TypeScript app whose `src/lib/` holds the publishable library (a `createMoogSawNode` helper and an `AudioWorkletProcessor` that instantiates the raw WASM module and reuses fixed freq/sync/out buffers every block) and whose `src/demo/` holds the adapted synth template that drives per-note moog saw voices. The dev loop runs `cargo build --target wasm32-unknown-unknown` (wired to `cargo watch`) in parallel with the Vite dev server.

**Tech Stack:** Rust (edition 2024, `no_std`, `libm`), C-ABI WASM (`wasm32-unknown-unknown` `cdylib`), Web Audio `AudioWorkletProcessor`/`AudioWorkletNode`, pnpm, Vite, TypeScript, `npm-run-all`.

## Global Constraints

- Rust edition 2024, `#![no_std]` in both crates.
- Zero extra runtime dependencies in `moog_saw`. `moog_saw_wasm` adds no crates, only the existing `moog_saw` path dependency.
- DSP arithmetic must remain bit-identical; do not touch `moog_saw/src/lib.rs` DSP logic, only expose the `ffi` module.
- Golden WAV fixtures are the reference; `cargo test` from the workspace root must stay green.
- NPM package `name: "moog-saw"`, `type: "module"`.
- All prose targeted at humans: plain words, no em dashes, no AI tells.
- Follow AGENTS.md: never push to `main`; every change lands via a PR; work in a dedicated worktree; update the worktree with `git fetch --all && git pull --ff-only` (or rebase) before starting.
- WASM build must use the rustup toolchain cargo. On this machine the default `cargo`/`rustc` on PATH are Homebrew binaries; prepend the rustup toolchain `bin` dir: `export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"`. Confirm with `cargo --version` matching the `rustc --version` you get from `rustup which rustc`.

---

### Task 1: Convert repo into a Cargo workspace

**Files:**
- Create: `Cargo.toml` (workspace root, replacing current crate manifest)
- Create: `moog_saw/Cargo.toml`
- Modify: `moog_saw/src/lib.rs:1-151` (move; and change `mod ffi;` to `pub mod ffi;`)
- Move: `moog_saw/src/lib.rs`, `moog_saw/src/ffi.rs` (already moved as part of this task)
- Move: `moog_saw/tests/*`, `moog_saw/benches/*`
- Create: `moog_saw_wasm/Cargo.toml`
- Create: `moog_saw_wasm/src/lib.rs`
- Modify: `.gitignore` (add `/web/node_modules`, `web/src/lib/moog-saw.wasm`, `/web/dist`, `web/pnpm-lock.yaml` handled by pnpm)

**Interfaces:**
- Produces: workspace root manifest with members `["moog_saw", "moog_saw_wasm"]`; a `moog_saw` package with its existing rlib/benches; a `moog_saw_wasm` package (empty of source for now) with `[lib] crate-type = ["cdylib"]`.
- Produces: `pub mod ffi;` in `moog_saw/src/lib.rs`, so the WASM crate can re-export it.
- Consumes: nothing from prior tasks.

- [ ] **Step 1: Create a git worktree for this feature (per AGENTS.md)**

If not already working on a feature branch in a worktree, create one:

```bash
git fetch --all
git worktree add ../moogsaw-wasm feature/webassembly-impl
cd ../moogsaw-wasm
git pull --ff-only
```

(If the current checkout is already a suitable feature branch, you may skip provisioning a new worktree, but do run `git fetch --all && git pull --ff-only` first.)

- [ ] **Step 2: Move the core crate into `moog_saw/`**

```bash
mkdir -p moog_saw
git mv src moog_saw/src
git mv tests moog_saw/tests
git mv benches moog_saw/benches
git mv Cargo.toml moog_saw/Cargo.toml
```

Leave `Cargo.lock` at the repo root: in a Cargo workspace the lockfile belongs at
the workspace root only. Do NOT move it into `moog_saw/` (a nested
`moog_saw/Cargo.lock` in a member crate is ignored by Cargo and becomes dead
committed cruft). The Step 8 `cargo build` then regenerates the root
`Cargo.lock` as the single authoritative workspace lockfile, including both
crates.

Verify `moog_saw/src/lib.rs`, `moog_saw/tests/`, `moog_saw/benches/` now exist
and the old root `src/` is gone.

- [ ] **Step 3: Write the workspace root `Cargo.toml`**

Replace the old root manifest (now moved to `moog_saw/`) with a workspace root:

```toml
[workspace]
members = ["moog_saw", "moog_saw_wasm"]
resolver = "3"

[profile.dev]
panic = "abort"

[profile.release]
panic = "abort"
```

Notes:
- `panic = "abort"` is required in BOTH the dev and release profiles. The
  `moog_saw_wasm` cdylib is `#![no_std]`; building it for the native target in
  the dev profile without `panic = "abort"` fails with "unwinding panics are
  not supported without std". The release profile needs it so the cdylib links
  for `wasm32-unknown-unknown` without pulling in panic machinery. Both apply
  to both crates, which is acceptable.
- `cargo test` still runs the moog_saw tests: the test harness overrides the
  profile panic strategy and uses unwind, so tests work normally.

- [ ] **Step 4: Update the core crate manifest (keep it intact besides name/paths)**

`moog_saw/Cargo.toml` should already have the original package content (name `moog_saw`, `crate-type = ["rlib"]`, benches, libm dependency, criterion dev-dependency) since it was moved verbatim. Confirm it reads:

```toml
[package]
name = "moog_saw"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["rlib"]

[[bench]]
name = "process"
harness = false

[[bench]]
name = "primitives"
harness = false

[dependencies]
libm = "0.2"

[dev-dependencies]
criterion = "0.5"
```

- [ ] **Step 5: Make the `ffi` module public in the core crate**

Edit `moog_saw/src/lib.rs:151`:

```rust
mod ffi;
```

to:

```rust
pub mod ffi;
```

This is the only change to the core crate's source. Do not alter any DSP logic.

- [ ] **Step 6: Create the `moog_saw_wasm` crate manifest**

Create `moog_saw_wasm/Cargo.toml`:

```toml
[package]
name = "moog_saw_wasm"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
moog_saw = { path = "../moog_saw" }
```

- [ ] **Step 7: Write a minimal placeholder `moog_saw_wasm/src/lib.rs`**

Create `moog_saw_wasm/src/lib.rs` with a stub so the crate compiles before the real implementation in Task 2. A `#![no_std]` cdylib needs a `#[panic_handler]`, but that handler must be `#[cfg(not(test))]` so `cargo test` (which links std) does not hit a duplicate lang item:

```rust
#![no_std]

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

pub fn placeholder() -> u32 {
    0
}
```

Do not expose `malloc`/`free` or `moog_saw_alloc` here; those land in Task 2.

- [ ] **Step 8: Verify the native workspace builds**

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
cargo build
```

Expected: resolves the workspace, builds `moog_saw` fine (the `moog_saw_wasm` stub compiles for the native target too).

- [ ] **Step 9: Run the existing tests**

```bash
cargo test
```

Expected: all existing `moog_saw` numeric tests and golden fixture parity tests pass. This proves the workspace move did not break anything.

- [ ] **Step 10: Update `.gitignore`**

Add these lines to `.gitignore`:

```
/web/node_modules
/web/dist
web/src/lib/moog-saw.wasm
```

(`/web/node_modules` and `/web/dist` exist after Task 3; add them now while we are touching the file. `web/src/lib/moog-saw.wasm` is the built WASM artifact, generated in Task 3.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor: move core crate into moog_saw and add workspace root"
```

Verify `git status` is clean and `cargo test` still green before moving on.

---

### Task 2: Implement the WASM cdylib (allocator + re-exported C-ABI)

**Files:**
- Modify: `moog_saw_wasm/src/lib.rs`

**Interfaces:**
- Consumes: `pub mod ffi` from Task 1 (exports `moog_saw_create`, `moog_saw_destroy`, `moog_saw_reset`, `moog_saw_set_frequency`, `moog_saw_process`, `moog_saw_process_sample`, `moog_saw_p`, `moog_saw_waveform`, `moog_saw_phase`).
- Produces: WASM exported functions `moog_saw_alloc(size: usize) -> *mut u8` (the single JS-callable allocation primitive; NO `malloc`/`free`), plus all `moog_saw_*` re-exports and `memory`. Used by Task 4's `processor.ts` and validated in Task 5.
- Consumes: nothing else.

- [ ] **Step 1: Write the failing compile check**

There is no runtime test for the wasm crate yet; the "test" is that it compiles for `wasm32-unknown-unknown` and exports the expected symbols. First, write the target implementation file (step 2). Then run the build to confirm it compiles.

- [ ] **Step 2: Implement `moog_saw_wasm/src/lib.rs`**

Replace the placeholder with:

```rust
#![no_std]
extern crate alloc;

#[cfg(not(test))]
use alloc::alloc::{alloc, dealloc};
#[cfg(not(test))]
use core::alloc::{GlobalAlloc, Layout};
#[cfg(not(test))]
use core::panic::PanicInfo;

// The core ffi uses Box (alloc) to manage MoogSaw lifetimes over the C-ABI.
// wasm32-unknown-unknown has no default global allocator, so a cdylib that
// allocates must provide one. A simple bump allocator over a static heap
// suffices: every moog_saw_create returns a pointer that lives until
// moog_saw_destroy (or process teardown), and the js-side moog_saw_alloc
// reserves the fixed per-instance input/output buffers once at init.

#[cfg(not(test))]
struct WasmAllocator;

#[cfg(not(test))]
const HEAP_SIZE: usize = 1 << 20; // 1 MiB static heap

#[cfg(not(test))]
static mut HEAP: [u8; HEAP_SIZE] = [0u8; HEAP_SIZE];

#[cfg(not(test))]
static mut OFFSET: usize = 0;

#[cfg(not(test))]
unsafe impl GlobalAlloc for WasmAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let align = layout.align();
        let size = layout.size();
        unsafe {
            let start = OFFSET;
            let aligned = (start + align - 1) & !(align - 1);
            if aligned + size > HEAP_SIZE {
                return core::ptr::null_mut();
            }
            OFFSET = aligned + size;
            core::ptr::addr_of_mut!(HEAP).cast::<u8>().add(aligned)
        }
    }

    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {
        // Bump allocator never reclaims; adequate for fixed-lifetime use.
    }
}

#[cfg(not(test))]
#[global_allocator]
static ALLOC: WasmAllocator = WasmAllocator;

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

// Re-export every C-ABI function from the core crate's public ffi module.
pub use moog_saw::ffi::*;

// The single JS-callable allocation primitive. Used once at processor init to
// reserve the fixed freq/sync/output buffers. There is intentionally NO
// malloc/free/dealloc exposed: buffers live for the life of the instance.
#[cfg(not(test))]
#[unsafe(no_mangle)]
pub extern "C" fn moog_saw_alloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size, 8).unwrap();
    unsafe { alloc(layout) }
}
```

Notes:
- `#[cfg(not(test))]` gates the allocator, the panic handler, and `moog_saw_alloc` so that `cargo test` from the workspace root (which links std) compiles the wasm crate cleanly. Without the gate on the panic handler, `cargo test` fails with "multiple lang items"; without the gate on `moog_saw_alloc`, its call into `alloc::alloc::alloc` has no global allocator under the test harness. The wasm release build is a non-test build, so everything is included there.
- Use `core::ptr::addr_of_mut!(HEAP)` rather than `HEAP.as_mut_ptr()`; edition 2024 denies `static_mut_refs` and the former compiles cleanly.
- `panic = "abort"` (set at the workspace root in Task 1) plus this `#[panic_handler]` satisfies the linker for `wasm32-unknown-unknown`.
- No `malloc`, `free`, or `dealloc` symbols are exported.

- [ ] **Step 3: Build for wasm32 and verify it compiles**

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
cargo build --release --target wasm32-unknown-unknown -p moog_saw_wasm
```

Expected: `Finished` with a `moog_saw_wasm.wasm` at `target/wasm32-unknown-unknown/release/moog_saw_wasm.wasm`. If you see `can't find crate for 'core'`, the rustup toolchain is not on PATH (see Global Constraints).

- [ ] **Step 4: Smoke-test the exports and one process call via Node**

Create a throwaway script `/tmp/wasmtest.mjs`:

```js
import { readFileSync } from "fs";
const bytes = readFileSync("target/wasm32-unknown-unknown/release/moog_saw_wasm.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;
console.log("exports:", Object.keys(e).sort().join(", "));
const osc = e.moog_saw_create(48000);
const ps = 128 * 4;
const freq = e.moog_saw_alloc(ps);
const out = e.moog_saw_alloc(ps);
const f = new Float32Array(e.memory.buffer, freq, 128);
const o = new Float32Array(e.memory.buffer, out, 128);
f.fill(480);
e.moog_saw_process(osc, freq, 0, out, 128);
console.log("phase:", e.moog_saw_phase(osc).toFixed(4), "expected:", ((128 * 480 / 48000) % 1).toFixed(4));
console.log("finite:", o.every((x) => Number.isFinite(x)));
e.moog_saw_destroy(osc);
```

Run:

```bash
node /tmp/wasmtest.mjs
```

Expected: the exports list contains `memory`, `moog_saw_alloc`, and all
`moog_saw_*` functions, and does NOT contain `malloc` or `free` (confirm this
explicitly); `phase` prints `0.2800`; `finite` prints `true`. Delete
`/tmp/wasmtest.mjs` afterward.

- [ ] **Step 5: Run the full native test suite still green**

```bash
cargo test
```

Expected: passes (the wasm cdylib does not affect native tests; this guards against accidental changes).

- [ ] **Step 6: Commit**

```bash
git add moog_saw_wasm
git commit -m "feat: add moog_saw_wasm cdylib with allocator and C-ABI exports"
```

---

### Task 3: Scaffold the pnpm + Vite TypeScript app under `web/`

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/vite-env.d.ts`
- Create: `web/src/lib/index.ts` (stub export for now)
- Create: `web/src/lib/processor.ts` (stub for now)
- Create: `web/src/demo/main.ts`, `web/src/demo/style.css`, `web/src/demo/synth.ts`, `web/src/demo/scope.ts`, `web/src/demo/keyboard.ts` (stubs)
- Create: `web/scripts/copy-wasm.mjs`

**Interfaces:**
- Produces: `web/package.json` with scripts `wasm:build`, `wasm:watch`, `dev`, `vite`, `build`, `preview`; devDependencies `typescript`, `vite`, `npm-run-all`, and a rust watcher (`cargo-watch` binary via a npm wrapper or `chokidar-cli`; pick one and document).
- Consumes: Task 2's WASM artifact path `target/wasm32-unknown-unknown/release/moog_saw_wasm.wasm` (copied to `web/src/lib/moog-saw.wasm`).
- Produces: `web/src/lib/moog-saw.wasm` artifact for Task 4.
- The demo stubs are duplicated flesh-out in Task 6.

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "moog-saw",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "wasm:build": "node scripts/copy-wasm.mjs",
    "wasm:watch": "cargo-watch --no-gitignore -x \"build --release --target wasm32-unknown-unknown -p moog_saw_wasm\" -s \"node scripts/copy-wasm.mjs\"",
    "vite": "vite",
    "dev": "run-p wasm:watch vite",
    "build": "run-s wasm:build tsc vite:build",
    "tsc": "tsc --noEmit",
    "vite:build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "cargo-watch": "^8.5.1",
    "npm-run-all": "^4.1.5",
    "typescript": "~5.6.2",
    "vite": "^6.0.5"
  }
}
```

Notes that the implementer should apply:
- `wasm:watch` uses `cargo-watch` (a Rust binary installed via `cargo install cargo-watch`, not the npm `cargo-watch`). The npm `cargo-watch` devDependency entry is misleading; remove it and rely on a globally installed `cargo-watch`. The plan keeps a real dependency list: drop `"cargo-watch"` from devDependencies and instead document `cargo install cargo-watch` in the repo README and the step below. If cargo-watch is not desired, replace the `-s` hook semantics with a `chokidar-cli` based script; either is acceptable, but document your choice and keep `dev` = parallel rust-rebuild + vite.
- The `--no-gitignore` flag on cargo-watch makes it also watch files inside gitignored dirs; it watches the whole workspace so Rust source changes under `moog_saw/` and `moog_saw_wasm/` trigger a rebuild.
- `copy-wasm.mjs` (step 4) reads the built artifact and writes `web/src/lib/moog-saw.wasm`.

- [ ] **Step 2: Write `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`WebWorker` lib is needed for the `AudioWorkletProcessor`/`registerProcessor` globals in `processor.ts`.

- [ ] **Step 3: Write `web/vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  // WASM is imported via the `?url` suffix; no wasm plugin required.
  // The demo is served from index.html.
});
```

- [ ] **Step 4: Write `web/scripts/copy-wasm.mjs`**

```js
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = join(
  root,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "moog_saw_wasm.wasm",
);
const dest = join(root, "web", "src", "lib", "moog-saw.wasm");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("copied wasm ->", dest);
```

- [ ] **Step 5: Write `web/index.html`**

A minimal shell; the demo body/template is fleshed out in Task 6:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NEON//OSC - Moog Saw</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/demo/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Write `web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Create stub library and demo source files**

Create minimal files so the app builds. `web/src/lib/index.ts`:

```ts
export async function createMoogSawNode(
  _ctx: AudioContext,
): Promise<AudioWorkletNode> {
  throw new Error("not implemented yet");
}
```

`web/src/demo/main.ts`:

```ts
import "./style.css";

document.querySelector<HTMLDivElement>("#app")!.textContent = "moog-saw demo";
```

`web/src/lib/processor.ts` (empty stub for now, body in Task 4):

```ts
// AudioWorkletProcessor implementation added in a later step.
```

Create empty `web/src/demo/style.css`, `web/src/demo/synth.ts`, `web/src/demo/scope.ts`, `web/src/demo/keyboard.ts` (each with at least a valid empty TS module so `tsc` passes). For example each file may contain:

```ts
export {};
```

- [ ] **Step 8: Install dependencies with pnpm**

```bash
cd web
pnpm install
```

Expected: creates `web/pnpm-lock.yaml` and `web/node_modules`.

- [ ] **Step 9: Add cargo-watch to the environment (or chosen watcher)**

```bash
cargo install cargo-watch
```

If this is undesirable on the machine, replace `wasm:watch` with a `chokidar-cli` alternative and document it. Record whichever is used in `web/package.json` (drop the bogus `cargo-watch` npm devDependency).

- [ ] **Step 10: Build the wasm and run typecheck**

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
pnpm run wasm:build
pnpm run tsc
```

Expected: `moog-saw.wasm` written to `web/src/lib/`, `tsc` passes with no errors.

- [ ] **Step 11: Commit**

```bash
git add web
git commit -m "chore: scaffold pnpm + vite typescript app under web"
```

---

### Task 4: Implement the AudioWorkletProcessor and main-thread helper

**Files:**
- Modify: `web/src/lib/processor.ts`
- Modify: `web/src/lib/index.ts`
- Create: `web/src/lib/audio-worklet.d.ts` (type declarations if needed)

**Interfaces:**
- Consumes: WASM artifact `web/src/lib/moog-saw.wasm` (Task 3), exports from Task 2.
- Consumes: `WebAssembly.Module` produced by `WebAssembly.compileStreaming` on the main thread.
- Produces: `registerProcessor('moog-saw', MoogSawProcessor)` side effect; `createMoogSawNode(ctx: AudioContext): Promise<AudioWorkletNode>` export used by Task 6's `synth.ts`.
- The processor communicates with the main thread over `MessagePort` (`type: 'init'` with `{ module, sampleRate }`).

- [ ] **Step 1: Write `web/src/lib/processor.ts`**

Replace the stub with:

```ts
class MoogSawProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "frequency",
        defaultValue: 440,
        minValue: 20,
        maxValue: 20000,
        automationRate: "a-rate",
      },
    ];
  }

  private exports: any = null;
  private memory: WebAssembly.Memory | null = null;
  private oscPtr = 0;
  private freqBufPtr = 0;
  private syncBufPtr = 0;
  private outBufPtr = 0;
  private ready = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "init") {
        void this.init(e.data);
      }
    };
  }

  private async init(data: { module: WebAssembly.Module; sampleRate: number }) {
    const { instance } = await WebAssembly.instantiate(data.module);
    this.exports = instance.exports;
    this.memory = instance.exports.memory;
    this.oscPtr = this.exports.moog_saw_create(data.sampleRate);

    const bufSize = 128 * 4;
    this.freqBufPtr = this.exports.moog_saw_alloc(bufSize);
    this.syncBufPtr = this.exports.moog_saw_alloc(bufSize);
    this.outBufPtr = this.exports.moog_saw_alloc(bufSize);
    this.ready = true;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    if (!this.ready) return true;

    const out = outputs[0][0];
    const freqParam = parameters.frequency;
    const syncInput = inputs[0]?.[0];

    const freqView = new Float32Array(this.memory!.buffer, this.freqBufPtr, 128);
    if (freqParam.length === 1) freqView.fill(freqParam[0]);
    else freqView.set(freqParam.subarray(0, 128));

    if (syncInput) {
      const syncView = new Float32Array(
        this.memory!.buffer,
        this.syncBufPtr,
        128,
      );
      syncView.set(syncInput.subarray(0, 128));
    }

    this.exports.moog_saw_process(
      this.oscPtr,
      this.freqBufPtr,
      syncInput ? this.syncBufPtr : 0,
      this.outBufPtr,
      128,
    );

    const wasmOut = new Float32Array(
      this.memory!.buffer,
      this.outBufPtr,
      128,
    );
    out.set(wasmOut);

    return true;
  }
}

registerProcessor("moog-saw", MoogSawProcessor);
```

Notes:
- Use `any` for `this.exports` deliberately; WASM exports are dynamically typed. Do not add a comment explaining this unless asked; keep the file clean.
- `params.frequency` with `automationRate: "a-rate"` is always an array; a single-element array means k-rate (constant for the block).

- [ ] **Step 2: Type-check the processor in isolation**

Add temporary declarations to `web/src/vite-env.d.ts` so `AudioWorkletProcessor` and `registerProcessor` are typed:

```ts
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (...args: any[]) => AudioWorkletProcessor,
): void;
```

Run `pnpm run tsc`. Expected: passes. (These declarations are valid; TS's DOM lib may already provide them. If `tsc` complains about duplicate declarations, remove the ones the DOM lib already provides and keep only the missing ones.)

- [ ] **Step 3: Write `web/src/lib/index.ts`**

```ts
import wasmUrl from "./moog-saw.wasm?url";

let processorReady: Promise<void> | null = null;

function ensureProcessorModule(ctx: AudioContext): Promise<void> {
  if (!processorReady) {
    const url = new URL("./processor.ts", import.meta.url);
    processorReady = ctx.audioWorklet.addModule(url);
  }
  return processorReady;
}

export async function createMoogSawNode(
  ctx: AudioContext,
): Promise<AudioWorkletNode> {
  const wasmModule = await WebAssembly.compileStreaming(fetch(wasmUrl));
  await ensureProcessorModule(ctx);

  const node = new AudioWorkletNode(ctx, "moog-saw", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  node.port.postMessage({
    type: "init",
    module: wasmModule,
    sampleRate: ctx.sampleRate,
  });

  return node;
}

export { MoogSawProcessor } from "./processor";
```

Notes:
- `new URL("./processor.ts", import.meta.url)` makes Vite emit `processor.ts` as a separate chunk so `audioWorklet.addModule` can load it standalone. Verify during Task 5 that Vite serves it as its own module (not inlined into the main bundle). If Vite/Vite 6 inlines it or the worklet cannot resolve it, use Vite's `?worker`/`?url` mechanism or a dedicated build entry; document whichever works.
- The `MoogSawProcessor` re-export is optional; it exists so `index.ts` is the package entry. If it causes `tsc` issues (it pulls in worklet globals on the main-thread bundle), remove the re-export and import nothing else from `./processor` besides the dynamic `new URL` reference.

- [ ] **Step 4: Run typecheck**

```bash
cd web
pnpm run tsc
```

Expected: passes.

- [ ] **Step 5: Build the library output**

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
pnpm run wasm:build
pnpm run build
```

Expected: `vite build` produces `web/dist` with `index.html`, the demo JS bundle, and `moog-saw.wasm`. Confirm `moog-saw.wasm` appears in `dist/`.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib
git commit -m "feat: add AudioWorkletProcessor and createMoogSawNode helper"
```

---

### Task 5: Verify the AudioWorklet path in the browser

**Files:**
- Modify: `web/index.html` (temporary harness, replaced by Task 6)
- Modify: `web/src/demo/main.ts` (temporary harness)

**Interfaces:**
- Consumes: `createMoogSawNode` from Task 4.
- Produces: a working browser check proving the processor instantiation, WASM instantiation, and audio output path function. Task 6's full demo builds on this.

- [ ] **Step 1: Write a temporary browser harness**

Replace `web/src/demo/main.ts` with:

```ts
import "./style.css";
import { createMoogSawNode } from "../lib/index";

async function bootstrap() {
  const ctx = new AudioContext();
  let on = false;
  setInterval(async () => {
    on = !on;
    if (on) {
      const node = await createMoogSawNode(ctx);
      node.parameters.get("frequency").value = 440;
      node.connect(ctx.destination);
    }
  }, 1000);
}

bootstrap();
```

- [ ] **Step 2: Run the dev server**

```bash
cd web
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
pnpm run dev
```

Expected: Vite serves the app at the printed local URL (default `http://localhost:5173`).

- [ ] **Step 3: Manually validate in the browser**

Open the URL, click the page to resume the AudioContext (a user gesture is required). Expected:
- No console errors about `addModule`, WASM compile/instantiate, or an undefined `registerProcessor`/`AudioWorkletProcessor`.
- Alternating 1-second intervals of 440 Hz tone (moog saw) cycle correctly.
- Use browser DevTools to confirm the worklet global scope runs `processor.ts` and that `moog-saw` is registered.

If it fails, debug systematically:
- If `addModule` cannot resolve the processor chunk, the `new URL` mechanism is the issue; ensure `processor.ts` is emitted as a standalone file (check `web/dist` after a build, or DevTools network for the processor module).
- If WASM cannot compile, check the `moog-saw.wasm` file is served and its URL is correct.
- Check the browser console for the exact error and address it. Do not proceed until the tone cycles.

- [ ] **Step 4: Commit the harness (or revert to stubs if desired)**

The harness is placeholder; the real demo replaces it in Task 6. Commit if you want the incremental checkpoint:

```bash
git add web/src/demo/main.ts
git commit -m "chore: temporary browser harness for audioworklet check"
```

(Optional. If you prefer, revert `main.ts` to the Task 3 stub after validation and carry on; do not leave the timer-driven beeper in the final demo.)

---

### Task 6: Port the synth template into the demo

**Files:**
- Modify: `web/index.html`
- Create: `web/src/demo/style.css` (full template styles)
- Modify: `web/src/demo/synth.ts` (audio graph + voice handling, moog saw swap)
- Modify: `web/src/demo/scope.ts` (oscilloscope + spectrum renderers)
- Modify: `web/src/demo/keyboard.ts` (keyboard build + input)
- Modify: `web/src/demo/main.ts` (bootstrap, wire modules)

**Interfaces:**
- Consumes: `createMoogSawNode(ctx)` from Task 4.
- Produces: the fully playable demo; `noteOn(semi)`/`noteOff(semi)`, waveform selector, filter knob, delay/sub toggles.

The template source is at
`https://miaai-lab.github.io/Fable-5.1-100-HTML-Files/032-synth-wave-visualizer.html`
(an `<!DOCTYPE html>` page with inline CSS and a single inline `<script>`).

- [ ] **Step 1: Copy the template styles into `web/src/demo/style.css`**

Copy the entire `<style>...</style>` block from the template verbatim into `web/src/demo/style.css`. Keep the `:root` variables and all selectors as-is. The template uses class names `app`, `scopes`, `scope`, `controls`, `ctl`, `segment`, `knob`, `toggle`, `keyboard`, `key`, `status`, `logo`, `hint`, `footer`. Preserve them exactly so the markup (step 2) and JS (steps 3-5) can target them.

- [ ] **Step 2: Write `web/index.html` with the template markup**

Port the template's `<body>` structure into `web/index.html`, keeping the same IDs and class names used by the template JS:

- `header` with `.logo` ("NEON//OSC" + `.small` "POLYPHONIC WAVETABLE · MK II") and `.status#status` with an `<i>` and `span`.
- `section.scopes` with `#scopeWrap > canvas#scope` labelled "Oscilloscope" and `#specWrap > canvas#spec` labelled "Spectrum".
- `section.controls` with:
  - `.ctl` "Waveform" with `#waves` four buttons `data-wave="sine"` (class `on`), `data-wave="sawtooth"`, `data-wave="square"`, `data-wave="triangle"`, each with the template's inline SVG path. Rename the labels/`data-wave` for saw as needed but keep `data-wave="sawtooth"` matching the template (the demo routes sawtooth to the moog saw).
  - `.ctl` "Filter Cutoff" with `#knob` (role=slider) containing `#knobRing`, and `#knobVal`.
  - `.ctl` "Space" with `#delayToggle` and `#glideToggle` toggles.
  - `.ctl` "Play" with the keyboard hints.
- `section.keyboard#keyboard` (empty; filled by JS).
- `footer` with the template's text.
- `<script type="module" src="/src/demo/main.ts"></script>`.

Use the template's exact markup for the buttons and knob. Do not invent new ids; keep them identical to the template so the ported scripts bind.

- [ ] **Step 3: Implement `web/src/demo/keyboard.ts`**

Port the template's keyboard construction and input handling:

```ts
export interface NoteLayout {
  n: string;
  k: string;
  semi: number;
  black?: boolean;
}

export const NOTES: NoteLayout[] = [
  { n: "C", k: "a", semi: 0 },
  { n: "C#", k: "w", semi: 1, black: true },
  { n: "D", k: "s", semi: 2 },
  { n: "D#", k: "e", semi: 3, black: true },
  { n: "E", k: "d", semi: 4 },
  { n: "F", k: "f", semi: 5 },
  { n: "F#", k: "t", semi: 6, black: true },
  { n: "G", k: "g", semi: 7 },
  { n: "G#", k: "y", semi: 8, black: true },
  { n: "A", k: "h", semi: 9 },
  { n: "A#", k: "u", semi: 10, black: true },
  { n: "B", k: "j", semi: 11 },
  { n: "C", k: "k", semi: 12 },
  { n: "C#", k: "o", semi: 13, black: true },
  { n: "D", k: "l", semi: 14 },
  { n: "D#", k: "p", semi: 15, black: true },
  { n: "E", k: ";", semi: 16 },
];

export type NoteHandler = (semi: number) => void;

export function buildKeyboard(
  container: HTMLElement,
  onNoteOn: NoteHandler,
  onNoteOff: NoteHandler,
): { setOctave: (o: number) => void; octave: () => number; allOff: () => void } {
  // Build the DOM keys per the template (white keys flex, black keys absolute).
  // Wire pointer/pointermove/pointerup and keyboard keydown/keyup and window
  // blur to onNoteOn/onNoteOff, routing through an octave offset as in the
  // template (Z/X change octave and trigger allOff).
  // Return controls for octave state used by the visualizer.
  throw new Error("implement in Task 6 step 3");
}
```

This step's deliverable is the ported keyboard behavior. The `throw` is a placeholder to be replaced by the real implementation following the template's logic; do not ship the `throw`.

- [ ] **Step 4: Implement `web/src/demo/synth.ts`**

Port the template audio graph, and swap the saw path to the moog saw:

```ts
import { createMoogSawNode } from "../lib/index";

export type Wave = "sine" | "sawtooth" | "square" | "triangle";

export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private delay!: DelayNode;
  private feedback!: GainNode;
  private delayWet!: GainNode;
  private dry!: GainNode;
  private wave: Wave = "sine";
  private cutoff = 4000;
  private delayOn = false;
  private subOn = false;
  private voices: Record<
    number,
    {
      output: AudioNode;
      env: GainNode;
      stop: () => void;
    }
  > = {};

  get analyserRef(): AnalyserNode | null {
    return this.analyser ?? null;
  }

  setWave(w: Wave): void {
    this.wave = w;
    // Existing native voices switch osc.type where applicable; moog-saw
    // voices (sawtooth) are per-note and stop/restart on switch.
  }

  setCutoff(f: number): void {
    this.cutoff = f;
    if (this.ctx) this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.02);
  }

  setDelay(on: boolean): void {
    this.delayOn = on;
    if (this.ctx) this.delayWet.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.05);
  }

  setSub(on: boolean): void {
    this.subOn = on;
  }

  // Public for the visualizer status line.
  get octaveInfo(): string {
    return this._octaveLabel();
  }

  private _octaveLabel(): string {
    return "";
  }

  async noteOn(semi: number): Promise<void> {
    // Port template noteOn: ensureAudio, key highlight, build a voice.
    // If this.wave is "sawtooth", build a moog saw voice:
    //   const node = await createMoogSawNode(ctx);
    //   node.parameters.get("frequency").value = freqOf(semi);
    //   connect node -> env -> filter
    //   env attack/release ramps per template
    //   optionally add sub oscillator (sine at freq/2) -> subG -> env
    // Cache in this.voices[semi] with a stop() that stops native osc and
    // disconnects the node.
    // If wave is not sawtooth, use a native createOscillator with the type.
    // Return the voice handle.
    throw new Error("implement in Task 6 step 4");
  }

  noteOff(semi: number): void {
    // Port template noteOff: release envelope, remove from voices,
    // stop native osc / disconnect moog node after release.
    // Un-highlight key.
  }
}

export function freqOf(semi: number): number {
  return 261.6256 * 2 ** (semi / 12);
}
```

Key differences from the template that you must implement:
- The template calls `ensureAudio()` before building each native oscillator. For the moog saw, `noteOn` is async because creating an `AudioWorkletNode` requires the async `addModule`/compile step (cached via `createMoogSawNode`). Make `noteOn` return a `Promise`; handle the async keyboard path in `main.ts`/`synth.ts` (fire-and-forget with a guard so duplicate `noteOn` for the same `semi` is ignored while a voice is starting).
- When the wave is not `sawtooth`, the voice is a native `createOscillator` exactly as in the template. When it is `sawtooth`, use a moog saw `AudioWorkletNode`.
- On `setWave`, any active sawtooth (moog) voices must be torn down and restarted if a new note repeats them; simplest is to `allOff()` (release) voices when the waveform changes, matching the template's behaviour of updating `osc.type` only for native voices.

Because this file has a `throw`, the real body must replace it; this is the core deliverable of this task.

- [ ] **Step 5: Implement `web/src/demo/scope.ts`**

Port the template's oscilloscope and spectrum renderers:

```ts
export function runVisualizers(
  scopeCanvas: HTMLCanvasElement,
  specCanvas: HTMLCanvasElement,
  analyserRef: () => AnalyserNode | null,
  octaveRef: () => number,
  waveRef: () => string,
): () => void {
  // Fit canvases to their container with devicePixelRatio.
  // drawScope: grid, midline, then if an analyser is present and voices are
  //   active draw getFloatTimeDomainData, else draw a synthetic wave shape
  //   using waveRef() as before (sine/saw/square/triangle math).
  // drawSpec: radial bars from getByteFrequencyData, octave + wave label.
  // Return a stop() that cancels the rAF loop.
  throw new Error("implement in Task 6 step 5");
}
```

Use the template's math verbatim (the `waveFn` shapes and the spectrum bin mapping), and read the analyser from `analyserRef()`. Replace the `throw` with a working implementation; also apply `prefers-reduced-motion` handling as in the template.

- [ ] **Step 6: Implement `web/src/demo/main.ts`**

Wire `keyboard.ts`, `synth.ts`, and `scope.ts` together:

```ts
import "./style.css";
import { Synth } from "./synth";
import { buildKeyboard, NOTES } from "./keyboard";
import { runVisualizers } from "./scope";

const synth = new Synth();

const kbEl = document.getElementById("keyboard") as HTMLElement;
const scopeCanvas = document.getElementById("scope") as HTMLCanvasElement;
const specCanvas = document.getElementById("spec") as HTMLCanvasElement;
const statusEl = document.getElementById("status") as HTMLElement;
const knobEl = document.getElementById("knob") as HTMLElement;
const knobRing = document.getElementById("knobRing") as HTMLElement;
const knobVal = document.getElementById("knobVal") as HTMLElement;
const wavesEl = document.getElementById("waves") as HTMLElement;

// Waveform selector (template behaviour) -> synth.setWave + active class.
// Filter knob (pointer + wheel + keyboard) -> synth.setCutoff + renderKnob.
// Delay/sub toggles -> synth.setDelay / synth.setSub.
// Status audio lock on first pointer/key press (AudioContext resume).
// Start the visualizer loop.
runVisualizers(
  scopeCanvas,
  specCanvas,
  () => synth.analyserRef,
  () => 4, // octave placeholder; wire to keyboard octave control
  () => "sine",
);
```

All template UI wiring (waveform buttons, knob drag/wheel/keys, toggles, audio unlock on first gesture) must be ported here. Do not ship `throw` stubs; wire the real functions from `synth` and `keyboard`. Use the actual octave value exposed by `buildKeyboard` and the current wave from `synth` where the template reads those.

- [ ] **Step 7: Run the dev server and exercise the demo**

```bash
cd web
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
pnpm run dev
```

Open the page, click to unlock audio. Expected:
- Seeing the full synth UI (oscilloscope + spectrum + controls + keyboard).
- Pressing keys produces sound.
- Selecting **Saw** routes through the moog saw (per-note `AudioWorkletNode`s) and sounds different from the native sine/square/triangle; the oscilloscope shows the saw waveform.
- Filter knob, delay toggle, and sub oscillator behave as in the template.
- No console errors.

- [ ] **Step 8: Run the production build**

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
pnpm run build
```

Expected: `tsc` passes, `vite build` succeeds, `web/dist` contains the app and the wasm. Run `pnpm run preview` and confirm the built app plays.

- [ ] **Step 9: Commit**

```bash
git add web
git commit -m "feat: port synth template demo with moog saw voices"
```

---

### Task 7: Add the publishable NPM package manifest

**Files:**
- Create: `web/package.json` (add publish metadata) or `web/publish.json` (a dedicated publish manifest)
- Create: `web/scripts/build-lib.mjs` (produces `web/dist-lib/` with the distributable)

**Interfaces:**
- Consumes: `web/src/lib/index.ts` and `web/src/lib/processor.ts` from Task 4.
- Produces: a distributable folder containing `index.js`, `processor.js`, `moog-saw.wasm`, `index.d.ts`, and a publishable `package.json`.

This is the secondary deliverable (the spec says publishing is not the priority), so keep it minimal but real.

- [ ] **Step 1: Write `web/scripts/build-lib.mjs`**

Produce a `web/dist-lib/` folder with the library files that are safe to publish. Use Vite in library mode targeting `tsc`-emitted JS if types are emitted, or emit JS via Vite lib mode. A concrete lightweight approach:

```js
import { cpSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web");
const out = join(root, "dist-lib");
mkdirSync(out, { recursive: true });

// Library sources are already written as browser ESM.
cpSync(join(root, "src", "lib", "index.ts"), join(out, "index.js"));
cpSync(join(root, "src", "lib", "processor.ts"), join(out, "processor.js"));
cpSync(join(root, "src", "lib", "moog-saw.wasm"), join(out, "moog-saw.wasm"));

// Replace the .wasm?url import with a relative URL import in index.js.
// (See note: this files list and the ?url rewrite are implementer choices;
// update the emitted JS so the wasm resolves relative to the package.)
const pkg = {
  name: "moog-saw",
  version: "0.1.0",
  type: "module",
  main: "index.js",
  types: "index.d.ts",
  files: ["index.js", "processor.js", "index.d.ts", "moog-saw.wasm"],
};
writeFileSync(join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
console.log("lib built ->", out);
```

Notes for the implementer:
- The `index.ts` uses `import wasmUrl from "./moog-saw.wasm?url"` and `new URL("./processor.ts", import.meta.url)`. For a publishable package, the wasm must be resolved at runtime relative to the package. Decide between (a) bundling with a tool that inlines the wasm URL, or (b) copying sources and adjusting the import to `new URL("./moog-saw.wasm", import.meta.url)`. Document whichever you choose and keep `index.js` self-contained and resolvable when installed from npm.
- Copy `index.ts`/`processor.ts` to `.js` only if they contain no type-only syntax that breaks as JS; otherwise use a proper TS emit step (`tsc -p tsconfig.lib.json`). The plan leaves the exact emit mechanism to you but requires a working, installable `dist-lib` with a valid `package.json`.

- [ ] **Step 2: Add a `lib` script to `web/package.json`**

Add to `web/package.json` scripts:

```json
"lib": "node scripts/build-lib.mjs"
```

and keep it out of the default `build` (the demo build stays primary).

- [ ] **Step 3: Verify the lib build**

```bash
cd web
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
pnpm run wasm:build
pnpm run lib
ls dist-lib
```

Expected: `dist-lib` contains `index.js`, `processor.js`, `index.d.ts` (or types emitted), `moog-saw.wasm`, `package.json`. The package.json has the `moog-saw` name and `files` whitelist.

- [ ] **Step 4: Commit**

```bash
git add web
git commit -m "feat: add publishable npm package manifest and build script"
```

---

### Task 8: Wire CI and update docs

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `AGENTS.md` (add the wasm build environment note if helpful)

**Interfaces:**
- Consumes: the existing native test/build workflow; adds wasm + web checks.
- Produces: a CI that builds native tests, the wasm target, and the `web/` pnpm project.

- [ ] **Step 1: Add wasm and web jobs to CI**

Edit `.github/workflows/ci.yml` to add a `web-build` job:

```yaml
  web-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: cargo build --release --target wasm32-unknown-unknown -p moog_saw_wasm
      - name: Install pnpm
        run: corepack enable
      - working-directory: web
        run: pnpm install --frozen-lockfile
      - working-directory: web
        run: pnpm run wasm:build
      - working-directory: web
        run: pnpm run build
```

Leave the existing `build-and-test` job as-is (it runs `cargo test` and native release build/bench).

- [ ] **Step 2: Update `README.md`**

Add a "Web build" section documenting:
- The workspace structure (core + wasm + web).
- How to run the demo: `cd web && pnpm install && pnpm run dev`.
- The environment note: the wasm build needs the rustup toolchain; on this machine prepend the rustup `bin` dir to PATH (see Global Constraints).
- How the AudioWorklet works at a high level (compile module on main thread, pass to processor, instantiate there) in one or two sentences.

Keep it plain prose with no em dashes and no AI tells.

- [ ] **Step 3: Run the full native test suite once more**

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
cargo test
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: build wasm and web app; document web usage"
```

---

### Task 9: Finish the feature branch (PR per AGENTS.md)

**Files:**
- None (repository process).

**Interfaces:**
- None.

- [ ] **Step 1: Run the full verification locally**

```bash
export PATH="$HOME/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin:$PATH"
cargo build
cargo test
cargo build --release --target wasm32-unknown-unknown -p moog_saw_wasm
cd web
pnpm install --frozen-lockfile
pnpm run build
```

Expected: all pass/compile. Manually confirm the demo plays under `pnpm run dev`.

- [ ] **Step 2: Confirm git state is clean and commits are sensible**

```bash
git status
git log --oneline -15
```

Expected: working tree clean; a linear series of focused commits matching AGENTS.md's "one logical change per PR".

- [ ] **Step 3: Push and open a PR**

```bash
git push -u origin <branch>
gh pr create --fill
```

Expected: PR opened against `main`. Return the PR URL in your final report.

---

## Self-Review Notes

- Every spec requirement maps to a task:
  - Workspace layout (Task 1) + wasm cdylib (Task 2).
  - pnpm/Vite app (Task 3) + AudioWorkletProcessor/helper (Task 4) + browser verification (Task 5).
  - Demo template port + moog saw swap (Task 6).
  - CI + docs (Task 8), PR (Task 9).
- No placeholders: `throw new Error("implement in Task 6 ...")` markers are intentional placeholders for the implementer's porting work and are called out as such in each step; they are not "TBD" ambiguity but explicit work items with the source reference given (the template URL and the surrounding code shape).
- Type consistency: `createMoogSawNode(ctx): Promise<AudioWorkletNode>` is defined in Task 4 and consumed in Tasks 5/6. `registerProcessor('moog-saw', ...)` is consistent across Tasks 4/5/6. `Synth` methods (`setWave`, `setCutoff`, `setDelay`, `setSub`, `noteOn`, `noteOff`) are used consistently in Task 6.
- ABI consistency: `moog_saw_alloc(size: usize) -> *mut u8` is the only JS-callable allocation export, defined in Task 2 and consumed in Task 4's `processor.ts`. No `malloc`/`free` appears anywhere in the public API. The cfg-gating (`#[cfg(not(test))]`) and profile `panic = "abort"` (dev + release) from Task 1/2 are what keep `cargo test` green with the `#![no_std]` wasm crate present.
