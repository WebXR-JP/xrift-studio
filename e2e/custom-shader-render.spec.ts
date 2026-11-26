import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import { execFileSync } from "node:child_process";
import path from "node:path";
import zlib from "node:zlib";

const SIZE = 160;
const output = path.resolve("node_modules/.cache/xrift-studio/custom-shader-render-parity/public");
// Edit, the generated World, the Runtime JSON adapter from source, and the
// built shell in public/ that browser publication uploads. The last one fails
// when the adapter changes and the shell is not rebuilt with
// scripts/build-world-runtime-shell.mjs.
const MODES = ["edit", "jsx", "runtime", "shell"] as const;

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

test("カスタムシェーダーの新しいuniformと合成・カリングの設定を、編集と公開の全経路が同じ絵で描く", async ({ page }, info) => {
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

const INSPECTOR_VERTEX = `uniform mat4 uPlacement;
uniform vec3 uOffsets[3];
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * (uPlacement * vec4(position + uOffsets[0], 1.0));
}`;
const INSPECTOR_FRAGMENT = `uniform float uGain;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vec3(vUv, 0.5) * uGain, 1.0);
}`;
type InspectorShader = {
  uniforms: Record<string, { kind: string; value: number[] }>;
  variants: Record<string, unknown>[];
};

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

test("カスタムシェーダーの行列・配列・テクスチャの欄と合成・カリングの設定を、Inspectorで編集して保存する", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name: "custom-shader-inspector-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");

  // An AI client writes the shader; the author then adjusts it in the Inspector.
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const created = await call(page, "create_custom_shader", { name: "Lamp Glow", shader: {
    vertexShader: INSPECTOR_VERTEX, fragmentShader: INSPECTOR_FRAGMENT,
    uniforms: {
      uGain: { kind: "number", value: 1 },
      uPlacement: { kind: "matrix", value: identity },
      uOffsets: { kind: "array", value: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    },
    variants: [{ name: "default", defines: {}, side: "double", transparent: false, depthWrite: true }],
  } }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const materialAssetId = created.result!.materialAssetId as string;
  const saved = async () => (await call(page, "get_custom_shader", { materialAssetId })).result!.shader as InspectorShader;
  expect((await saved()).uniforms.uPlacement).toEqual({ kind: "matrix", value: identity });

  await expect(page.getByText("シェーダーの調整値", { exact: true })).toBeVisible();
  const lists = page.locator("textarea[aria-invalid]");
  await expect(lists).toHaveCount(2);
  const matrix = lists.filter({ hasText: "1, 0, 0, 0" });
  const array = lists.filter({ hasNotText: "1, 0, 0, 0" });
  await expect(matrix).toHaveCount(1);

  // A mat4 by columns: the last column moves the mesh.
  const moved = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0.25, 0, 1];
  await matrix.fill("1, 0, 0, 0,\n0, 1, 0, 0,\n0, 0, 1, 0,\n0.5, 0.25, 0, 1");
  await expect.poll(async () => (await saved()).uniforms.uPlacement!.value).toEqual(moved);
  // Fifteen numbers are neither a mat3 nor a mat4: the field says so and nothing is saved.
  await matrix.fill("1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0.25, 0");
  await expect(matrix).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/^保存していません。9個（mat3）か16個（mat4）の数値/)).toBeVisible();
  expect((await saved()).uniforms.uPlacement!.value).toEqual(moved);
  await matrix.fill("1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0.25, 0, 1");
  await expect(matrix).toHaveAttribute("aria-invalid", "false");

  const offsets = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  await array.fill(offsets.join(", "));
  await expect.poll(async () => (await saved()).uniforms.uOffsets!.value).toEqual(offsets);

  // 合成とカリング: a glow is added to the frame, in the transparent pass, without depth, and is never culled.
  await expect(page.getByText("合成とカリング", { exact: true })).toBeVisible();
  await page.getByLabel("defaultのBlending").selectOption("additive");
  await expect(page.getByText(/Normal以外では、Transparentも有効にしてください/)).toBeVisible();
  // Each checkbox shows the saved document, which follows the click a moment later.
  await page.getByLabel("defaultのTransparent").click();
  await expect(page.getByLabel("defaultのTransparent")).toBeChecked();
  await expect(page.getByText(/Normal以外では、Transparentも有効にしてください/)).toHaveCount(0);
  await page.getByLabel("defaultのDepth Write").click();
  await expect(page.getByLabel("defaultのDepth Write")).not.toBeChecked();
  await page.getByLabel("defaultのFrustum Culling").click();
  await expect(page.getByLabel("defaultのFrustum Culling")).not.toBeChecked();
  await expect.poll(async () => (await saved()).variants[0]).toMatchObject({ blending: "additive", transparent: true, depthWrite: false, frustumCulled: false });
  await page.screenshot({ path: info.outputPath("custom-shader-inspector.png") });
  // The defaults are saved as absent keys, the way older documents are written.
  await page.getByLabel("defaultのBlending").selectOption("normal");
  await page.getByLabel("defaultのFrustum Culling").click();
  await expect(page.getByLabel("defaultのFrustum Culling")).toBeChecked();
  await expect.poll(async () => {
    const variant = (await saved()).variants[0]!;
    return ["blending" in variant, "frustumCulled" in variant];
  }).toEqual([false, false]);

  // The 3D texture and cube map fields, on their own: a blank project has no Texture to offer them.
  const fixture = "/e2e/custom-shader-render.fixture.tsx";
  await page.evaluate(async url => (await import(/* @vite-ignore */ url)).mountShaderTextureFields(), fixture);
  const fields = () => page.evaluate(async url => (await import(/* @vite-ignore */ url)).savedTextureFields, fixture) as
    Promise<{ volume: Record<string, unknown>; cube: { faces: { textureAssetId: string }[] }; opened: string[] }>;
  await expect(page.getByLabel("Lut", { exact: true })).toHaveValue("texture-strip");
  await page.getByLabel("Lutのスライス数").fill("32");
  await expect.poll(async () => (await fields()).volume).toEqual({ kind: "texture-3d", textureAssetId: "texture-strip", slices: 32 });
  await page.getByLabel("Lutのスライス数").fill("");
  await expect.poll(async () => (await fields()).volume).toEqual({ kind: "texture-3d", textureAssetId: "texture-strip" });
  await page.getByLabel("Skyの-Z面").selectOption("texture-strip");
  await expect.poll(async () => (await fields()).cube.faces.map(face => face.textureAssetId))
    .toEqual(["texture-px", "texture-nx", "texture-py", "texture-ny", "texture-pz", "texture-strip"]);
  await expect(page.getByText("6枚とも同じ大きさの正方形の画像を選びます。")).toBeVisible();
  await page.screenshot({ path: info.outputPath("custom-shader-texture-fields.png") });
});

