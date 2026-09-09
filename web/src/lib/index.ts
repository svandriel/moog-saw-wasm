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
  const wasmBytes = await (await fetch(wasmUrl)).arrayBuffer();
  await ensureProcessorModule(ctx);

  const node = new AudioWorkletNode(ctx, "moog-saw", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  node.port.postMessage({
    type: "init",
    bytes: wasmBytes,
    sampleRate: ctx.sampleRate,
  });

  return node;
}

