import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import zlib from "node:zlib";

/** What a Material holds for the uniforms the Scene drives. */
type SceneValues = {
  windDirection: number[];
  windSpeed: number;
  windTurbulence: number;
  sunDirection: number[];
  sunColor: number[];
  sunIntensity: number;
  ambientColor: number[];
  ambientIntensity: number;
};
/** What `renderCustomShaderModel` in the fixture returns for one path. */
type Report = {
  mode: string;
  frames: { swayOut: string; swayBack: string };
  values: Record<string, SceneValues>;
  leaves: Record<string, boolean>;
  materials: number;
  glError: number;
  changed?: { values: Record<string, SceneValues>; frame: string; rebuilt: string[] };
};

const SIZE = 300;
const output = path.resolve("node_modules/.cache/xrift-studio/custom-shader-model-parity/public");
// Edit and Play as the Scene View draws a Model, the generated World, the
// Runtime JSON adapter from source, and the built shell in public/ that
// browser publication uploads.
const MODES = ["edit", "play", "jsx", "runtime", "shell"] as const;

// What the fixture Scene says, worked out by hand from the settings written in
// custom-shader-model.prepare.cjs, so that a resolver that changed its mind
// fails here too. The Material itself holds other values for every one.
const SCENE: SceneValues = {
  // Wind toward 120 degrees.
  windDirection: [Math.cos((120 * Math.PI) / 180), Math.sin((120 * Math.PI) / 180)],
  windSpeed: 1.75,
  windTurbulence: 0.27,
  // A light turned -30 degrees about x and 45 about y shines from here.
  sunDirection: [Math.SQRT1_2, Math.SQRT1_2 / 2, (Math.SQRT1_2 * Math.sqrt(3)) / 2],
  sunColor: [1, 0.8, 0x88 / 255],
  sunIntensity: 2,
  ambientColor: [0.2, 0.4, 0.6],
  ambientIntensity: 0.75,
};
// The Scene after `changedScene` in the fixture: wind toward 0 degrees, a
// white light straight overhead and an orange ambient.
const CHANGED: SceneValues = {
  windDirection: [1, 0],
  windSpeed: 0.5,
  windTurbulence: 0.75,
  sunDirection: [0, 1, 0],
  sunColor: [1, 1, 1],
  sunIntensity: 1,
  ambientColor: [1, 0x80 / 255, 0],
  ambientIntensity: 0.5,
};

/** A frame as read back from the GPU (bottom row first), as a PNG for the report. */
function png(frame: Buffer) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) frame.copy(raw, y * (SIZE * 4 + 1) + 1, (SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0); header.writeUInt32BE(SIZE, 4); header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The colour each band of the Trunk shows for these values, from the bottom. */
function bandColors(scene: SceneValues) {
  return [
    scene.sunDirection.map(value => value * 0.5 + 0.5),
    scene.sunColor.map(value => value * scene.sunIntensity * 0.25),
    scene.ambientColor.map(value => value * scene.ambientIntensity),
    [scene.windDirection[0]! * 0.5 + 0.5, scene.windDirection[1]! * 0.5 + 0.5, scene.windSpeed * 0.25],
  ].map(color => color.map(channel => Math.min(1, Math.max(0, channel)) * 255));
}

/** The pixels a 0.8 m square covers: drawn where a pixel centre is inside it. */
function squareBox(centerX: number, centerY: number) {
  const edge = (metres: number) => (metres + 1.5) * 100;
  const first = (metres: number) => Math.ceil(edge(metres) - 0.5);
  return { minX: first(centerX - 0.4), maxX: first(centerX + 0.4) - 1, minY: first(centerY - 0.4), maxY: first(centerY + 0.4) - 1 };
}

/** Where the Leaves stand once the clock has swung them out (1) or back (-1). */
function leavesBox(scene: SceneValues, swing: number) {
  return squareBox(
    0.5 + scene.windDirection[0]! * scene.windSpeed * 0.2 * swing + scene.windTurbulence * 0.4,
    scene.windDirection[1]! * scene.windSpeed * 0.2 * swing,
  );
}

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/custom-shader-model.prepare.cjs"], { stdio: "pipe" });
});

