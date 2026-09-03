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

