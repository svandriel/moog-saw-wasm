import { createMoogSawNode } from "../lib/index";

export type Wave = "sine" | "sawtooth" | "square" | "triangle";

interface Voice {
  output: AudioNode;
  env: GainNode;
  sub?: OscillatorNode;
  stop: () => void;
}

export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private dry!: GainNode;
  private delay!: DelayNode;
  private delayWet!: GainNode;
  private wave: Wave = "sine";
  private cutoff = 4000;
  private voices: Record<number, Voice> = {};

  // Guard: set to true while a moog voice is being created for a semi.
  private starting: Record<number, boolean> = {};
  // Generation token per semi so a stale in-flight compile for a released note
  // can be told apart from a newer noteOn for the same semi.
  private gen: Record<number, number> = {};
  private _octaveOffset = 0;

  get analyserRef(): AnalyserNode | null {
    return this.analyser ?? null;
  }

  get currentWave(): Wave {
    return this.wave;
  }

  setOctaveOffset(o: number) {
    this._octaveOffset = o;
  }

  // Public unlock: creates the AudioContext + graph so a first-gesture click
  // (without any key press) brings audio live, matching the template.
  unlock(): void {
    this.ensureAudio();
  }

  private ensureAudio(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = this.cutoff;
    this.filter.Q.value = 3;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;

    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.32;

    const feedback = ctx.createGain();
    feedback.gain.value = 0.42;

    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0;

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;

    const comp = ctx.createDynamicsCompressor();

    this.filter.connect(this.dry);
    this.dry.connect(this.master);

    this.filter.connect(this.delay);
    this.delay.connect(feedback);
    feedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.master);

    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.classList.add("live");
      const span = statusEl.querySelector("span");
      if (span) span.textContent = "Audio live · " + Math.round(ctx.sampleRate / 1000) + " kHz";
    }
  }

  setWave(w: Wave): void {
    this.wave = w;
    this.allOff();
  }

  setCutoff(f: number): void {
    this.cutoff = f;
    if (this.ctx)
      this.filter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.02);
  }

  setDelay(on: boolean): void {
    if (this.ctx)
      this.delayWet.gain.setTargetAtTime(
        on ? 0.5 : 0,
        this.ctx.currentTime,
        0.05,
      );
  }

  private _subOn = false;
  get subOn(): boolean {
    return this._subOn;
  }
  setSubState(on: boolean) {
    this._subOn = on;
  }

  async noteOn(semi: number): Promise<void> {
    if (this.voices[semi] || this.starting[semi]) return;
    this.ensureAudio();
    if (!this.ctx) return;

    this.starting[semi] = true;
    const token = (this.gen[semi] = (this.gen[semi] ?? 0) + 1);
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.wave === "sawtooth") {
      // Moog saw voice: async AudioWorkletNode creation
      try {
        const node = await createMoogSawNode(ctx);
        // Abandon if the key was released mid-compile (starting cleared) or a
        // newer noteOn for the same semi took over (token changed).
        if (!this.starting[semi] || this.gen[semi] !== token) {
          node.disconnect();
          return;
        }
        node.parameters.get("frequency")!.value = freqOf(semi, this._octaveOffset);

        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, now);
        env.gain.exponentialRampToValueAtTime(0.35, now + 0.012);
        env.gain.exponentialRampToValueAtTime(0.22, now + 0.25);

        node.connect(env);
        env.connect(this.filter);

        let sub: OscillatorNode | undefined;
        if (this._subOn) {
          sub = ctx.createOscillator();
          sub.type = "sine";
          sub.frequency.value = freqOf(semi, this._octaveOffset) / 2;
          const subG = ctx.createGain();
          subG.gain.value = 0.5;
          sub.connect(subG);
          subG.connect(env);
          sub.start(now);
        }

        const voice: Voice = {
          output: node,
          env,
          sub,
          stop: () => {
            node.disconnect();
            if (sub) {
              try { sub.stop(); } catch {}
            }
          },
        };
        this.voices[semi] = voice;
      } catch {
        // Worklet creation failed; no voice was added, so the finally block
        // clearing the starting guard is the only cleanup needed.
      } finally {
        this.starting[semi] = false;
      }
    } else {
      // Native oscillator voice
      const osc = ctx.createOscillator();
      osc.type = this.wave;
      osc.frequency.value = freqOf(semi, this._octaveOffset);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.35, now + 0.012);
      env.gain.exponentialRampToValueAtTime(0.22, now + 0.25);

      osc.connect(env);
      env.connect(this.filter);
      osc.start(now);

      let sub: OscillatorNode | undefined;
      if (this._subOn) {
        sub = ctx.createOscillator();
        sub.type = "sine";
        sub.frequency.value = freqOf(semi, this._octaveOffset) / 2;
        const subG = ctx.createGain();
        subG.gain.value = 0.5;
        sub.connect(subG);
        subG.connect(env);
        sub.start(now);
      }

      this.voices[semi] = {
        output: osc,
        env,
        sub,
        stop: () => {
          try { osc.stop(); } catch {}
          if (sub) {
            try { sub.stop(); } catch {}
          }
        },
      };
      this.starting[semi] = false;
    }
  }

  noteOff(semi: number): void {
    // Clear the starting guard even when the voice has not been created yet, so
    // a compile in flight for a released note is abandoned on arrival.
    if (this.starting[semi]) this.starting[semi] = false;

    const v = this.voices[semi];
    if (!v) return;
    delete this.voices[semi];

    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;

    v.env.gain.cancelScheduledValues(now);
    v.env.gain.setValueAtTime(v.env.gain.value, now);
    v.env.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    const delayMs = 400;
    setTimeout(() => v.stop(), delayMs);
  }

  allOff(): void {
    const keys = Object.keys(this.voices).map(Number);
    for (const semi of keys) {
      this.noteOff(semi);
    }
  }
}

export function freqOf(semi: number, octaveOffset: number): number {
  return 261.6256 * 2 ** ((semi + octaveOffset * 12) / 12);
}
