import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const completedPath = path.resolve("node_modules/.cache/xrift-studio/classic-mtoon-export/completed.json");
// This gate renders artifacts from real Classic exports. Ordinary UI test
// runs need no installed CLI or external template download.
test.skip(!existsSync(completedPath), "Prepare real Classic export artifacts before this integration check");

test("実Classic書き出し2経路の生成WorldがMToonとVRM0/1を描画する", async ({ page }, testInfo) => {
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
    const reports = [];
    for (const output of outputs) {
      const generated = await load(`${output.url}src/index.tsx`);
      // R3F releases its root's context after unmount. Each export must own
      // its renderer so that an earlier root cannot interrupt the next one.
      const renderer = new T.WebGLRenderer(); renderer.setSize(128, 128);
      const gl = renderer.getContext();
      const target = new T.WebGLRenderTarget(128, 128);
      const scene = new T.Scene(); scene.background = new T.Color(0, 0, 0);
      const camera = new T.OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.1, 10);
      camera.manual = true; camera.position.set(0, 0.5, 3); camera.lookAt(0, 0.5, 0);
      const root = m.createRoot(document.createElement("canvas"));
      try {
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
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
        renderer.setRenderTarget(target); renderer.render(scene, camera);
        const drawState = {
          target: [target.width, target.height], viewport: [...gl.getParameter(gl.VIEWPORT)],
          scissor: [...gl.getParameter(gl.SCISSOR_BOX)], scissorTest: gl.getParameter(gl.SCISSOR_TEST),
          colorMask: [...gl.getParameter(gl.COLOR_WRITEMASK)], framebufferBound: gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null,
          framebufferStatus: gl.checkFramebufferStatus(gl.FRAMEBUFFER),
        };
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
        const frustum = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const bounds = (object: import("three").Object3D) => {
          const box = new T.Box3().setFromObject(object, true);
          return { min: box.min.toArray(), max: box.max.toArray(), empty: box.isEmpty() };
        };
        const diagnostics = {
          contextLost: gl.isContextLost(), glError: gl.getError(),
          drawState,
          calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs?.length ?? 0,
          camera: { position: camera.position.toArray(), layers: camera.layers.mask, near: camera.near, far: camera.far,
            frustum: [camera.left, camera.right, camera.bottom, camera.top], projection: camera.projectionMatrix.toArray() },
          bounds: bounds(scene), firstPixel: [...bytes.slice(0, 4)],
          surfaces: surfaces.map(mesh => {
            let ancestorsVisible = true;
            for (let parent: import("three").Object3D | null = mesh; parent; parent = parent.parent) ancestorsVisible &&= parent.visible;
            return { name: mesh.name, visible: mesh.visible, ancestorsVisible, layers: mesh.layers.mask,
              cameraLayersMatch: mesh.layers.test(camera.layers), materialVisible: Array.isArray(mesh.material) ? mesh.material.map(material => material.visible) : mesh.material.visible,
              frustumCulled: mesh.frustumCulled, inFrustum: frustum.intersectsObject(mesh), bounds: bounds(mesh) };
          }),
        };
        reports.push({ kind: output.kind, colored, redOutline, properties, diagnostics, pixels: [...bytes] });
      } finally {
        root.unmount(); target.dispose(); renderer.dispose();
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return reports;
  }, outputs);
  await testInfo.attach("classic-mtoon-render-diagnostics", {
    body: JSON.stringify(result.map(({ pixels: _pixels, ...report }) => report), null, 2), contentType: "application/json",
  });
  expect(errors).toEqual([]);
  expect(result).toHaveLength(2);
  for (const output of result) {
    const diagnostic = JSON.stringify({ kind: output.kind, ...output.diagnostics });
    expect(output.diagnostics.contextLost, diagnostic).toBe(false);
    expect(output.diagnostics.glError, diagnostic).toBe(0);
    expect(output.colored, diagnostic).toBeGreaterThan(1500);
    expect(output.redOutline, diagnostic).toBeGreaterThan(100);
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
