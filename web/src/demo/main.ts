import "./style.css";
import { Synth, type Wave } from "./synth";
import { buildKeyboard } from "./keyboard";
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

/* ---- keyboard ---- */
const kb = buildKeyboard(
  kbEl,
  (semi) => {
    synth.setOctaveOffset(kb.octave() - 4);
    synth.noteOn(semi);
    ensureAudioOnce();
  },
  (semi) => {
    if (semi === -1) {
      // allOff sentinel from keyboard Z/X
      synth.allOff();
    } else {
      synth.noteOff(semi);
    }
  },
);

/* ---- waveform selector ---- */
const waveBtns = wavesEl.querySelectorAll("button");
let currentWave: Wave = "sine";

waveBtns.forEach((b) => {
  b.addEventListener("click", () => {
    ensureAudioOnce();
    waveBtns.forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    currentWave = (b.getAttribute("data-wave") as Wave) || "sine";
    synth.setWave(currentWave);
  });
});

/* ---- filter knob ---- */
const MIN = 80;
const MAX = 12000;
let cutoff = 4000;

function cutoffToPos(f: number): number {
  return Math.log(f / MIN) / Math.log(MAX / MIN);
}
function posToCutoff(p: number): number {
  return MIN * Math.pow(MAX / MIN, Math.min(1, Math.max(0, p)));
}
function renderKnob() {
  const p = cutoffToPos(cutoff);
  knobEl.style.setProperty("--rot", (-135 + p * 270) + "deg");
  knobRing.style.setProperty("--pct", (p * 75) + "%");
  knobEl.setAttribute("aria-valuenow", String(Math.round(cutoff)));
  const firstChild = knobVal.firstChild;
  if (firstChild) {
    firstChild.textContent =
      cutoff >= 1000
        ? (cutoff / 1000).toFixed(1) + "k"
        : String(Math.round(cutoff));
  }
  synth.setCutoff(cutoff);
}

let dragY: number | null = null;
let dragPos = 0;

knobEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  knobEl.setPointerCapture(e.pointerId);
  dragY = e.clientY;
  dragPos = cutoffToPos(cutoff);
  ensureAudioOnce();
});

knobEl.addEventListener("pointermove", (e) => {
  if (dragY === null) return;
  const dy = dragY - e.clientY;
  cutoff = posToCutoff(dragPos + dy / 180);
  renderKnob();
});

knobEl.addEventListener("pointerup", () => {
  dragY = null;
});

knobEl.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    cutoff = posToCutoff(cutoffToPos(cutoff) - Math.sign(e.deltaY) * 0.04);
    renderKnob();
  },
  { passive: false },
);

knobEl.addEventListener("keydown", (e) => {
  let step = 0;
  if (e.key === "ArrowUp" || e.key === "ArrowRight") step = 0.04;
  if (e.key === "ArrowDown" || e.key === "ArrowLeft") step = -0.04;
  if (step) {
    e.preventDefault();
    cutoff = posToCutoff(cutoffToPos(cutoff) + step);
    renderKnob();
  }
});

renderKnob();

/* ---- toggles ---- */
function wireToggle(id: string, cb: (on: boolean) => void): void {
  const t = document.getElementById(id)!;
  function flip() {
    const on = !t.classList.contains("on");
    t.classList.toggle("on", on);
    t.setAttribute("aria-checked", on ? "true" : "false");
    ensureAudioOnce();
    cb(on);
  }
  t.addEventListener("click", flip);
  t.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      flip();
    }
  });
}

wireToggle("delayToggle", (on) => synth.setDelay(on));
wireToggle("glideToggle", (on) => synth.setSubState(on));

/* ---- audio unlock on first gesture ---- */
let audioUnlocked = false;
function ensureAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  synth.unlock();
}

document.addEventListener("pointerdown", () => ensureAudioOnce(), {
  once: true,
});

/* ---- visualizer ---- */
runVisualizers(
  scopeCanvas,
  specCanvas,
  () => synth.analyserRef,
  () => kb.octave(),
  () => currentWave,
);
