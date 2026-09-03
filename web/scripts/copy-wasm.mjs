import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = join(
  root,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "moog_saw_wasm.wasm",
);
const dest = join(root, "web", "src", "lib", "moog-saw.wasm");
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("copied wasm ->", dest);
