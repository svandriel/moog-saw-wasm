# WebAssembly + AudioWorklet Design

## Goal

Package the Moog Saw oscillator as an NPM package that ships a ready-made
`AudioWorkletProcessor`. Users install the package, call one helper function,
and get a connected audio node.

## Decisions

- **Workspace layout**: Cargo workspace with two member crates.
- **WASM crate**: Plain cdylib with C-ABI exports (no wasm-bindgen). The
  existing FFI functions in `moog_saw::ffi` are re-exported.
- **AudioWorklet loading**: Main thread compiles WASM with
  `WebAssembly.compileStreaming`, passes the `WebAssembly.Module` to the
  processor via `postMessage`. Processor instantiates the module directly.
- **NPM package**: WASM binary + AudioWorkletProcessor JS + main-thread helper.
- **AudioWorklet API**: frequency AudioParam + sync audio input.

## Workspace structure

```
moogsaw/
  Cargo.toml              # workspace root
  moog_saw/               # core lib (existing code, moved here)
    Cargo.toml
    src/lib.rs
    src/ffi.rs
    tests/
  moog_saw_wasm/          # WASM cdylib (C-ABI exports)
    Cargo.toml
    src/lib.rs
  js/
    processor.js          # AudioWorkletProcessor
    index.js              # main-thread helper
  pkg/                    # build output (gitignored)
  package.json            # NPM package manifest
```

Root `Cargo.toml` becomes:

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

The WASM crate re-exports the C-ABI functions from `moog_saw::ffi` and
provides a `malloc` for the JS side to allocate WASM memory:

```rust
#![no_std]
extern crate alloc;

// Provide a global allocator for wasm32-unknown-unknown
// (the ffi module needs Box/alloc)
mod allocator {
    // wee_alloc or dlmalloc for WASM
}

// Re-export all C-ABI functions from the core FFI
pub use moog_saw::ffi::*;

// Expose malloc for JS-side memory allocation in the AudioWorkletProcessor
#[unsafe(no_mangle)]
pub extern "C" fn malloc(size: usize) -> *mut u8 {
    let layout = core::alloc::Layout::from_size_align(size, 8).unwrap();
    unsafe { alloc::alloc(layout) }
}

#[unsafe(no_mangle)]
pub extern "C" fn free(ptr: *mut u8, size: usize) {
    let layout = core::alloc::Layout::from_size_align(size, 8).unwrap();
    unsafe { alloc::dealloc(ptr, layout) }
}
```

The core FFI already exports:
- `moog_saw_create(sample_rate: f64) -> *mut MoogSaw`
- `moog_saw_destroy(osc: *mut MoogSaw)`
- `moog_saw_reset(osc: *mut MoogSaw, phase: f64)`
- `moog_saw_set_frequency(osc: *mut MoogSaw, frequency_hz: f32)`
- `moog_saw_process(osc, frequency, sync, output, frames)`
- `moog_saw_process_sample(osc, frequency_hz, sync_event, event_offset, output)`

No wasm-bindgen. No wasm-pack. The WASM binary is built with:
```
cargo build --target wasm32-unknown-unknown -p moog_saw_wasm --release
```

## AudioWorkletProcessor (`js/processor.js`)

Runs in the AudioWorklet global scope. Receives a compiled `WebAssembly.Module`
via `postMessage` from the main thread, instantiates it in the constructor,
and renders audio in `process()`.

The processor uses raw C-ABI WASM exports and manages WASM linear memory
directly:

