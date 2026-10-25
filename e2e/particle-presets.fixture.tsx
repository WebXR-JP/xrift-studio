import { createRoot } from "react-dom/client";
import { ParticlePresetStore } from "../src/components/visual-editor/ParticlePresetStore";
import { createDefaultParticleAsset } from "../src/lib/visual-editor/particle-system";
import type { ParticleAsset } from "../src/lib/visual-editor/asset-manifest";
import { prepareParticlePresetTexture } from "../src/lib/visual-editor/particle-preset-textures";
import { createPrototypeProject } from "../src/lib/visual-editor/prototype-project";

let settle: ((fail: boolean) => Promise<void>) | undefined;
export let installed: ParticleAsset | null = null;
export let placed = false;
export const writtenFiles: Record<string, string> = {};
export let installedAssets = createPrototypeProject("world", "particle-texture-test").assets;
export async function finishInstall(fail: boolean) { await settle?.(fail); }
export function mountParticleStore() {
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;display:flex;background:white";
  document.body.append(host);
  createRoot(host).render(<ParticlePresetStore onAdd={(preset, placeInScene) => {
    return new Promise((resolve, reject) => {
      settle = async fail => {
        if (fail) return reject(new Error("Test install failed"));
        try {
        const prepared = await prepareParticlePresetTexture(installedAssets, preset, {
          textureId: `test-texture-${preset.id}`, writeFile: async (path, dataUrl) => { writtenFiles[path] = dataUrl; },
        });
        installedAssets = prepared.assets;
        installed = JSON.parse(JSON.stringify(createDefaultParticleAsset({ id: "test-particle", name: preset.name, properties: prepared.preset.properties })));
        placed = placeInScene;
        resolve({ assetName: preset.name, placed });
        } catch (error) { reject(error); }
      };
    });
  }} />);
}
