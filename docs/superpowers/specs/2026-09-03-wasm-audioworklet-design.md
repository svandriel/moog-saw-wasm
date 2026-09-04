# WebAssembly + AudioWorklet Design

## Goal

Package the Moog Saw oscillator as an NPM package that ships a ready-made
`AudioWorkletProcessor`. Provide a proper browser development environment:
a Vite + pnpm app with an adapted synth demo page (based on the Fable
"032-synth-wave-visualizer" template) that plays the moog saw, plus `pnpm run
dev`.

## Decisions

- **Rust workspace** at repo root with two member crates: `moog_saw` (core),
  `moog_saw_wasm` (WASM cdylib).
- **WASM crate**: plain cdylib with C-ABI exports (no wasm-bindgen). Re-exports
  `moog_saw::ffi`. Exposes a single init-time allocation primitive,
  `moog_saw_alloc(size) -> *mut u8`. It does NOT expose `malloc`/`free` (there
  is no general-purpose allocator in the public API).
- **Buffer ownership**: the WASM crate owns the fixed per-instance freq, sync,
  and output buffers. A processor reserves them once at init via
  `moog_saw_alloc`, wraps the returned pointers in `Float32Array` views over
  the instance memory, and reuses them every audio block. No allocation in the
  realtime path.
- **Timeline / ABI stability context**: many Rust-to-wasm audio projects
  (glicol, wasm-audio-worklet, wasm-loop-player) expose a single init-time
  allocator export rather than raw malloc/free. This spec follows that
  precedent to keep the JS-facing API clean and to avoid coupling JS to a
  general allocator. The static-heap bump allocator is part of the module's
  fixed memory, so buffers never move and JS views stay valid.
- **AudioWorklet loading**: main thread compiles WASM with
  `WebAssembly.compileStreaming`, passes the `WebAssembly.Module` to the
  processor via `postMessage`. The processor instantiates the module directly
  with `WebAssembly.instantiate`. No wasm-bindgen glue in the AudioWorklet
  scope.
- **JS app** lives under `web/`: Vite + pnpm + TypeScript. Contains the
  publishable library and the demo.
- **Package manager**: pnpm. **Build tool**: Vite.
- **Dev loop**: `pnpm run dev` serves the demo page. Rust -> WASM rebuild via
  `cargo watch`; TS/CSS via Vite HMR.
- **AudioWorklet API**: frequency AudioParam + sync audio input.
- **Demo**: full template adaptation. Saw uses the moog saw; sine/square/tri
  stay native. Polyphonic, one AudioWorkletNode (and WASM instance) per note.
  Multiple oscillators are supported as multiple nodes/instances sharing one
  compiled `WebAssembly.Module`; each instance owns independent memory and
  buffers.

## Repo layout

```
moogsaw/
  Cargo.toml            # Rust workspace
  moog_saw/             # core Rust lib (existing code)
    Cargo.toml
    src/lib.rs
    src/ffi.rs
    tests/
  moog_saw_wasm/        # WASM cdylib
    Cargo.toml
    src/lib.rs
  web/
    package.json
    pnpm-lock.yaml
    tsconfig.json
    vite.config.ts
    index.html          # adapted demo template
    src/
      lib/              # publishable library
        index.ts        # main-thread helper createMoogSawNode
        processor.ts    # AudioWorkletProcessor
        moog-saw.wasm   # built from moog_saw_wasm (gitignored)
      demo/
        main.ts
        style.css
        scope.ts        # oscilloscope + spectrum rendering
        keyboard.ts
        synth.ts        # audio graph, voices, per-note nodes
```

Root `Cargo.toml`:

```toml
[workspace]
members = ["moog_saw", "moog_saw_wasm"]
```

## WASM crate (`moog_saw_wasm`)

### Cargo.toml

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

### Rust API (`moog_saw_wasm/src/lib.rs`)

Re-exports the C-ABI functions and provides a global allocator plus a single
`moog_saw_alloc` primitive for JS-side fixed-buffer reservation:

```rust
#![no_std]
extern crate alloc;

// Global allocator for wasm32-unknown-unknown (ffi.rs needs Box/alloc)
mod allocator { ... }

// Re-export all C-ABI functions from the core FFI
pub use moog_saw::ffi::*;

#[unsafe(no_mangle)]
pub extern "C" fn moog_saw_alloc(size: usize) -> *mut u8 { ... }
```

The core `moog_saw::ffi` already exports `moog_saw_create`, `moog_saw_destroy`,
`moog_saw_reset`, `moog_saw_set_frequency`, `moog_saw_process`,
`moog_saw_process_sample`, `moog_saw_p`, `moog_saw_waveform`. The WASM crate
re-exports all of them and adds `moog_saw_alloc`, `memory`.

