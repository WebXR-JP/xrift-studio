import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

test.beforeAll(() => execFileSync(process.execPath, ["--test", "scripts/extrude-parity.test.mjs"], { stdio: "pipe" }));

test("concave Extrude keeps real pixels, material and collision in Edit, Play and both published paths", async ({ page }, info) => {
  const metricsPath = process.env.XRIFT_E2E_FONT_METRICS_PATH;
  if (metricsPath) await page.route("https://public.xrift.net/fonts/msdf/NotoSansJP/metrics.json?v=3", route => route.fulfill({ contentType: "application/json", path: metricsPath }));
  const errors: string[] = [];
  page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/e2e/extrude-rendering.html");
  await page.route("**/xrift-runtime-shell/xrift-runtime.json", async route => {
    const response = await page.request.get("/node_modules/.cache/xrift-studio/extrude-render-parity/fixture.json");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify((await response.json()).manifest) });
  });
  const reports = [];
  for (const mode of ["edit", "play", "jsx", "three", "shell"] as const) {
    try { reports.push(await page.evaluate(async mode => {
      const url = "/e2e/extrude-rendering.fixture.tsx";
      const fixture = await import(/* @vite-ignore */ url);
      return fixture.renderExtrudeParity(mode);
    }, mode)); } catch (error) { throw new Error(`${String(error)}\nBrowser errors: ${JSON.stringify(errors)}`); }
  }
  await info.attach("actual-extrude-rendering", { body: JSON.stringify(reports.map(({ pixels: _pixels, vertices: _vertices, normals: _normals, uvs: _uvs, ...report }) => report), null, 2), contentType: "application/json" });
  const reference = reports[0]!;
  expect(reference.colored).toBeGreaterThan(1000);
  for (const report of reports) {
    expect(report.error, report.mode).toBe(0);
    expect(report.vertices, report.mode).toEqual(reference.vertices);
    expect(report.normals, report.mode).toEqual(reference.normals);
    expect(report.uvs, report.mode).toEqual(reference.uvs);
    expect(report.material, report.mode).toEqual(reference.material);
    expect(report.bounds, report.mode).toEqual(reference.bounds);
    expect(createHash("sha256").update(Buffer.from(report.pixels)).digest("hex"), report.mode).toBe(createHash("sha256").update(Buffer.from(reference.pixels)).digest("hex"));
    if (["play", "jsx", "shell"].includes(report.mode)) expect(report.collision, report.mode).toEqual([{ inside: true, notch: false }]);
  }
  expect(errors).toEqual([]);
});
