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

  private async init(data: { bytes: ArrayBuffer; sampleRate: number }) {
    const { instance } = await WebAssembly.instantiate(data.bytes);
    this.exports = instance.exports;
    this.memory = instance.exports.memory as unknown as WebAssembly.Memory;
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
