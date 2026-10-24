import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

for (const kind of ["world", "item"] as const) test("built " + kind + " shell preserves the actual rounded Text corners", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  const compiled = await page.evaluate(async kind => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createPrototypeProject } = await load("/src/lib/visual-editor/prototype-project.ts");
    const { createEmptyEntity } = await load("/src/lib/visual-editor/editor-session.ts");
    const { createTextComponent } = await load("/src/lib/visual-editor/scene-document.ts");
    const { compileVisualProject } = await load("/src/lib/visual-editor/compiler/compile.ts");
    const bundle = createPrototypeProject(kind, "Rounded Text shell fixture");
    const added = createEmptyEntity({ ...bundle.scene, entities: {}, rootEntityIds: [] }, null, "Rounded Text");
    added.scene.entities[added.entityId].components.push(createTextComponent("rounded-text", {
      text: "角丸", fontSize: 0.12, anchorX: "center", anchorY: "middle", maxWidth: 1.6,
      background: { mode: "color", color: "#124a8f", opacity: 1, fit: "fixed", width: 2, height: 1, borderRadius: 0.2 },
    }));
    added.scene.settings.skybox.enabled = false;
    const output = compileVisualProject({ project: bundle.project, scenes: { [added.scene.sceneId]: added.scene }, assets: bundle.assets, prefabs: bundle.prefabs }, { outputMode: "classic-runtime" });
    if (!output.canStage || !output.runtimeManifestFile) throw new Error(JSON.stringify(output.diagnostics));
    return { manifest: output.runtimeManifestFile.content, fonts: output.stagingPlan.bundledAssetCopyPlan.filter((copy: { source: string }) => copy.source === "text-fonts") };
  }, kind);
  await page.route("**/xrift-runtime-shell/xrift-runtime.json", route => route.fulfill({ body: compiled.manifest, contentType: "application/json" }));
  for (const font of compiled.fonts) {
    const bytes = await readFile(join("node_modules/@fontsource/noto-sans-jp/files", font.sourceFileName));
    await page.route("**/xrift-runtime-shell/" + font.targetRelativePath, route => route.fulfill({ body: bytes, contentType: "font/woff" }));
  }
  const result = await page.evaluate(async kind => {
    const url = "/e2e/vrm-mtoon-render.fixture.ts";
    const m = await import(/* @vite-ignore */ url), T = m.THREE;
    m.extend(T);
    const Component = await m.loadBuiltShellWorld(location.origin + "/xrift-runtime-shell/remoteEntry.js", kind === "item" ? "./Item" : "./World");
    const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true }); renderer.setSize(256, 128);
    renderer.toneMapping = T.NoToneMapping;
    const scene = new T.Scene(); scene.background = new T.Color(0, 0, 0);
    const camera = new T.OrthographicCamera(-1.15, 1.15, 0.65, -0.65, 0.1, 10); camera.position.z = 3; camera.manual = true;
    const root = m.createRoot(document.createElement("canvas"));
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", flat: true, size: { width: 256, height: 128, top: 0, left: 0 }, events: undefined });
    const authored = m.React.createElement(Component);
    root.render(m.React.createElement(m.XRiftProvider, { baseUrl: location.origin + "/xrift-runtime-shell/" }, kind === "world" ? m.React.createElement(m.Physics, { paused: true }, authored) : authored));
    let plate: import("three").Mesh | undefined;
    for (let attempt = 0; attempt < 120; attempt++) {
      scene.traverse((object: import("three").Object3D) => {
        const mesh = object as import("three").Mesh;
        const material = mesh.material as import("three").MeshBasicMaterial | undefined;
        if (mesh.isMesh && material?.isMeshBasicMaterial && material.color.getHexString() === "124a8f") plate = mesh;
      });
      if (plate?.visible) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!plate?.visible) throw new Error("The built shell did not render the Text background");
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const target = new T.WebGLRenderTarget(256, 128); target.texture.colorSpace = T.LinearSRGBColorSpace;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixel = (x: number, y: number) => {
      const bytes = new Uint8Array(4);
      renderer.readRenderTargetPixels(target, Math.floor((x + 1.15) / 2.3 * 256), Math.floor((y + 0.65) / 1.3 * 128), 1, 1, bytes);
      return [...bytes];
    };
    const center = pixel(0, 0.3), corner = pixel(0.99, 0.49), geometry = plate.geometry.type;
    renderer.setRenderTarget(null); renderer.render(scene, camera);
    const image = renderer.domElement.toDataURL("image/png");
    root.unmount(); target.dispose(); renderer.dispose();
    return { center, corner, geometry, image, expected: new T.Color("#124a8f").toArray().map((value: number) => Math.round(value * 255)) };
  }, kind);
  expect(result.geometry).toBe("ShapeGeometry");
  for (let channel = 0; channel < 3; channel++) expect(Math.abs(result.center[channel]! - result.expected[channel]!)).toBeLessThanOrEqual(1);
  expect(result.corner.slice(0, 3)).toEqual([0, 0, 0]);
  expect(errors).toEqual([]);
  await testInfo.attach("built-" + kind + "-rounded-text", { body: Buffer.from(result.image.split(",")[1]!, "base64"), contentType: "image/png" });
});
