// Emit the actual publication source for browser rendering parity checks.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
const fixtureHooks = fs.readFileSync("scripts/run-authoring-fixtures.cjs", "utf8");
eval(fixtureHooks.slice(0, fixtureHooks.indexOf("(async () => {")));
(async () => {
  const { createPrototypeProject } = await import(pathToFileURL(path.resolve("src/lib/visual-editor/prototype-project.ts")).href);
  const { normalizeMaterialProperties } = await import(pathToFileURL(path.resolve("src/lib/visual-editor/asset-manifest.ts")).href);
  const { compileVisualProject } = await import(pathToFileURL(path.resolve("src/lib/visual-editor/compiler/compile.ts")).href);
  const project = createPrototypeProject("world", "mtoon-render-parity");
  const material = {
    id: "mtoon-parity", name: "MToon parity", kind: "material", status: "ready", source: { kind: "document" },
    properties: normalizeMaterialProperties({ vertexColors: true, pbrMetallicRoughness: { baseColorFactor: [0.25, 0.5, 0.75, 1] },
      extensions: { VRMC_materials_mtoon: { shadeColorFactor: [0.03, 0.15, 0.25], shadingToonyFactor: 0.9,
        outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.08, outlineColorFactor: [1, 0, 0], outlineLightingMixFactor: 0 } } }),
  };
  project.assets.assets[material.id] = material;
  for (const entity of Object.values(project.scene.entities)) {
    for (const component of entity.components) {
      if (component.type === "mesh") component.materialBindings = [{ slot: "default", materialAssetId: material.id }];
    }
  }
  const output = compileVisualProject({ project: project.project, assets: project.assets, scenes: { [project.scene.sceneId]: project.scene }, prefabs: project.prefabs });
  if (!output.canStage) throw new Error(JSON.stringify(output.diagnostics));
  const root = path.resolve("node_modules/.cache/xrift-studio/mtoon-render-parity");
  for (const file of output.overlayFiles) {
    if (!/\.(ts|tsx|js)$/.test(file.relativePath)) continue;
    const target = path.join(root, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let source = file.content;
    if (file.relativePath === "src/World.tsx") {
      const componentName = /const (CompiledMaterial_mtoon_parity_\w+):/.exec(source)?.[1];
      if (!componentName) throw new Error("Published MToon component not emitted");
      // Execute the exact emitted material declarations. World-only imports
      // initialize unrelated remote fonts even when World is never mounted.
      const properties = /^const MTOON_PROPERTIES_mtoon_parity_.*;$/m.exec(source)?.[0];
      const component = /^const CompiledMaterial_mtoon_parity_[\s\S]*?^};/m.exec(source)?.[0];
      const propsType = /^type CompiledMaterialProps = .*;$/m.exec(source)?.[0];
      if (!properties || !component || !propsType) throw new Error("Published material declarations unavailable");
      source = 'import { XriftMToonMaterial, type MToonSurfaceProperties } from "./xrift-studio/mtoon-material";\nimport type { FC } from "react";\n' + [properties, propsType, component].join("\n");
      source += `\nexport { ${componentName} as PublishedMToonMaterial };\nexport const parityMaterial = ${JSON.stringify(material)};\n`;
    }
    fs.writeFileSync(target, source);
  }
  console.log("Prepared actual published MToon component for render parity");
})().catch(error => { console.error(error); process.exitCode = 1; });
