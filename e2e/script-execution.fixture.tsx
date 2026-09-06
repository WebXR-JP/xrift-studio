import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useScriptRuntime } from "../src/components/visual-editor/useScriptRuntime";
import { createPrototypeProject } from "../src/lib/visual-editor/prototype-project";
import { createScriptComponent } from "../src/lib/visual-editor/scene-document";
import { createScriptAsset } from "../src/lib/visual-editor/scripting/script-files";
import { tauri } from "../src/lib/tauri";

export function mountScriptExecutionFixture(): void {
  const bundle = createPrototypeProject("world", "script-execution-fixture");
  const asset = createScriptAsset("fixture-script", "Fixture Script", "scripts/fixture.ts");
  bundle.assets.assets[asset.id] = asset;
  const entity = bundle.scene.entities[bundle.scene.rootEntityIds[0]!];
  if (!entity) throw new Error("Fixture needs a root entity");
  entity.components.push(createScriptComponent("fixture-component", asset.id)!);
  let source = 'import { defineScript } from "xrift:script"; export default defineScript({name:"Version one"});';
  tauri.readScriptSource = async () => source;
  tauri.getScriptTrustStatus = async () => { throw new Error("Approval store must not be used"); };
  tauri.approveScriptTrustFingerprintsForUi = async () => { throw new Error("Approval store must not be written"); };
  function Fixture() {
    const runtime = useScriptRuntime({ scene: bundle.scene, assets: bundle.assets, projectPath: "/fixture", resolveScriptProvenance: () => ({kind:"mcp",detail:"fixture"}) });
    useEffect(() => () => runtime.reset(), [runtime.reset]);
    return <section aria-label="Script execution fixture">
      <button onClick={() => { void runtime.compile(); }}>Compile saved Script</button>
      <button onClick={() => { source = 'import { defineScript } from "xrift:script"; export default defineScript({name:"Version two"});'; void runtime.compile(); }}>Update Script</button>
      <button onClick={() => { source = 'export default {'; void runtime.compile(); }}>Break Script</button>
      <output data-testid="runtime-status">{runtime.state.status}</output>
      <output data-testid="runtime-name">{runtime.state.scripts.get(asset.id)?.script.name}</output>
      <output data-testid="runtime-trust">{runtime.state.trust.status}</output>
      <output data-testid="runtime-errors">{runtime.state.errors.map(error => error.message).join("\n")}</output>
    </section>;
  }
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  createRoot(host).render(createElement(Fixture));
}