```js
class MoogSawProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
        ];
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
            if (e.data.type === 'init') {
                this.init(e.data);
            }
        };
    }

    async init({ module, sampleRate }) {
        const { instance } = await WebAssembly.instantiate(module);
        this.exports = instance.exports;
        this.memory = instance.exports.memory;

        this.oscPtr = this.exports.moog_saw_create(sampleRate);

        // Allocate buffers (128 frames = render quantum)
        const bufSize = 128 * 4;
        this.freqBufPtr = this.exports.malloc(bufSize);
        this.syncBufPtr = this.exports.malloc(bufSize);
        this.outBufPtr = this.exports.malloc(bufSize);

        this.ready = true;
    }

    process(inputs, outputs, params) {
        if (!this.ready) return true;

        const out = outputs[0][0];
        const freqParam = params.frequency;
        const syncInput = inputs[0]?.[0];

        // Always write frequency to WASM memory (handles both a-rate and k-rate)
        const freqView = new Float32Array(this.memory.buffer, this.freqBufPtr, 128);
        if (freqParam.length === 1) {
            freqView.fill(freqParam[0]);
        } else {
            freqView.set(freqParam.subarray(0, 128));
        }

        // Write sync input to WASM memory
        if (syncInput) {
            const syncView = new Float32Array(this.memory.buffer, this.syncBufPtr, 128);
            syncView.set(syncInput.subarray(0, 128));
        }

        // Call moog_saw_process
        this.exports.moog_saw_process(
            this.oscPtr,
            this.freqBufPtr,
            syncInput ? this.syncBufPtr : 0,
            this.outBufPtr,
            128,
        );

        // Read output from WASM memory
        const wasmOut = new Float32Array(this.memory.buffer, this.outBufPtr, 128);
        out.set(wasmOut);

        return true; // keep alive
    }
}

registerProcessor('moog-saw', MoogSawProcessor);
```

Key details:

- **frequency**: AudioParam declared with `defaultValue: 440`, `automationRate: 'a-rate'`. Always copied to WASM memory (handles both a-rate and k-rate uniformly).
- **sync**: Audio input. `inputs[0][0]` copied to WASM memory. Null pointer passed if no input connected.
- **rendering**: Uses `moog_saw_process()` for full 128-frame blocks. The existing block-level sync detection in the core DSP handles sync events.
- **memory**: All buffers are allocated once in `init()` and reused per block.
- **init timing**: `init()` is async (WASM instantiation). `process()` returns `true` (keep alive) until init completes, then processes normally.

## Main-thread helper (`js/index.js`)

Handles WASM compilation, processor registration, and node creation:

```js
export async function createMoogSawNode(audioContext) {
    // 1. Fetch and compile WASM module
    const wasmUrl = new URL('./moog_saw_wasm_bg.wasm', import.meta.url);
    const wasmModule = await WebAssembly.compileStreaming(fetch(wasmUrl));

    // 2. Register processor
    const processorUrl = new URL('./processor.js', import.meta.url);
    await audioContext.audioWorklet.addModule(processorUrl);

    // 3. Create AudioWorkletNode
    const node = new AudioWorkletNode(audioContext, 'moog-saw', {
        numberOfInputs: 1,   // sync
        numberOfOutputs: 1,
        outputChannelCount: [1],
    });

    // 4. Send compiled module to processor
    node.port.postMessage({
        type: 'init',
        module: wasmModule,
        sampleRate: audioContext.sampleRate,
    });

    return node;
}
```

### User-facing API

```js
import { createMoogSawNode } from 'moog-saw';

const ctx = new AudioContext();
const osc = await createMoogSawNode(ctx);
osc.parameters.get('frequency').value = 440;
osc.connect(ctx.destination);
```

## NPM package structure

What ships in the NPM package:

```
pkg/
  package.json            # name: "moog-saw"
  moog_saw_wasm_bg.wasm   # WASM binary (cargo build output)
  index.js                # main entry (createMoogSawNode)
  processor.js            # AudioWorkletProcessor
```

`package.json`:

```json
{
  "name": "moog-saw",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["*.js", "*.wasm"]
}
```

## Build pipeline

1. `cargo build --target wasm32-unknown-unknown -p moog_saw_wasm --release`
2. Copy `target/wasm32-unknown-unknown/release/moog_saw_wasm.wasm`
   to `pkg/moog_saw_wasm_bg.wasm`
3. Copy `js/processor.js` and `js/index.js` into `pkg/`
4. `npm publish` from `pkg/`

A build script or Makefile orchestrates steps 1-3.

## Testing strategy

- **Rust tests**: Existing `moog_saw` tests continue to run unchanged via
  `cargo test`. The WASM crate gets a basic build-time check (it compiles).
- **WASM build check**: CI runs `cargo build --target wasm32-unknown-unknown`
  to verify the WASM crate compiles.
- **Manual/integration**: A small HTML demo page that loads the NPM package
  and plays the oscillator. Not automated, but committed as a reference.

## Scope / limitations

- No anti-aliasing (BLEP/BLAMP). Out of scope for this crate.
- No pitch modulation beyond the frequency AudioParam.
- No waveform selection (saw only).
- The processor is mono. Stereo would require two instances.
- AudioWorklet support required (all modern browsers).
