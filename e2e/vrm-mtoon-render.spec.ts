import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/vrm-mtoon-render.prepare.cjs"], { stdio: "pipe" });
});

for (const version of ["0", "1"] as const) {
  test(`VRM ${version}のnative MToonと取り込んだマテリアル編集をWebGLで描画する`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/e2e.html?scenario=ready");
    // Vite can reload once while first optimizing the native VRM dependency.
    // Complete that module load before starting the rendering transaction.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.evaluate(async () => {
          const url = "/e2e/vrm-mtoon-render.fixture.ts";
          await import(/* @vite-ignore */ url);
        });
        break;
      } catch (error) {
        if (attempt > 0 || !(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
        await page.waitForLoadState("load");
      }
    }
    const pixels = await page.evaluate(async version => {
      const load = (url: string) => import(/* @vite-ignore */ url);
      const m = await load("/e2e/vrm-mtoon-render.fixture.ts");
      const T = m.THREE;
      const renderer = new T.WebGLRenderer();
      renderer.setSize(96, 96);
      renderer.outputColorSpace = T.LinearSRGBColorSpace;
      renderer.toneMapping = T.NoToneMapping;
      const target = new T.WebGLRenderTarget(96, 96);
      renderer.setRenderTarget(target);
      const samples: Record<string, number[]> = {};
      const outlinePasses: number[] = [];
      let programs = 0;
      for (const mode of ["native", "imported", "edited"]) {
        const base = `${location.origin}/node_modules/.cache/xrift-studio/vrm-mtoon-render/${version}-${mode}/`;
        const manifest = await fetch(`${base}manifest.json`).then(response => response.json());
        const loaded = await new m.XriftThreeLoader({ assetBaseUrl: base }).parse(manifest);
        if (loaded.diagnostics.some((item: { severity: string }) => item.severity === "error")) throw new Error(JSON.stringify(loaded.diagnostics));
        const scene = new T.Scene();
        scene.background = new T.Color(0, 0, 0);
        loaded.root.traverse((object: import("three").Object3D) => {
          if ((object as import("three").Light).isLight) (object as import("three").Light).intensity = 0;
        });
        scene.add(loaded.root, new T.AmbientLight(0xffffff, Math.PI));
        scene.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(loaded.root, true);
        const center = bounds.getCenter(new T.Vector3());
        const camera = new T.OrthographicCamera(-0.55, 0.55, 0.55, -0.55, 0.1, 10);
        camera.position.copy(center).add(new T.Vector3(0, 0, 3));
        camera.lookAt(center); camera.updateMatrixWorld(true);
        m.updateMToonMaterials(loaded.root, 0.5);
        let outlineCount = 0;
        loaded.root.traverse((object: import("three").Object3D) => { if (object.userData.xriftMToonOutline) outlineCount += 1; });
        outlinePasses.push(outlineCount);
        renderer.render(scene, camera);
        programs = Math.max(programs, renderer.info.programs?.length ?? 0);
        const values = new Uint8Array(96 * 96 * 4);
        renderer.readRenderTargetPixels(target, 0, 0, 96, 96, values);
        samples[mode] = [...values];
        m.disposeXriftLoadResult(loaded);
      }
      target.dispose(); renderer.dispose();
      return { samples, outlinePasses, programs };
    }, version);
    expect(errors).toEqual([]);
    expect(pixels.outlinePasses).toEqual([1, 1, 1]);
    expect(pixels.programs).toBeGreaterThan(0);
    expect(pixels.samples.imported).toEqual(pixels.samples.native);
    const count = (data: number[], dominant: number, minimum: number, ratio = 2) => {
      let found = 0;
      for (let index = 0; index < data.length; index += 4) {
        const color = data.slice(index, index + 3);
        if (color[dominant]! > minimum && color.every((value, channel) => channel === dominant || color[dominant]! > value * ratio)) found += 1;
      }
      return found;
    };
    const diagnostics = Object.fromEntries(Object.entries(pixels.samples).map(([mode, values]) => [mode, {
      red: count(values, 0, 80), blue: count(values, 2, 30, 1.2), green: count(values, 1, 80),
      center: values.slice((48 * 96 + 48) * 4, (48 * 96 + 48) * 4 + 4),
      colored: values.filter((value, index) => index % 4 !== 3 && value > 0).length,
    }]));
    for (const mode of ["native", "imported"]) {
      expect(count(pixels.samples[mode]!, 0, 80), JSON.stringify(diagnostics)).toBeGreaterThan(80);
      expect(count(pixels.samples[mode]!, 2, 30, 1.2)).toBeGreaterThan(500);
    }
    expect(count(pixels.samples.edited!, 1, 80)).toBeGreaterThan(500);
    expect(count(pixels.samples.edited!, 2, 150)).toBeGreaterThan(count(pixels.samples.native!, 0, 80));
    expect(pixels.samples.edited).not.toEqual(pixels.samples.imported);
    expect(errors).toEqual([]);
  });
}
