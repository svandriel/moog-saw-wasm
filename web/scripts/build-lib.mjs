import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web");
const lib = join(root, "src", "lib");
const tscSrc = join(root, "dist-lib-tsc-src");
const tscOut = join(root, "dist-lib-tsc");
const out = join(root, "dist-lib");

rmSync(tscSrc, { recursive: true, force: true });
rmSync(tscOut, { recursive: true, force: true });
rmSync(out, { recursive: true, force: true });
mkdirSync(tscSrc, { recursive: true });
mkdirSync(out, { recursive: true });

// index.ts uses the Vite-only `?url` import, which plain tsc cannot resolve
// and would reject. Rewrite that one construct (plus the processor module
// reference) to plain relative ESM URLs in a scratch copy, then let tsc emit
// both index.js and processor.js plus their declarations. index.ts otherwise
// contains only type annotations, so tsc is the only step that strips them.
let index = readFileSync(join(lib, "index.ts"), "utf8");
index = index.replace(
  'import wasmUrl from "./moog-saw.wasm?url";',
  'const wasmUrl = new URL("./moog-saw.wasm", import.meta.url);',
);
index = index.replace('"./processor.ts"', '"./processor.js"');
writeFileSync(join(tscSrc, "index.ts"), index);
cpSync(join(lib, "processor.ts"), join(tscSrc, "processor.ts"));
cpSync(join(lib, "lib-env.d.ts"), join(tscSrc, "lib-env.d.ts"));

execSync("tsc -p tsconfig.lib.json", { cwd: root, stdio: "inherit" });

cpSync(join(tscOut, "index.js"), join(out, "index.js"));
cpSync(join(tscOut, "index.d.ts"), join(out, "index.d.ts"));
cpSync(join(tscOut, "processor.js"), join(out, "processor.js"));
cpSync(join(lib, "moog-saw.wasm"), join(out, "moog-saw.wasm"));

const pkg = {
  name: "moog-saw",
  version: "0.1.0",
  type: "module",
  main: "index.js",
  module: "index.js",
  types: "index.d.ts",
  files: ["index.js", "processor.js", "index.d.ts", "moog-saw.wasm"],
};
writeFileSync(join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

rmSync(tscSrc, { recursive: true, force: true });
rmSync(tscOut, { recursive: true, force: true });
console.log("lib built ->", out);
