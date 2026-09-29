import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const completedPath = path.resolve("node_modules/.cache/xrift-studio/classic-mtoon-export/completed.json");
// This gate renders artifacts from real Classic exports. Ordinary UI test
// runs need no installed CLI or external template download.
test.skip(!existsSync(completedPath), "Prepare real Classic export artifacts before this integration check");

test("実Classic書き出し2経路の生成WorldがMToonとVRM0/1を描画する", async ({ page }) => {
  const completed = JSON.parse(readFileSync(completedPath, "utf8"));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e.html?scenario=ready");
  const outputs = completed.outputs.map((output: { root: string; kind: string }) => ({
    kind: output.kind,
    url: `/${path.relative(process.cwd(), output.root).replaceAll(path.sep, "/")}/`,
  }));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.evaluate(async outputs => {
        const load = (url: string) => import(/* @vite-ignore */ url);
        await load("/e2e/classic-mtoon-export.fixture.ts");
        for (const output of outputs) await load(`${output.url}src/index.tsx`);
      }, outputs);
      break;
    } catch (error) {
      if (attempt > 0 || !(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
      await page.waitForLoadState("load");
    }
  }
  const result = await page.evaluate(async outputs => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const m = await load("/e2e/classic-mtoon-export.fixture.ts");
    const T = m.THREE;
    m.extend(T);
    const renderer = new T.WebGLRenderer(); renderer.setSize(128, 128);
    renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
    const target = new T.WebGLRenderTarget(128, 128);
    const reports = [];
    for (const output of outputs) {
      const generated = await load(`${output.url}src/index.tsx`);
      const scene = new T.Scene(); scene.background = new T.Color(0, 0, 0);
      const camera = new T.OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.1, 10);
      camera.manual = true; camera.position.set(0, 0.5, 3); camera.lookAt(0, 0.5, 0);
      const root = m.createRoot(document.createElement("canvas"));
      await root.configure({ gl: renderer, scene, camera, frameloop: "never", flat: true, linear: true, size: { width: 128, height: 128, top: 0, left: 0 }, events: undefined });
      root.render(m.React.createElement(m.XRiftProvider, { baseUrl: `${location.origin}${output.url}public/` }, m.React.createElement(generated.World)));
      const surfaces: import("three").Mesh[] = [];
      for (let attempt = 0; attempt < 120; attempt++) {
        surfaces.length = 0;
        scene.traverse((object: import("three").Object3D) => { if ((object as import("three").Mesh).isMesh && !object.userData.xriftMToonOutline) surfaces.push(object as import("three").Mesh); });
        if (surfaces.length === 3 && surfaces.every(mesh => (mesh.material as { isMToonMaterial?: boolean }).isMToonMaterial)) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      scene.background = new T.Color(0, 0, 0); scene.add(new T.AmbientLight(0xffffff, Math.PI));
      renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
      renderer.setRenderTarget(target); renderer.render(scene, camera);
      const bytes = new Uint8Array(128 * 128 * 4); renderer.readRenderTargetPixels(target, 0, 0, 128, 128, bytes);
      let colored = 0; let redOutline = 0;
      for (let index = 0; index < bytes.length; index += 4) {
        if (bytes[index]! + bytes[index + 1]! + bytes[index + 2]! > 30) colored += 1;
        if (bytes[index]! > 150 && bytes[index + 1]! < 40 && bytes[index + 2]! < 40) redOutline += 1;
      }
      const properties = surfaces.map(mesh => {
        const material = mesh.material as import("@pixiv/three-vrm").MToonMaterial;
        const textureKeys = ["map", "normalMap", "emissiveMap", "shadeMultiplyTexture", "shadingShiftTexture", "matcapTexture", "rimMultiplyTexture", "outlineWidthMultiplyTexture", "uvAnimationMaskTexture"];
        return { nativeAvatar: (mesh as import("three").SkinnedMesh).isSkinnedMesh === true, compat: material.v0CompatShade,
          maps: textureKeys.filter(key => (material as unknown as Record<string, unknown>)[key]).length,
          opacityMap: !!(material.uniforms as Record<string, { value: unknown }>).xriftOpacityMap?.value,
          outlines: mesh.children.filter(child => child.userData.xriftMToonOutline).length };
      });
      reports.push({ kind: output.kind, colored, redOutline, properties, pixels: [...bytes] });
      root.unmount();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    target.dispose(); renderer.dispose();
    return reports;
  }, outputs);
  expect(errors).toEqual([]);
  expect(result).toHaveLength(2);
  for (const output of result) {
    expect(output.colored).toBeGreaterThan(1500);
    expect(output.redOutline).toBeGreaterThan(100);
    expect(output.properties).toHaveLength(3);
    expect(output.properties.filter((material: { nativeAvatar: boolean }) => material.nativeAvatar)).toHaveLength(2);
    expect(output.properties.filter((material: { compat: boolean }) => material.compat)).toHaveLength(2);
    for (const material of output.properties) {
      expect(material.maps).toBe(9);
      expect(material.opacityMap).toBe(true);
      expect(material.outlines).toBe(1);
    }
  }
  expect(result[0].pixels).toEqual(result[1].pixels);
  expect(errors).toEqual([]);
});