`moog_saw_alloc` is the only JS-callable allocation export. There is no
`malloc`, `free`, or `dealloc`. The processor calls `moog_saw_alloc` exactly
three times at init (freq, sync, output buffers, `128 * 4` bytes each). Because
the bump allocator runs over a static heap inside the module's fixed memory,
`moog_saw_alloc` never grows wasm memory, so the `Float32Array` views the JS
side creates stay valid for the life of the instance (no wasm-memory-growth
invalidation). Buffers and oscillator state die together when the node is torn
down; there is no per-buffer free.

Build:
```
cargo build --target wasm32-unknown-unknown -p moog_saw_wasm --release
```

## JS app under `web/`

### package.json (pnpm)

```json
{
  "name": "moog-saw",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "wasm:build": "cargo build --target wasm32-unknown-unknown -p moog_saw_wasm --release && cp ../../target/wasm32-unknown-unknown/release/moog_saw_wasm.wasm src/lib/moog-saw.wasm",
    "wasm:watch": "cargo watch -x \"build --target wasm32-unknown-unknown -p moog_saw_wasm --release\" -s \"cp ../../target/wasm32-unknown-unknown/release/moog_saw_wasm.wasm src/lib/moog-saw.wasm\"",
    "dev": "run-p wasm:watch vite",
    "vite": "vite",
    "build": "run-s wasm:build tsc vite:build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "npm-run-all": "^4.1.5",
    "typescript": "~5.6",
    "vite": "^6",
    "cargo-watch": "^8"
  }
}
```

Notes:
- `cargo-watch` as a devDependency is a placeholder; it is normally a cargo
  binary (`cargo install cargo-watch`). The plan must pick a concrete watcher
  (cargo watch binary, or a node-side chokidar wrapper). The convention of
  `run-p` (parallel) and `run-s` (sequential) comes from `npm-run-all`, per the
  article.
- `moog-saw.wasm` is gitignored (built artifact).

### vite.config.ts

Raw C-ABI wasm is imported with Vite's `?url` suffix, so no special wasm
plugin is required:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  // wasm loaded via ?url; demo served from index.html
});
```

### AudioWorkletProcessor (`src/lib/processor.ts`)

```ts
class MoogSawProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'frequency',
      defaultValue: 440,
      minValue: 20,
      maxValue: 20000,
      automationRate: 'a-rate',
    }];
  }

  constructor() {
    super();
    this.exports = null;
    this.memory = null;
    this.oscPtr = 0;
    this.freqBufPtr = 0;
    this.syncBufPtr = 0;
    this.outBufPtr = 0;
    this.ready = false;

    this.port.onmessage = (e) => {
      if (e.data.type === 'init') this.init(e.data);
    };
  }

  async init({ module, sampleRate }) {
    const { instance } = await WebAssembly.instantiate(module);
    this.exports = instance.exports;
    this.memory = instance.exports.memory;
    this.oscPtr = this.exports.moog_saw_create(sampleRate);

    const bufSize = 128 * 4;
    this.freqBufPtr = this.exports.moog_saw_alloc(bufSize);
    this.syncBufPtr = this.exports.moog_saw_alloc(bufSize);
    this.outBufPtr = this.exports.moog_saw_alloc(bufSize);
    this.ready = true;
  }

  process(inputs, outputs, params) {
    if (!this.ready) return true;

    const out = outputs[0][0];
    const freqParam = params.frequency;
    const syncInput = inputs[0]?.[0];

    const freqView = new Float32Array(this.memory.buffer, this.freqBufPtr, 128);
    if (freqParam.length === 1) freqView.fill(freqParam[0]);
    else freqView.set(freqParam.subarray(0, 128));

    if (syncInput) {
      const syncView = new Float32Array(this.memory.buffer, this.syncBufPtr, 128);
      syncView.set(syncInput.subarray(0, 128));
    }

    this.exports.moog_saw_process(
      this.oscPtr,
      this.freqBufPtr,
      syncInput ? this.syncBufPtr : 0,
      this.outBufPtr,
      128,
    );

    const wasmOut = new Float32Array(this.memory.buffer, this.outBufPtr, 128);
    out.set(wasmOut);

    return true;
  }
}

registerProcessor('moog-saw', MoogSawProcessor);
```

Key details:
- **frequency**: AudioParam, `a-rate`, default 440. Copied to WASM memory per
  block.
- **sync**: `inputs[0][0]` copied to WASM memory; null pointer if disconnected.
- **rendering**: `moog_saw_process` full 128-frame blocks. Block-level sync
  detection in core DSP handles sync events.
- **memory**: fixed per-instance buffers reserved once in `init()` via
  `moog_saw_alloc`, wrapped in `Float32Array` views, reused per block. No
  allocation in the realtime path. Each node instantiates its own WASM
  instance, so each has independent buffers and state (multi-oscillator
  support).
- **init timing**: `init()` is async; `process()` returns `true` until init
  completes.

### Main-thread helper (`src/lib/index.ts`)

```ts
import wasmUrl from './moog-saw.wasm?url';

