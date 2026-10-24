import { createServer } from "vite";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Build actual compiler output in an isolated test directory; never publish. */
export async function prepareUikitExport(directory: string): Promise<string> {
  const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-uikit-export-e2e", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const load = (name: string) => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
    const { createPrototypeProject } = await load("prototype-project");
    const { createEmptyEntity } = await load("editor-session");
    const { createScriptAsset } = await load("scripting/script-files");
    const { createScriptComponent } = await load("scene-document");
    const { createTextComponent, textComponentPresetInput } = await load("scene-document");
    const { createScriptTemplateSource } = await load("scripting/script-templates");
    const { compileVisualProject } = await load("compiler/compile");
    const bundle = createPrototypeProject("world", "uikit-export-isolated-fixture");
    const empty = createEmptyEntity({ ...bundle.scene, rootEntityIds: [], entities: {} }, null, "UIKit Panel");
    const script = createScriptAsset("script-uikit", "UIKit Panel", "scripts/uikit-panel.tsx", null, "tsx");
    const entity = empty.scene.entities[empty.entityId];
    entity.components[0].position = [0, 1.6, -3];
    entity.components.push(createScriptComponent("component-uikit", script.id));
    const label = createEmptyEntity(empty.scene, null, "Rounded Text");
    label.scene.entities[label.entityId].components[0].position = [-2, 1.6, -3];
    const preset = textComponentPresetInput("panel");
    label.scene.entities[label.entityId].components.push(createTextComponent("component-rounded-text", { ...preset, text: "角丸の案内", fontSize: 0.12, maxWidth: 1.35, background: { ...preset.background, opacity: 1, fit: "fixed", width: 1.6, height: 1.1, borderRadius: 0.16 } }));
    const compiled = compileVisualProject({ project: bundle.project, scenes: { [label.scene.sceneId]: label.scene }, assets: { ...bundle.assets, assets: { ...bundle.assets.assets, [script.id]: script } }, prefabs: bundle.prefabs, scriptSources: { [script.id]: createScriptTemplateSource("uikit-panel", "UIKit Panel") } });
    if (!compiled.canStage) throw new Error(JSON.stringify(compiled.diagnostics));
    for (const file of compiled.overlayFiles as { relativePath: string; content: string }[]) {
      const target = join(directory, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    for (const copy of compiled.stagingPlan.bundledAssetCopyPlan as { source: string; sourceFileName: string; targetRelativePath: string }[]) {
      if (copy.source !== "text-fonts") continue;
      const target = join(directory, copy.targetRelativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(process.cwd(), "node_modules/@fontsource/noto-sans-jp/files", copy.sourceFileName), target);
    }
    return join(directory, "src/World.tsx");
  } finally { await server.close(); }
}
