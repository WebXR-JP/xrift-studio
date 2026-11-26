import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { InstanceAttributeMode, renderInstanceAttributes } from "./instance-attributes.fixture";

type Report = Awaited<ReturnType<typeof renderInstanceAttributes>>;

// Mirrors GPU_INSTANCING_FIXTURE in the Runtime package, spelled out so a
// change to the fixture GLB has to be made knowingly in both places.
const EXPECTED = {
  Tufts: {
    instances: 5,
    translations: [-1, 0, 0, -0.5, 0, 0, 0, 0, 0, 0.5, 0, 0, 1, 0, 0],
    offsets: [0, 0.1, 0, 0, 0.2, 0, 0, 0.3, 0, 0, 0.4, 0, 0, 0.5, 0],
    tints: [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255],
  },
  Pair: {
    instances: 2,
    translations: [-0.25, -0.6, 0, 0.25, -0.6, 0],
    offsets: [0, -0.1, 0, 0, -0.2, 0],
    tints: null,
  },
  // As many instances as the quad has vertices.
  Four: {
    instances: 4,
    translations: [-0.75, 0.9, 0, -0.25, 0.9, 0, 0.25, 0.9, 0, 0.75, 0.9, 0],
    offsets: [0, 0.05, 0, 0, 0.1, 0, 0, 0.15, 0, 0, 0.2, 0],
    tints: null,
  },
} as const;

// The page is a blank document served by the test, which the browser treats
// as a public origin reaching the local dev server.
test.use({ permissions: ["local-network-access"] });

test.beforeAll(() => execFileSync(process.execPath, ["e2e/instance-attributes.prepare.cjs"], { stdio: "pipe" }));

test("a GLB's per-instance attributes reach a Custom Shader in Edit, Play, the generated world and the Runtime loader", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/e2e.html?instance-attributes", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto("/e2e.html?instance-attributes");
  const render = async (mode: InstanceAttributeMode): Promise<Report> => {
    try {
      return await page.evaluate(async mode => {
        const url = "/e2e/instance-attributes.fixture.tsx";
        const fixture = await import(/* @vite-ignore */ url);
        return fixture.renderInstanceAttributes(mode);
      }, mode) as Report;
    } catch (error) {
      throw new Error(`${String(error)}\nBrowser errors: ${JSON.stringify(errors)}`);
    }
  };
  const reports: Report[] = [];
  for (const mode of ["edit", "play", "jsx", "three"] as const) reports.push(await render(mode));
  const controls: Report[] = [];
  for (const mode of ["stock-loader", "drei-clone"] as const) controls.push(await render(mode));
  for (const report of [...reports, ...controls]) {
    await info.attach(`${report.mode}.png`, { body: Buffer.from(report.image.split(",")[1]!, "base64"), contentType: "image/png" });
  }
  await info.attach("instance-attributes.json", {
    body: JSON.stringify([...reports, ...controls].map(({ pixels: _pixels, image: _image, ...report }) => report), null, 2),
    contentType: "application/json",
  });

  const reference = reports[0]!;
  // 11 instanced quads and the ordinary one, 20 px square each.
  expect(reference.colored).toBeGreaterThan(4000);
  for (const report of reports) {
    expect(report.error, report.mode).toBe(0);
    for (const [name, expected] of Object.entries(EXPECTED)) {
      const node = report.nodes[name]!;
      expect(node.instances, `${report.mode} ${name}`).toBe(expected.instances);
      expect(node.translations, `${report.mode} ${name}`).toEqual(expected.translations);
      expect(node.offsetPerInstance, `${report.mode} ${name}`).toBe(true);
      expect(node.offsets, `${report.mode} ${name}`).toEqual(expected.offsets);
      expect(node.tintPerInstance, `${report.mode} ${name}`).toBe(expected.tints !== null);
      expect(node.tints, `${report.mode} ${name}`).toEqual(expected.tints);
      expect(node.vertices, `${report.mode} ${name}`).toBe(4);
    }
    expect(report.nodes.Single, report.mode).toMatchObject({ instances: null, offsetPerInstance: false, offsets: null, vertices: 4 });
    // Every instance is drawn where its own offset lifts it, and nowhere else.
    expect(report.lifted.filter(probe => !probe.lit), report.mode).toEqual([]);
    expect(report.rest.filter(probe => probe.lit), report.mode).toEqual([]);
    expect(report.plain, report.mode).toBe(true);
    // A parent rendering again keeps the Meshes it already drew.
    expect(report.rebuilt, report.mode).toEqual([]);
    expect(createHash("sha256").update(Buffer.from(report.pixels)).digest("hex"), report.mode)
      .toBe(createHash("sha256").update(Buffer.from(reference.pixels)).digest("hex"));
  }

  // three.js's loader alone: the instances are there, but the shader's
  // `_aoffset` reaches none of them, so no quad is lifted.
  const [stock, dreiClone] = controls as [Report, Report];
  expect(stock.error).toBe(0);
  expect(stock.nodes.Tufts).toMatchObject({ instances: 5, offsetPerInstance: false, offsets: null });
  expect(stock.lifted.filter(probe => probe.lit)).toEqual([]);
  expect(stock.rest.filter(probe => !probe.lit)).toEqual([]);
  // Drei's Clone alone: each instanced node is rebuilt as one ordinary Mesh.
  expect(dreiClone.error).toBe(0);
  for (const name of Object.keys(EXPECTED)) expect(dreiClone.nodes[name]!.instances, name).toBeNull();
  expect(dreiClone.colored).toBeLessThan(reference.colored / 4);
  expect(errors).toEqual([]);
});