export async function createMoogSawNode(ctx: AudioContext): Promise<AudioWorkletNode> {
  const wasmModule = await WebAssembly.compileStreaming(fetch(wasmUrl));
  const processorUrl = new URL('./processor.ts', import.meta.url);
  await ctx.audioWorklet.addModule(processorUrl);

  const node = new AudioWorkletNode(ctx, 'moog-saw', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  node.port.postMessage({
    type: 'init',
    module: wasmModule,
    sampleRate: ctx.sampleRate,
  });

  return node;
}
```

**Vite/AudioWorklet integration note**: `audioWorklet.addModule()` must load a
standalone module, not the main bundle. In Vite this is done by importing the
processor as a separate module (`new URL('./processor.ts', import.meta.url)`)
so Vite emits it as its own chunk. The plan must verify this specific Vite
behaviour and use the correct mechanism (a separate entry, `import.meta.url`
chunk, or a small build plugin). This is a known integration point that needs
verification during implementation.

### User-facing API

```ts
import { createMoogSawNode } from 'moog-saw';

const ctx = new AudioContext();
const osc = await createMoogSawNode(ctx);
osc.parameters.get('frequency').value = 440;
osc.connect(ctx.destination);
```

## Demo (adapted template)

The template `032-synth-wave-visualizer.html` is ported into Vite as
`web/index.html` + `src/demo/*`. Its synth JS is split into modules:
`synth.ts` (audio graph, voices), `keyboard.ts`, `scope.ts` (oscilloscope +
spectrum).

Adaptations for the moog saw:

- **Waveform selector**: the Saw button uses the moog saw. Sine, Square, and
  Triangle keep native `osc.type`. When Saw is selected, `noteOn` uses the
  moog saw; otherwise native oscillators.
- **Polyphony**: `noteOn(semi)` creates one AudioWorkletNode (plus its WASM
  instance) per active note, cached in `voices[semi]`. All nodes compile/share
  the same `WebAssembly.Module`; each instantiates its own instance.
- **Signal chain**: moog saw node -> shared per-note envelope gain -> shared
  filter (lowpass) -> delay -> analyser. Same as the template's existing chain,
  with the oscillator replaced.
- **noteOff**: release the envelope, then schedule node teardown. The processor
  instance (oscillator state and its fixed buffers) is dropped with the node; a
  `destroy` message handled by the processor `destructor()` frees the WASM
  instance (which reclaims the bump-allocated buffers). There is no per-buffer
  `free`.
- **Sub oscillator, filter knob, delay toggles, oscilloscope, spectrum**:
  unchanged from the template.

The demo is the development/test environment and also serves as a usage
example. It is not part of the published NPM artifact (the library is).

## NPM package (publishable artifact)

The library to publish is `src/lib/*` plus the wasm. `web/package.json` is
`private: true` for now; a separate publishable package.json (or a pre-publish
step) produces the artifact with:

```json
{
  "name": "moog-saw",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "types": "index.d.ts",
  "files": ["index.js", "processor.js", "moog-saw.wasm"]
}
```

The exact publish flow (dist build, package entrypoints, types emission) is
finalised in the implementation plan. The primary deliverable of this spec is
the working library + dev environment; publishing is secondary.

## Build/dev pipeline

- `pnpm install` in `web/`
- `pnpm run dev`: parallel `wasm:watch` (rebuilds Rust -> wasm on change) and
  `vite` (HMR for TS/CSS). Open the served demo page.
- `pnpm run build`: sequential `wasm:build`, `tsc`, `vite build`.
- `pnpm run preview`: serve the built demo.

## Testing strategy

- **Rust tests**: existing `moog_saw` tests keep running via `cargo test` from
  the workspace root. Acts as the DSP correctness reference.
- **WASM build check**: ensure `cargo build --target wasm32-unknown-unknown -p
  moog_saw_wasm` compiles (local + CI).
- **wasm/JS integration**: the demo page exercises the full path (compile ->
  process -> register processor -> play). Manual validation in the browser.
- **CI**: builds both Rust (native test) and the wasm target; runs `pnpm
  install` + `pnpm run build` in `web/` so the TS/processor code is typechecked
  and bundles.

## Scope / limitations

- No anti-aliasing (BLEP/BLAMP). Out of scope for this crate.
- No pitch modulation beyond the frequency AudioParam (a-rate supported).
- No waveform selection inside the processor; the core is saw-only. The demo
  keeps sine/square/tri as native oscillators.
- The processor is mono; the demo is polyphonic via one node per note.
- AudioWorklet support required (all modern browsers).
- Vite's `audioWorklet.addModule` handling of a separate processor chunk must
  be verified during implementation.
