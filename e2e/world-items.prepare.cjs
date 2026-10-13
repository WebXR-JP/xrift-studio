const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
process.env.XRIFT_TYPESCRIPT_PATH = "typescript-test-api";
const hooks = fs.readFileSync("scripts/run-authoring-fixtures.cjs", "utf8");
eval(hooks.slice(0, hooks.indexOf("(async () => {")));
(async () => {
  const load = (file) => import(pathToFileURL(path.resolve(file)).href);
  const { createXriftComponent } = await load("src/lib/visual-editor/component-registry.ts");
  const { compileXriftComponent } = await load("src/lib/visual-editor/compiler/xrift-component-registry.ts");
  const item = createXriftComponent("xrift.item", { componentId: "parity", properties: { itemId: "12345678-1234-1234-1234-123456789abc", placementId: "parity-placement" } });
  const compiled = compileXriftComponent(item, "world", { sceneId: "parity", entityId: "parity", componentId: item.id });
  if (compiled.mode !== "leaf" || !compiled.jsx) throw new Error(JSON.stringify(compiled.diagnostics));
  const root = path.resolve("node_modules/.cache/xrift-studio/world-items-parity");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "Item.tsx"), `import { Item } from '@xrift/world-components';\nexport const PublishedPlacement = () => (${compiled.jsx});\nexport const component = ${JSON.stringify(item)};\n`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
