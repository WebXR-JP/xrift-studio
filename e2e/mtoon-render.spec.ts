import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/mtoon-published.prepare.cjs"], { stdio: "pipe" });
});

test("MToonの編集と生成した公開コードが同じ色と輪郭を実描画する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e.html?scenario=ready");
  const pixels = await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const m = await load("/e2e/mtoon-render.fixture.ts");
    const generated = await load("/node_modules/.cache/xrift-studio/mtoon-render-parity/src/World.tsx");
    const T = m.THREE;
    m.extend(T);
    const material = generated.parityMaterial;
    const renderer = new T.WebGLRenderer();
    renderer.setSize(96, 96);
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    renderer.toneMapping = T.NoToneMapping;
    const target = new T.WebGLRenderTarget(96, 96);
    renderer.setRenderTarget(target);
    const camera = new T.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
    camera.manual = true;
    camera.position.z = 3;
    function makeScene() {
      const scene = new T.Scene();
      scene.background = new T.Color(0, 0, 0);
      scene.add(new T.AmbientLight(0xffffff, 0.2));
      const light = new T.DirectionalLight(0xffffff, 3);
      light.position.set(2, 3, 2); scene.add(light);
      return scene;
    }
    function sample(scene: import("three").Scene) {
      renderer.render(scene, camera);
      const values = new Uint8Array(96 * 96 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 96, 96, values);
      return [...values];
    }
    const geometry = new T.SphereGeometry(0.8, 32, 24);
    const colors = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = 0.2;
      colors[index + 1] = 1;
      colors[index + 2] = 0.3;
    }
    geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
    const source = new T.MeshStandardMaterial();
    const scene = makeScene();
    const mesh = new T.Mesh(geometry, m.createAssignedMaterialPreviewMaterial(source, material));
    scene.add(mesh);
    let outlines = m.attachMToonOutlines(mesh);
    const editor = sample(scene);
    geometry.deleteAttribute("color");
    const unpainted = sample(scene);
    geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
    const sharedGeometry = mesh.children[0]?.geometry === geometry;
    outlines.dispose(); mesh.material.dispose();
    const green = structuredClone(material);
    green.properties.extensions.VRMC_materials_mtoon.outlineColorFactor = [0, 1, 0];
    green.properties.extensions.VRMC_materials_mtoon.outlineWidthFactor = 0.14;
    mesh.material = m.createAssignedMaterialPreviewMaterial(source, green);
    outlines = m.attachMToonOutlines(mesh);
    const changed = sample(scene);
    outlines.dispose(); mesh.material.dispose();
    green.properties.extensions.VRMC_materials_mtoon.outlineWidthMode = "none";
    mesh.material = m.createAssignedMaterialPreviewMaterial(source, green);
    outlines = m.attachMToonOutlines(mesh);
    const none = sample(scene);
    const noChildren = mesh.children.length === 0;
    outlines.dispose(); mesh.material.dispose();
    const publishedScene = makeScene();
    const root = m.createRoot(renderer.domElement);
    await root.configure({ gl: renderer, scene: publishedScene, camera, frameloop: "never", flat: true, linear: true,
      size: { width: 96, height: 96, top: 0, left: 0 }, events: undefined });
    root.render(m.React.createElement("mesh", null,
      m.React.createElement("primitive", { object: geometry, attach: "geometry" }),
      m.React.createElement(generated.PublishedMToonMaterial)));
    for (let attempt = 0; attempt < 60 && !publishedScene.children.some((object: import("three").Object3D) => (object as import("three").Mesh).isMesh); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    renderer.setRenderTarget(target);
    const published = sample(publishedScene);
    root.unmount();
    source.dispose(); target.dispose(); renderer.dispose();
    return { editor, published, changed, none, sharedGeometry, noChildren, unpainted };
  });
  expect(errors).toEqual([]);
  expect(pixels.editor.some((value: number, index: number) => value !== pixels.unpainted[index])).toBe(true);
  expect(pixels.sharedGeometry).toBe(true);
  expect(pixels.noChildren).toBe(true);
  expect(pixels.published.filter((value: number, index: number) => value !== pixels.editor[index]).length).toBe(0);
  const colored = (data: number[], channel: number) => data.filter((value, i) => i % 4 === channel && value > 180 && data[i - channel + (channel === 0 ? 1 : 0)] < 50).length;
  const red = colored(pixels.editor, 0);
  const green = colored(pixels.changed, 1);
  expect(red).toBeGreaterThan(30);
  expect(green).toBeGreaterThan(red);
  expect(colored(pixels.none, 1)).toBe(0);
  expect(errors).toEqual([]);
});

