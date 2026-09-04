export function runVisualizers(
  scopeCanvas: HTMLCanvasElement,
  specCanvas: HTMLCanvasElement,
  analyserRef: () => AnalyserNode | null,
  octaveRef: () => number,
  waveRef: () => string,
): () => void {
  const sctx = scopeCanvas.getContext("2d")!;
  const pctx = specCanvas.getContext("2d")!;
  const timeData = new Float32Array(2048);
  const freqData = new Uint8Array(1024);
  let fakePhase = 0;

  function fit(c: HTMLCanvasElement): { w: number; h: number; dpr: number } {
    const r = (c.parentNode as HTMLElement).getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return { w, h, dpr };
  }

  function waveFn(t: number, wave: string): number {
    const x = t % 1;
    if (wave === "sine") return Math.sin(x * Math.PI * 2);
    if (wave === "sawtooth") return x * 2 - 1;
    if (wave === "square") return x < 0.5 ? 1 : -1;
    return 1 - Math.abs(x * 4 - 2);
  }

  function drawScope() {
    const d = fit(scopeCanvas);
    const { w, h, dpr } = d;
    sctx.clearRect(0, 0, w, h);

    // Grid lines
    sctx.strokeStyle = "rgba(183,139,255,.08)";
    sctx.lineWidth = 1;
    for (let g = 1; g < 8; g++) {
      sctx.beginPath();
      sctx.moveTo((w * g) / 8, 0);
      sctx.lineTo((w * g) / 8, h);
      sctx.stroke();
    }
    sctx.beginPath();
    sctx.moveTo(0, h / 2);
    sctx.lineTo(w, h / 2);
    sctx.stroke();

    const analyser = analyserRef();
    const active = analyser !== null;
    if (analyser) analyser.getFloatTimeDomainData(timeData);

    const grad = sctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#ff2d95");
    grad.addColorStop(0.5, "#b78bff");
    grad.addColorStop(1, "#2de2ff");

    sctx.lineWidth = 2.2 * dpr;
    sctx.lineJoin = "round";
    sctx.shadowBlur = 18 * dpr;
    sctx.shadowColor = "rgba(255,45,149,.6)";
    sctx.strokeStyle = grad;
    sctx.beginPath();

    // Find index of first zero crossing
    let start = 0;
    for (let i = 1; i < timeData.length / 2; i++) {
      if (timeData[i - 1] < 0 && timeData[i] >= 0) {
        start = i;
        break;
      }
    }
    const n = Math.min(timeData.length - start, 1024);
    for (let i = 0; i < n; i++) {
      let v: number;
      if (analyser && active) {
        v = timeData[i + start] * 1.6;
      } else {
        v =
          waveFn((i / n) * 3 + fakePhase, waveRef()) *
          0.22 *
          (0.7 + 0.3 * Math.sin(fakePhase * 4));
      }
      const x = (i / (n - 1)) * w;
      const y = h / 2 - (v * h) / 2;
      if (i === 0) sctx.moveTo(x, y);
      else sctx.lineTo(x, y);
    }
    sctx.stroke();
    sctx.shadowBlur = 0;
    fakePhase += 0.004;
  }

  function drawSpec() {
    const d = fit(specCanvas);
    const { w, h, dpr } = d;
    pctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.26;
    const bars = 96;

    const analyser = analyserRef();
    if (analyser) analyser.getByteFrequencyData(freqData);

    const t = performance.now() / 1000;

    // Ring
    pctx.strokeStyle = "rgba(45,226,255,.15)";
    pctx.lineWidth = 1;
    pctx.beginPath();
    pctx.arc(cx, cy, R - 6 * dpr, 0, Math.PI * 2);
    pctx.stroke();

    // Bars
    for (let i = 0; i < bars; i++) {
      let mag: number;
      if (analyser) {
        const bin = Math.floor(Math.pow(i / bars, 1.8) * 300) + 1;
        mag = freqData[bin] / 255;
      } else {
        mag =
          0.08 +
          0.06 * Math.sin(t * 2 + i * 0.35) * Math.sin(t * 0.7 + i * 0.1);
        mag = Math.max(0, mag);
      }
      const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const len = mag * R * 1.7 + 3 * dpr;
      const x0 = cx + Math.cos(a) * R;
      const y0 = cy + Math.sin(a) * R;
      const x1 = cx + Math.cos(a) * (R + len);
      const y1 = cy + Math.sin(a) * (R + len);

      const g = pctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "#2de2ff");
      g.addColorStop(0.55, "#b78bff");
      g.addColorStop(1, "#ff2d95");
      pctx.strokeStyle = g;
      pctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * R) / bars) * 0.55);
      pctx.lineCap = "round";
      pctx.shadowBlur = 10 * dpr * mag;
      pctx.shadowColor = "rgba(255,45,149,.8)";
      pctx.beginPath();
      pctx.moveTo(x0, y0);
      pctx.lineTo(x1, y1);
      pctx.stroke();
    }
    pctx.shadowBlur = 0;

    // Core glow
    let avg = 0;
    if (analyser) {
      for (let j = 0; j < 64; j++) avg += freqData[j];
      avg = avg / 64 / 255;
    } else {
      avg = 0.08 + 0.03 * Math.sin(t * 1.5);
    }
    const core = pctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.8);
    core.addColorStop(0, `rgba(255,45,149,${0.35 + avg * 0.6})`);
    core.addColorStop(0.6, "rgba(183,139,255,.12)");
    core.addColorStop(1, "rgba(0,0,0,0)");
    pctx.fillStyle = core;
    pctx.beginPath();
    pctx.arc(cx, cy, R * 0.8, 0, Math.PI * 2);
    pctx.fill();

    // Labels
    pctx.fillStyle = "rgba(239,230,255,.85)";
    pctx.font = 11 * dpr + "px ui-monospace, Menlo, monospace";
    pctx.textAlign = "center";
    pctx.textBaseline = "middle";
    pctx.fillText("OCT " + octaveRef(), cx, cy - 8 * dpr);
    pctx.fillStyle = "rgba(183,139,255,.7)";
    pctx.fillText(waveRef().toUpperCase(), cx, cy + 10 * dpr);
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf: number;

  function loop() {
    drawScope();
    drawSpec();
    if (reduced && !analyserRef()) {
      setTimeout(() => {
        raf = requestAnimationFrame(loop);
      }, 120);
    } else {
      raf = requestAnimationFrame(loop);
    }
  }
  loop();

  window.addEventListener("resize", () => {
    fit(scopeCanvas);
    fit(specCanvas);
  });

  return () => cancelAnimationFrame(raf);
}
