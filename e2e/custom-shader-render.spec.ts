import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import zlib from "node:zlib";

const output = path.resolve("node_modules/.cache/xrift-studio/custom-shader-render-parity/public");
const SIZE = 160;
/** Edit, the generated World, the Runtime JSON adapter from source and the built shell. */
const MODES = ["edit", "jsx", "runtime"] as const;

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

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/custom-shader-published.prepare.cjs"], { stdio: "pipe" });
});

test("カスタムシェーダーの新しいuniformと描画設定を、編集と公開の全経路が同じ絵で描く", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  // The built shell reads its manifest and files from its own folder.
  await page.route("**/xrift-runtime-shell/xrift-runtime.json", route => route.fulfill({ path: path.join(output, "xrift-runtime.json") }));
  await page.route("**/xrift-runtime-shell/xrift-runtime-asset-*", route =>
    route.fulfill({ path: path.join(output, path.basename(new URL(route.request().url()).pathname)) }));
  await page.goto("/e2e/custom-shader-render.html");

  const reports = [];
  for (const mode of MODES) {
    try { reports.push(await page.evaluate(async mode => {
      const url = "/e2e/custom-shader-render.fixture.tsx";
      const fixture = await import(/* @vite-ignore */ url);
      return fixture.renderCustomShaderParity(mode);
    }, mode)); } catch (error) { throw new Error(`${mode}: ${String(error)}\nBrowser errors: ${JSON.stringify(errors)}`); }
  }
  await info.attach("custom-shader-rendering", {
    body: JSON.stringify(reports.map(({ frames: _frames, ...report }) => report), null, 2), contentType: "application/json",
  });
  const edit = reports[0]!;
  const decode = (frame: string) => Buffer.from(frame, "base64");
  for (const name of ["plainRight", "glowGrey"] as const) {
    await info.attach(`custom-shader-${name}.png`, { body: png(decode(edit.frames[name])), contentType: "image/png" });
  }
  const pixel = (frame: Buffer, [x, y]: number[]) => [...frame.subarray((y! * SIZE + x!) * 4, (y! * SIZE + x!) * 4 + 3)];
  const lit = (frame: Buffer, index: number) => frame[index]! + frame[index + 1]! + frame[index + 2]! > 0;
  const bounds = (frame: Buffer) => {
    const box = { minX: SIZE, maxX: -1, minY: SIZE, maxY: -1 };
    for (let index = 0; index < frame.length; index += 4) {
      if (!lit(frame, index)) continue;
      const x = (index / 4) % SIZE, y = Math.floor(index / 4 / SIZE);
      box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
    }
    return box;
  };
  // Where a point of the plane lands: the mat4 scales by 1.2 and moves it,
  // row 1 of the vec3 array shifts it and the clock slides it by 0.2.
  const at = (u: number, v: number, slide: number) =>
    [Math.floor((1.2 * u - 0.44 + 0.2 * slide + 1) * 80), Math.floor((1.2 * v - 0.58 + 1) * 80)];
  const near = (actual: number[], expected: number[], tolerance: number, what: string) =>
    actual.forEach((value, channel) => expect(Math.abs(value - expected[channel]!), `${what}: ${actual.join(",")}`).toBeLessThanOrEqual(tolerance));

  // The clock each path runs reached the shader, and with it the mat4 and the vec3 array.
  const right = decode(edit.frames.plainRight);
  expect(bounds(right)).toEqual({ minX: 61, maxX: 156, minY: 34, maxY: 129 });
  expect(bounds(decode(edit.frames.plainLeft))).toEqual({ minX: 29, maxX: 124, minY: 34, maxY: 129 });

  // One known colour per band, from the bottom.
  near(pixel(right, at(2.5 / 8, 4.5 / 8 / 6, 1)), [72, 108, 255], 1, "8-bit picture, top row at v = 1");
  near(pixel(right, at(0.625, 1.5 / 6, 1)), [255, 170, 85], 6, "3D table: slice 3, column 2, row 1");
  near(pixel(right, at(0.125, 1.5 / 6, 1)), [255, 0, 85], 6, "3D table: slice 3, column 0, row 1");
  [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [55, 55, 55]].forEach((color, face) =>
    near(pixel(right, at((face + 0.5) / 6, 2.5 / 6, 1)), color, 2, `cube face ${face}`));
  near(pixel(right, at(10.5 / 16, 3.5 / 6, 1)), [85, 128, 76], 1, "32-bit float data");
  near(pixel(right, at(1.5 / 4, 4.5 / 6, 1)), [57, 143, 53], 2, "mat3 by columns and float array");
  near(pixel(right, at(0.5, 5.5 / 6, 1)), [83, 83, 83], 2, "color and number");

  // The glow variant: its define halves the colour, and additive blending
  // puts that on top of whatever is already in the frame.
  const glowBlack = decode(edit.frames.glowBlack), glowGrey = decode(edit.frames.glowGrey);
  let wrongDefine = 0, wrongBlend = 0;
  for (let index = 0; index < right.length; index += 1) {
    if (index % 4 === 3) continue;
    if (Math.abs(glowBlack[index]! - right[index]! / 2) > 1) wrongDefine += 1;
    if (Math.abs(glowGrey[index]! - Math.min(255, glowBlack[index]! + 51)) > 1) wrongBlend += 1;
  }
  expect(wrongDefine).toBe(0);
  expect(wrongBlend).toBe(0);

  // With its bounds out of view, only the Material that turns culling off is drawn.
  expect(edit.frames.glowFar).toBe(edit.frames.glowBlack);
  expect(decode(edit.frames.plainFar).some((_value, index) => index % 4 === 0 && lit(decode(edit.frames.plainFar), index))).toBe(false);

  for (const report of reports) {
    expect(report.glError, report.mode).toBe(0);
    expect(report.time[0], report.mode).toBeCloseTo(Math.PI / 2, 6);
    expect(report.time[1], report.mode).toBeCloseTo(Math.PI * 1.5, 6);
    expect(report.frustumCulled, report.mode).toEqual({ plain: true, glow: false });
    expect(report.blending, report.mode).toEqual(edit.blending);
    expect(report.floatData, report.mode).toBe(true);
    // The picture, the float data, the 3D table and the cube: one each on the GPU.
    expect(report.gpuTextures, report.mode).toBe(4);
    for (const [name, frame] of Object.entries(report.frames)) {
      expect(frame === edit.frames[name as keyof typeof edit.frames], `${report.mode} ${name}`).toBe(true);
    }
  }
  // Twelve editor meshes, two Materials: every file was read once.
  expect(Object.keys(edit.reads)).toHaveLength(9);
  expect(Object.values(edit.reads).every(count => count === 1), JSON.stringify(edit.reads)).toBe(true);
  expect(edit.cachedTextures).toBe(9);
  // Taking the Material off gives the mesh its culling back.
  expect(reports.filter(report => report.swapped).map(report => [report.mode, report.swapped])).toEqual([["edit", [true, false]], ["jsx", [true, false]]]);
  expect(errors).toEqual([]);
});