test("モデルに割り当てたカスタムシェーダーが、編集・Play・公開の全経路でシーンの風とライトを読む", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  // The built shell reads its manifest and files from its own folder.
  await page.route("**/xrift-runtime-shell/xrift-runtime.json", route => route.fulfill({ path: path.join(output, "xrift-runtime.json") }));
  await page.route("**/xrift-runtime-shell/xrift-runtime-asset-*", route =>
    route.fulfill({ path: path.join(output, path.basename(new URL(route.request().url()).pathname)) }));
  await page.goto("/e2e/custom-shader-render.html");

  const reports: Report[] = [];
  for (const mode of MODES) {
    try {
      reports.push(await page.evaluate(async mode => {
        const url = "/e2e/custom-shader-model.fixture.tsx";
        const fixture = await import(/* @vite-ignore */ url);
        return fixture.renderCustomShaderModel(mode);
      }, mode) as Report);
    } catch (error) { throw new Error(`${mode}: ${String(error)}\nBrowser errors: ${JSON.stringify(errors)}`); }
  }
  await info.attach("custom-shader-model.json", {
    body: JSON.stringify(reports.map(({ frames: _frames, changed, ...report }) => ({ ...report, changed: changed && { values: changed.values, rebuilt: changed.rebuilt } })), null, 2),
    contentType: "application/json",
  });
  const [edit, play] = reports as [Report, Report, ...Report[]];
  const decode = (frame: string) => Buffer.from(frame, "base64");
  for (const [name, frame] of [["sway-out", edit.frames.swayOut], ["sway-back", edit.frames.swayBack], ["changed", edit.changed!.frame]] as const) {
    await info.attach(`custom-shader-model-${name}.png`, { body: png(decode(frame)), contentType: "image/png" });
  }

  const pixel = (frame: Buffer, x: number, y: number) => [...frame.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3)];
  /** The box of the pixels that are not black, among the columns from `fromX` up to `toX`. */
  const bounds = (frame: Buffer, fromX: number, toX: number) => {
    const box = { minX: SIZE, maxX: -1, minY: SIZE, maxY: -1 };
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = fromX; x < toX; x += 1) {
        const index = (y * SIZE + x) * 4;
        if (frame[index]! + frame[index + 1]! + frame[index + 2]! === 0) continue;
        box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
        box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
      }
    }
    return box;
  };
  const near = (actual: number[], expected: number[], tolerance: number, what: string) =>
    actual.forEach((value, channel) => expect(Math.abs(value - expected[channel]!), `${what}: ${actual.join(",")} for ${expected.map(value => Math.round(value * 1000) / 1000).join(",")}`).toBeLessThanOrEqual(tolerance));
  /** The values a path left on a Material are the Scene's, whichever way they got there. */
  const holds = (actual: SceneValues, expected: SceneValues, what: string) => {
    for (const [name, value] of Object.entries(expected) as [keyof SceneValues, number | number[]][]) {
      const read = actual[name];
      near(Array.isArray(read) ? read : [read], Array.isArray(value) ? value : [value], 1e-9, `${what} ${name}`);
    }
  };
  /** Both meshes show the Scene: the Trunk as written, the Leaves on their variant, leaning with the wind. */
  const shows = (frame: Buffer, scene: SceneValues, swing: number, what: string) => {
    const trunk = squareBox(-0.5, 0);
    const leaves = leavesBox(scene, swing);
    // The Trunk never reaches column 146 and the Leaves never come back to it.
    expect(bounds(frame, 0, 146), `${what}: where the Trunk stands`).toEqual(trunk);
    expect(bounds(frame, 146, SIZE), `${what}: where the wind and the clock put the Leaves`).toEqual(leaves);
    bandColors(scene).forEach((color, index) => {
      near(pixel(frame, trunk.minX + 40, trunk.minY + 20 * index + 10), color, 1.5, `${what}: band ${index} of the Trunk`);
      // The Leaves variant swaps red and blue.
      near(pixel(frame, leaves.minX + 40, leaves.minY + 20 * index + 10), [...color].reverse(), 1.5, `${what}: band ${index} of the Leaves`);
    });
  };

  // Edit draws the Scene's wind and key light, not the values saved in the Material.
  shows(decode(edit.frames.swayOut), SCENE, 1, "edit, swung out");
  shows(decode(edit.frames.swayBack), SCENE, -1, "edit, swung back");

  for (const report of reports) {
    expect(report.glError, report.mode).toBe(0);
    // One Material Asset, two meshes: each wears the variant its name picks.
    expect(report.leaves, report.mode).toEqual({ Trunk: false, Leaves: true });
    expect(report.materials, report.mode).toBe(2);
    for (const name of ["Trunk", "Leaves"]) holds(report.values[name]!, SCENE, `${report.mode} ${name}`);
    // Every path holds the very same numbers and draws the very same frames.
    expect(report.values, report.mode).toEqual(edit.values);
    for (const [name, frame] of Object.entries(report.frames)) {
      expect(frame === edit.frames[name as keyof typeof edit.frames], `${report.mode} ${name}`).toBe(true);
    }
  }

  // The author changes the Scene's wind, key light and ambient: the Model in
  // the Scene View follows, in Edit and in Play, without being built again.
  for (const report of [edit, play]) {
    const changed = report.changed!;
    expect(changed.rebuilt, report.mode).toEqual([]);
    for (const name of ["Trunk", "Leaves"]) holds(changed.values[name]!, CHANGED, `${report.mode} ${name} after the change`);
    shows(decode(changed.frame), CHANGED, 1, `${report.mode} after the change`);
  }
  expect(play.changed!.frame === edit.changed!.frame, "Play after the change").toBe(true);
  expect(reports.slice(2).map(report => report.changed)).toEqual([undefined, undefined, undefined]);
  expect(errors).toEqual([]);
});
