import "./style.css";
import { createMoogSawNode } from "../lib/index";

async function bootstrap() {
  const ctx = new AudioContext();
  let armed = false;

  async function play() {
    const node = await createMoogSawNode(ctx);
    node.parameters.get("frequency")!.value = 440;
    node.connect(ctx.destination);
  }

  window.addEventListener("pointerdown", async () => {
    if (armed) return;
    armed = true;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    await play();
  });
}

bootstrap();