test("MToonのOpacity MapはRGBAとMaskを適用する", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const m = await load("/e2e/mtoon-render.fixture.ts");
    const T = m.THREE;
    const renderer = new T.WebGLRenderer(); renderer.setSize(16, 16);
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    const target = new T.WebGLRenderTarget(16, 16); renderer.setRenderTarget(target);
    const scene = new T.Scene(); scene.background = new T.Color(0, 0, 0);
    scene.add(new T.AmbientLight(0xffffff, Math.PI));
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 2;
    const geometry = new T.PlaneGeometry(2, 2);
    const texture = new T.DataTexture(new Uint8Array([32, 96, 160, 224]), 1, 1); texture.needsUpdate = true;
    const mesh = new T.Mesh(geometry); scene.add(mesh);
    const channels: number[][] = [], masks: number[][] = [];
    for (const opacityChannel of ["r", "g", "b", "a"]) {
      for (const alphaMode of ["BLEND", "MASK"]) {
        const properties = m.normalizeMaterialProperties({ color: "#ffffff", opacityChannel, alphaMode,
          extensions: { VRMC_materials_mtoon: {} } });
        mesh.material = m.createMToonMaterial(properties, { opacityMap: texture });
        renderer.render(scene, camera);
        const sample = new Uint8Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, sample);
        (alphaMode === "BLEND" ? channels : masks).push([...sample].slice(0, 3));
        mesh.material.dispose();
      }
    }
    texture.dispose(); geometry.dispose(); target.dispose(); renderer.dispose();
    return { channels, masks };
  });
  result.channels.forEach((pixel: number[], index: number) => pixel.forEach(value => expect(Math.abs(value - [32, 96, 160, 224][index]!)).toBeLessThanOrEqual(1)));
  expect(result.masks.slice(0, 2)).toEqual([[0, 0, 0], [0, 0, 0]]);
  expect(result.masks.slice(2)).toEqual([[255, 255, 255], [255, 255, 255]]);
});

test("MToonはMapごとのUV1を使い、UVアニメーションが輪郭と同期する", async ({ page }) => {
  const shaderErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") shaderErrors.push(message.text()); });
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const load = (url: string) => import(/* @vite-ignore */ url);
    const m = await load("/e2e/mtoon-render.fixture.ts");
    const T = m.THREE;
    const renderer = new T.WebGLRenderer(); renderer.setSize(16, 16);
    renderer.outputColorSpace = T.LinearSRGBColorSpace;
    const target = new T.WebGLRenderTarget(16, 16); renderer.setRenderTarget(target);
    const scene = new T.Scene(); scene.background = new T.Color(0, 0, 0);
    scene.add(new T.AmbientLight(0xffffff, Math.PI));
    const camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); camera.position.z = 2;
    const geometry = new T.PlaneGeometry(2, 2);
    geometry.setAttribute("uv", new T.Float32BufferAttribute(Array(4).fill([0.25, 0.5]).flat(), 2));
    geometry.setAttribute("uv1", new T.Float32BufferAttribute(Array(4).fill([0.75, 0.5]).flat(), 2));
    const texture = new T.DataTexture(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1);
    texture.magFilter = T.NearestFilter; texture.minFilter = T.NearestFilter; texture.needsUpdate = true;
    const mesh = new T.Mesh(geometry); scene.add(mesh);
    const samples: number[][] = [];
    for (const channel of [0, 1]) {
      texture.channel = channel;
      mesh.material = m.createMToonMaterial(m.normalizeMaterialProperties({ color: "#ffffff", extensions: { VRMC_materials_mtoon: {} } }), { baseColorMap: texture });
      renderer.render(scene, camera);
      const sample = new Uint8Array(4); renderer.readRenderTargetPixels(target, 8, 8, 1, 1, sample);
      samples.push([...sample].slice(0, 3)); mesh.material.dispose();
    }
    texture.channel = 1;
    const animated = m.createMToonMaterial(m.normalizeMaterialProperties({ color: "#ffffff", extensions: { VRMC_materials_mtoon: {
      outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.1, uvAnimationScrollXSpeedFactor: 0.2,
    } } }), { baseColorMap: texture, outlineWidthMultiplyMap: texture });
    mesh.material = animated;
    const outlines = m.attachMToonOutlines(mesh);
    m.updateMToonMaterials(mesh, 0.5, 1);
    // Two imported model instances can share their native surface material.
    const otherInstance = new T.Mesh(geometry, animated);
    m.updateMToonMaterials(otherInstance, 0.5, 1);
    const outline = mesh.children[0].material;
    renderer.render(scene, camera);
    const synced = outline.uniforms.uvAnimationScrollXOffset.value === animated.uniforms.uvAnimationScrollXOffset.value;
    const offset = outline.uniforms.uvAnimationScrollXOffset.value;
    outlines.dispose(); animated.dispose();
    // MToon-only slots also need UV1 without a Three base/normal/emissive map
    // enabling its attribute automatically, including cloned outline passes.
    for (const slot of ["shadeMultiplyMap", "outlineWidthMultiplyMap", "shadingShiftMap", "rimMultiplyMap", "uvAnimationMaskMap", "opacityMap"]) {
      const surface = m.createMToonMaterial(m.normalizeMaterialProperties({ color: "#ffffff", extensions: { VRMC_materials_mtoon: {
        outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.1,
      } } }), { [slot]: texture });
      mesh.material = surface;
      const pass = m.attachMToonOutlines(mesh);
      renderer.render(scene, camera);
      pass.dispose(); surface.dispose();
    }
    texture.dispose(); geometry.dispose(); target.dispose(); renderer.dispose();
    return { samples, synced, offset };
  });
  expect(shaderErrors).toEqual([]);
  expect(result.samples).toEqual([[255, 0, 0], [0, 0, 255]]);
  expect(result.synced).toBe(true);
  expect(result.offset).toBeCloseTo(0.1);
});
