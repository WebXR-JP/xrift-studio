import { createRoot } from "react-dom/client";
import { WaterShaderStore } from "../src/components/visual-editor/WaterShaderStore";

let settle: ((fail: boolean) => void) | undefined;
export function finishInstall(fail: boolean) { settle?.(fail); }
export function mountWaterStore() {
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;display:flex;background:white";
  document.body.append(host);
  createRoot(host).render(<WaterShaderStore wind={{ direction: [1, 0], speed: 1, turbulence: 0.25 }}
    onAdd={() => new Promise((resolve, reject) => {
      settle = (fail) => fail ? reject(new Error("Test install failed")) : resolve({ alreadyInstalled: false });
    })} />);
}
