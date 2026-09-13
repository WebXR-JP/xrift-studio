import { expect, test } from "@playwright/test";
import { createWorldPlaySeatStore } from "../src/components/visual-editor/world-play-seat-store";
import type { SeatEntry } from "@xrift/world-components";

const entry = (): SeatEntry => ({
  getSeatSurface: () => ({ position: { x: 0, y: 1, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }),
  getExitPosition: () => ({ x: 0, y: 0, z: -1 }),
});

test("local seat store requires a player and handles replacement, departure and Stop", () => {
  const store = createWorldPlaySeatStore();
  const first = entry();
  store.contextValue.registerSeat("chair", first);
  store.contextValue.sit("chair");
  expect(store.getEntry()).toBeNull();
  const calls: (SeatEntry | null)[] = [];
  const stop = store.bindPlayer(value => { calls.push(value); return true; });
  store.contextValue.sit("chair");
  expect(store.contextValue.getOccupantId("chair")).toBe(store.contextValue.getLocalUserId());
  expect(store.getEntry()).toBe(first);
  store.contextValue.sit("chair");
  expect(calls).toEqual([first]);
  const replacement = entry();
  store.contextValue.registerSeat("chair", replacement);
  expect(store.getEntry()).toBeNull();
  store.contextValue.sit("chair");
  store.contextValue.unregisterSeat("chair", first);
  expect(store.getEntry()).toBe(replacement);
  store.contextValue.unregisterSeat("chair", replacement);
  expect(store.getEntry()).toBeNull();
  expect(calls).toEqual([first, null, replacement, null]);
  store.contextValue.registerSeat("chair", first);
  store.contextValue.sit("chair");
  stop();
  expect(store.getEntry()).toBeNull();
  expect(calls).toEqual([first, null, replacement, null, first, null]);
});

test("failed player binding never reports occupancy", () => {
  const store = createWorldPlaySeatStore();
  store.contextValue.registerSeat("chair", entry());
  store.bindPlayer(() => false);
  store.contextValue.sit("chair");
  expect(store.contextValue.getOccupantId("chair")).toBeNull();
});

test("official Vehicle drives only its occupied driver seat and releases occupancy on Stop", async ({ page }, testInfo) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async url => {
    const fixture = await import(url) as typeof import("./vehicle-seat.fixture");
    await fixture.mountVehicleSeatFixture();
  }, "/e2e/vehicle-seat.fixture.tsx");
  await expect(page.getByTestId("ready")).toHaveText("ready");
  await page.screenshot({ path: testInfo.outputPath("vehicle-models.png") });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "Aim at driver" }).click();
  await expect(page.getByTestId("aim")).toHaveText("hit");
  await page.locator("canvas").click();
  await expect(page.getByTestId("occupied")).toHaveText("seated");
  await page.keyboard.down("KeyW");
  await expect.poll(() => page.getByTestId("distance").textContent().then(Number)).toBeLessThan(-0.1);
  await expect.poll(() => page.getByTestId("wheel-rotation").textContent().then(Number)).not.toBe(0);
  await expect(page.getByTestId("smoke-visible")).toHaveText("true");
  await page.keyboard.up("KeyW");
  await expect(page.getByTestId("smoke-visible")).toHaveText("false");
  await page.screenshot({ path: testInfo.outputPath("vehicle-play.png") });
  await page.keyboard.press("Space");
  await page.evaluate(() => document.exitPointerLock());
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await expect(page.getByTestId("occupied")).toHaveText("none");
  await page.getByRole("button", { name: "Sit passenger" }).click();
  const distance = Number(await page.getByTestId("distance").textContent());
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");
  expect(Number(await page.getByTestId("distance").textContent())).toBeCloseTo(distance, 2);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("occupied")).toHaveText("none");
  expect(errors).toEqual([]);
});

test("generated Vehicle and Seat TSX typecheck against the installed official API", async ({ page }) => {
  const ts = await import("typescript-test-api");
  const path = await import("node:path");
  await page.goto("/e2e.html?scenario=ready");
  const sources = await page.evaluate(async () => {
    const url = "/src/lib/visual-editor/scripting/script-templates.ts";
    const { getScriptTemplate } = await import(url) as typeof import("../src/lib/visual-editor/scripting/script-templates");
    return ["vehicle", "seat"].map(id => [id, getScriptTemplate(id)!.source] as const);
  });
  const root = process.cwd();
  const files = sources.map(([id, source]) => [path.join(root, `.vehicle-check-${id}.tsx`), source] as const);
  const options = {
    strict: true, noEmit: true, skipLibCheck: true,
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root, paths: { "xrift:script": ["packages/xrift-studio-runtime/src/script/api.ts"] },
    allowImportingTsExtensions: true,
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile;
  const exists = host.fileExists;
  host.readFile = filename => files.find(([name]) => name === filename)?.[1] ?? read(filename);
  host.fileExists = filename => files.some(([name]) => name === filename) || exists(filename);
  const program = ts.createProgram(files.map(([name]) => name), options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))).toEqual([]);
});

