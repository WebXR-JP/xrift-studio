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
    fixture.mountVehicleSeatFixture();
  }, "/e2e/vehicle-seat.fixture.tsx");
  await expect(page.getByTestId("ready")).toHaveText("ready");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "Aim at driver" }).click();
  await expect(page.getByTestId("aim")).toHaveText("hit");
  await page.locator("canvas").click();
  await expect(page.getByTestId("occupied")).toHaveText("seated");
  await page.keyboard.down("KeyW");
  await expect.poll(() => page.getByTestId("distance").textContent().then(Number)).toBeLessThan(-0.1);
  await page.keyboard.up("KeyW");
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

test("generated Vehicle and Seat TSX typecheck against the installed official API", async () => {
  const ts = await import("typescript-test-api");
  const path = await import("node:path");
  const { getScriptTemplate } = await import("../src/lib/visual-editor/scripting/script-templates");
  const root = process.cwd();
  const files = ["vehicle", "seat"].map(id => [path.join(root, `.vehicle-check-${id}.tsx`), getScriptTemplate(id)!.source] as const);
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
