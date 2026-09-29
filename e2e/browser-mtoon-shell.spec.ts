import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test.beforeAll(() => {
  const args = ["e2e/vrm-mtoon-render.prepare.cjs", "--shell"];
  if (process.env.XRIFT_SHELL_FIXTURE_ROOT) args.push("--shell-root", process.env.XRIFT_SHELL_FIXTURE_ROOT);
  execFileSync(process.execPath, args, { stdio: "pipe" });
});

for (const version of ["0", "1"] as const) {
  test(`ブラウザ公開シェルでVRM ${version}とMToonの色・輪郭を保持する`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/e2e.html?scenario=ready");
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await page.evaluate(async version => {
          const url = "/e2e/vrm-mtoon-render.fixture.ts";
          const m = await import(/* @vite-ignore */ url);
          await m.loadBuiltShellWorld(`${location.origin}/node_modules/.cache/xrift-studio/vrm-mtoon-render/${version}-native/remoteEntry.js`);
        }, version);
        break;
      } catch (error) {
        if (attempt > 2 || !(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
        await page.waitForLoadState("load");
      }
    }
    const reports = await page.evaluate(async version => {
      const load = (url: string) => import(/* @vite-ignore */ url);
      const m = await load("/e2e/vrm-mtoon-render.fixture.ts");
      const T = m.THREE;
      m.extend(T);
      const reports = [];
      for (const mode of ["native", "imported", "edited", "authored"]) {
        // R3F owns each root's context and releases it after unmount.
        const renderer = new T.WebGLRenderer(); renderer.setSize(96, 96);
        const target = new T.WebGLRenderTarget(96, 96);
        const base = `${location.origin}/node_modules/.cache/xrift-studio/vrm-mtoon-render/${version}-${mode}/`;
        const manifest = await fetch(`${base}xrift-runtime.json`).then(response => response.json());
        const World = await m.loadBuiltShellWorld(`${base}remoteEntry.js`);
        const scene = new T.Scene(); scene.background = new T.Color(0, 0, 0);
        const camera = new T.OrthographicCamera(-0.55, 0.55, 0.55, -0.55, 0.1, 10);
        camera.manual = true; camera.position.z = 3;
        const root = m.createRoot(document.createElement("canvas"));
        await root.configure({ gl: renderer, scene, camera, frameloop: "never", flat: true, linear: true,
          size: { width: 96, height: 96, top: 0, left: 0 }, events: undefined });
        root.render(m.React.createElement(m.XRiftProvider, { baseUrl: base },
          m.React.createElement(m.Physics, { paused: true }, m.React.createElement(World))));
        let surface: import("three").Mesh | undefined;
        for (let attempt = 0; attempt < 120; attempt++) {
          scene.traverse((object: import("three").Object3D) => {
            if ((object as import("three").Mesh).isMesh && !object.userData.xriftMToonOutline
              && (object as import("three").Mesh).material && ((object as import("three").Mesh).material as { isMToonMaterial?: boolean }).isMToonMaterial) surface = object as import("three").Mesh;
          });
          if (surface && surface.children.some(child => child.userData.xriftMToonOutline)) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (!surface) throw new Error(`The built browser shell did not render MToon ${version}-${mode}`);
        const source = await new m.XriftThreeLoader({ assetBaseUrl: base }).parse(manifest);
        const control = new T.Scene(); control.background = new T.Color(0, 0, 0); control.add(source.root);
        function setFixtureLighting(sample: import("three").Scene) {
          sample.traverse((object: import("three").Object3D) => {
            if ((object as import("three").Light).isLight) (object as import("three").Light).intensity = 0;
            if (object.name === "xrift-scene-skybox") object.visible = false;
          });
          sample.background = new T.Color(0, 0, 0); sample.add(new T.AmbientLight(0xffffff, Math.PI)); sample.updateMatrixWorld(true);
        }
        setFixtureLighting(scene); setFixtureLighting(control);
        const center = new T.Box3().setFromObject(source.root, true).getCenter(new T.Vector3());
        camera.position.copy(center).add(new T.Vector3(0, 0, 3)); camera.lookAt(center); camera.updateMatrixWorld(true);
        renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping; renderer.setRenderTarget(target);
        function pixels(sample: import("three").Scene) {
          renderer.render(sample, camera); const values = new Uint8Array(96 * 96 * 4);
          renderer.readRenderTargetPixels(target, 0, 0, 96, 96, values); return [...values];
        }
        const actual = pixels(scene); const expected = pixels(control);
        const material = surface.material as import("@pixiv/three-vrm").MToonMaterial;
        reports.push({ mode, actual, expected, compat: material.v0CompatShade,
          skinned: (surface as import("three").SkinnedMesh).isSkinnedMesh === true,
          outlines: surface.children.filter(child => child.userData.xriftMToonOutline).length });
        root.unmount(); m.disposeXriftLoadResult(source); target.dispose(); renderer.dispose();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return reports;
    }, version);
    expect(errors).toEqual([]);
    expect(reports).toHaveLength(4);
    for (const report of reports) {
      expect(report.actual.filter((value: number, index: number) => value !== report.expected[index]).length, `${version}-${report.mode} renderer parity`).toBe(0);
      expect(report.compat).toBe(version === "0");
      expect(report.skinned).toBe(report.mode !== "authored");
      expect(report.outlines).toBe(1);
      expect(report.actual.filter((value: number, index: number) => index % 4 !== 3 && value > 80).length, `${version}-${report.mode} visible color`).toBeGreaterThan(1000);
    }
    expect(reports[1]!.actual).toEqual(reports[0]!.actual);
    expect(reports[2]!.actual).not.toEqual(reports[1]!.actual);
    expect(errors).toEqual([]);
  });
}