test("数値の欄は、保存が遅れて届いても入力中の文字を保ち、ほかからの変更は表示する", async ({ page }) => {
  await page.goto("/e2e/custom-shader-render.html");
  const fixture = "/e2e/custom-shader-render.fixture.tsx";
  await page.evaluate(async url => (await import(/* @vite-ignore */ url)).mountLateShaderMatrixField(), fixture);
  /** The owner's state, after it applied the oldest list the field sent when asked to. */
  const owner = (deliver = false) => page.evaluate(async ({ url, deliver }) => {
    const { lateMatrixOwner } = await import(/* @vite-ignore */ url);
    if (deliver) lateMatrixOwner.deliver();
    return { pending: lateMatrixOwner.pending.length as number, held: [...lateMatrixOwner.held] as number[] };
  }, { url: fixture, deliver });
  /** Lets the field draw what a delivered value made of it. */
  const settle = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const field = page.getByLabel("Late placement");
  await expect(field).toHaveValue("1, 0, 0, 0,\n0, 1, 0, 0,\n0, 0, 1, 0,\n0, 0, 0, 1");

  // A mat4 is typed and, before its save comes back, the author types on:
  // fifteen numbers are no matrix and are not sent.
  const moved = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0.25, 0, 1];
  const unfinished = "1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0.25, 0";
  await field.fill(moved.join(", "));
  await field.fill(unfinished);
  expect((await owner()).pending).toBe(1);
  // The save of the mat4 comes back: the field keeps what is being typed.
  await expect.poll(async () => (await owner(true)).held).toEqual(moved);
  await settle();
  await expect(field).toHaveValue(unfinished);
  await expect(field).toHaveAttribute("aria-invalid", "true");

  // A number retyped digit by digit: every step is a matrix, and the save of
  // one step comes back after the next digit was typed.
  await field.fill(`${unfinished}, 2.5`);
  await field.fill(`${unfinished}, 2.57`);
  expect((await owner()).pending).toBe(2);
  await owner(true);
  await settle();
  await expect(field).toHaveValue(`${unfinished}, 2.57`);
  await expect.poll(async () => (await owner(true)).held).toEqual([...moved.slice(0, 15), 2.57]);
  await settle();
  await expect(field).toHaveValue(`${unfinished}, 2.57`);
  await expect(field).toHaveAttribute("aria-invalid", "false");

  // A change from outside the field (Undo, an AI client) replaces the text.
  await page.evaluate(async url => (await import(/* @vite-ignore */ url)).lateMatrixOwner.replace([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]), fixture);
  await expect(field).toHaveValue("2, 0, 0, 0,\n0, 2, 0, 0,\n0, 0, 2, 0,\n0, 0, 0, 1");
  // The text an outside change replaced is not kept back when it is retyped and saved.
  await field.fill(moved.join(", "));
  await expect.poll(async () => (await owner(true)).held).toEqual(moved);
  await settle();
  await expect(field).toHaveValue(moved.join(", "));
});
