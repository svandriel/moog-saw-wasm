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
  const whites = NOTES.filter((n) => !n.black);
  container.style.setProperty("--n", String(whites.length));

  const keyEls: Record<number, HTMLElement> = {};
  const keyMap: Record<string, number> = {};
  let octave = 4;

  NOTES.forEach((note) => {
    const el = document.createElement("div");
    el.className = "key" + (note.black ? " black" : "");
    el.textContent = note.k.toUpperCase();
    el.setAttribute("data-semi", String(note.semi));
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", note.n);
    if (note.black) {
      const idx = whites.findIndex((w) => w.semi > note.semi);
      const pct = (idx / whites.length) * 100;
      el.style.left =
        "calc(12px + (100% - 24px) * " + pct / 100 + ")";
    }
    container.appendChild(el);
    keyEls[note.semi] = el;
    keyMap[note.k] = note.semi;
  });

  function highlightOn(semi: number) {
    const k = keyEls[semi];
    if (k) k.classList.add("down");
  }
  function highlightOff(semi: number) {
    const k = keyEls[semi];
    if (k) k.classList.remove("down");
  }

  function allOff() {
    for (const s of Object.keys(keyMap)) {
      highlightOff(keyMap[s]);
    }
    onNoteOff(-1); // sentinel handled by synth
  }

  /* pointer input on keys */
  let pointerDown = false;
  let pointerSemi: number | null = null;

  container.addEventListener("pointerdown", (e) => {
    const k = (e.target as HTMLElement).closest(".key") as HTMLElement | null;
    if (!k) return;
    e.preventDefault();
    pointerDown = true;
    pointerSemi = Number(k.getAttribute("data-semi"));
    highlightOn(pointerSemi);
    onNoteOn(pointerSemi);
  });

  container.addEventListener("pointermove", (e) => {
    if (!pointerDown) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const k = t && t.closest ? t.closest(".key") as HTMLElement | null : null;
    const s = k ? Number(k.getAttribute("data-semi")) : null;
    if (s !== pointerSemi) {
      if (pointerSemi !== null) {
        highlightOff(pointerSemi);
        onNoteOff(pointerSemi);
      }
      pointerSemi = s;
      if (s !== null) {
        highlightOn(s);
        onNoteOn(s);
      }
    }
  });

  function release() {
    pointerDown = false;
    if (pointerSemi !== null) {
      highlightOff(pointerSemi);
      onNoteOff(pointerSemi);
      pointerSemi = null;
    }
  }
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  /* keyboard input */
  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k in keyMap) {
      e.preventDefault();
      highlightOn(keyMap[k]);
      onNoteOn(keyMap[k]);
    } else if (k === "z") {
      allOff();
      octave = Math.max(1, octave - 1);
    } else if (k === "x") {
      allOff();
      octave = Math.min(7, octave + 1);
    }
  });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k in keyMap) {
      highlightOff(keyMap[k]);
      onNoteOff(keyMap[k]);
    }
  });

  window.addEventListener("blur", () => {
    for (const s of Object.keys(keyMap)) {
      highlightOff(keyMap[s]);
    }
    allOff();
  });

  return {
    setOctave: (o: number) => {
      octave = o;
    },
    octave: () => octave,
    allOff,
  };
}