test("Vehicle and Seat load through Studio's Script module bridge", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const results = await page.evaluate(async () => {
    const moduleUrl = "/src/lib/script-modules.ts";
    const templateUrl = "/src/lib/visual-editor/scripting/script-templates.ts";
    const { loadScriptModule, releaseScriptModuleUrl } = await import(moduleUrl) as typeof import("../src/lib/script-modules");
    const { createScriptTemplateSource } = await import(templateUrl) as typeof import("../src/lib/visual-editor/scripting/script-templates");
    const results = [];
    for (const id of ["vehicle", "seat"]) {
      const result = await loadScriptModule(createScriptTemplateSource(id, id)!, `${id}.tsx`);
      results.push(result.ok ? { id, render: typeof result.module.Render } : { id, error: result.message });
      if (result.ok) releaseScriptModuleUrl(result.objectUrl);
    }
    return results;
  });
  expect(results).toEqual([{ id: "vehicle", render: "function" }, { id: "seat", render: "function" }]);
});


test("generated Seat model can be clicked to sit and Space stands up", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const url = "/e2e/vehicle-seat.fixture.tsx";
    const fixture = await import(url) as typeof import("./vehicle-seat.fixture");
    await fixture.mountVehicleSeatFixture();
  });
  await expect(page.getByTestId("ready")).toHaveText("ready");
  await page.getByRole("button", { name: "Aim at chair" }).click();
  await expect(page.getByTestId("aim")).toHaveText("hit");
  await page.locator("canvas").click();
  await expect(page.getByTestId("occupied")).toHaveText("seated");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("occupied")).toHaveText("none");
});

test("custom vehicle gimmick has a readable responsive catalog layout", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const url = "/e2e/vehicle-seat.fixture.tsx";
    const fixture = await import(url) as typeof import("./vehicle-seat.fixture");
    await fixture.mountVehicleCatalogFixture();
  });
  const vehicle = page.locator("[data-catalog-card]").filter({ hasText: "カスタム車" });
  await vehicle.click();
  await expect(page.getByRole("button", { name: "カスタム車をシーンへ追加" })).toBeVisible();
  await expect(vehicle.locator("canvas")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("catalog-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await vehicle.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.querySelector(".external-catalog-content")!.setAttribute("data-pane", "detail"));
  await expect(page.getByRole("button", { name: "カスタム車をシーンへ追加" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("catalog-mobile-detail.png") });
});

test("vehicle cosmetics follow synchronized poses on both viewers, including reverse, stop and teleport", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  const result = await page.evaluate(async () => {
    const effectsUrl = "/src/lib/visual-editor/scripting/vehicle-effects-scripts.ts";
    const moduleUrl = "/src/lib/script-modules.ts";
    const threeUrl = "/node_modules/.vite/deps/three.js";
    const { VEHICLE_WHEEL_SOURCE, VEHICLE_SMOKE_SOURCE } = await import(effectsUrl);
    const { loadScriptModule } = await import(moduleUrl);
    const { Group } = await import(threeUrl);
    const wheel = await loadScriptModule(VEHICLE_WHEEL_SOURCE, "wheel.ts");
    const smoke = await loadScriptModule(VEHICLE_SMOKE_SOURCE, "smoke.ts");
    if (!wheel.ok || !smoke.ok) throw new Error("Effect Script failed to load");
    const viewers = [0, 1].map(() => {
      const parent = new Group();
      const object3d = new Group(); parent.add(object3d);
      const rates: number[] = [];
      const context = { object3d, particles: { setEmissionRate: (rate: number) => rates.push(rate) } };
      const wheelInstance = wheel.module.default.start(context);
      const smokeInstance = smoke.module.default.start(context);
      const tick = () => { parent.updateMatrixWorld(true); wheelInstance.update(1 / 60); smokeInstance.update(1 / 60); };
      tick(); parent.position.z = -0.62; tick();
      const forward = object3d.rotation.x;
      tick(); const stopped = object3d.rotation.x;
      parent.position.z = 0; tick(); const reverse = object3d.rotation.x;
      parent.position.z = 100; tick(); const teleport = object3d.rotation.x;
      wheelInstance.stop();
      return { forward, stopped, reverse, teleport, restored: object3d.rotation.x, rates };
    });
    return viewers;
  });
  expect(result[0]).toEqual(result[1]);
  expect(result[0]!.forward).toBeCloseTo(-2);
  expect(result[0]!.stopped).toBe(result[0]!.forward);
  expect(result[0]!.reverse).toBeCloseTo(0);
  expect(result[0]!.teleport).toBeCloseTo(0);
  expect(result[0]!.restored).toBe(0);
  expect(result[0]!.rates).toEqual([0, 8, 0, 8, 0]);
});
