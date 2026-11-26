import { expect, test, type Page } from "@playwright/test";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";
import type { renderPublishedShaderFailure } from "./custom-shader-compile.fixture";

// The fifth line names a value that does not exist. `#include <common>` sits
// before it on purpose: three.js expands it to dozens of lines, so the line the
// compiler prints is far from the author's, and the mapping has to bridge that.
const BROKEN_FRAGMENT = `uniform vec3 uColor;
varying vec2 vUv;
#include <common>
void main() {
  gl_FragColor = vec4(uColor * missingValue, 1.0);
}`;

const FIXED_FRAGMENT = `uniform vec3 uColor;
varying vec2 vUv;
#include <common>
void main() {
  gl_FragColor = vec4(uColor * (0.5 + 0.5 * vUv.y), 1.0);
}`;

const COMPILER_MESSAGE = "'missingValue' : undeclared identifier";

type CompileIssue = {
  origin: "check" | "scene";
  variants: string[];
  programLog: string;
  vertexLog: string;
  fragmentLog: string;
  lines: { stage: string; severity: string; line?: number; reportedLine: number; message: string; source?: string }[];
};
type Compile = { status: string; issues: CompileIssue[]; nextStep: string; reason?: string };
type ShaderError = { materialAssetId: string; materialName: string; issueCount: number; message: string };

declare global {
  interface Window {
    /** How many Materials had a compile result, each time the record changed. */
    __XRIFT_SHADER_COMPILE_LOG__?: number[];
  }
}

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

async function openBlankWorld(page: Page, name: string) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  expect((await call(page, "create_project", { name, kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
}

async function shaderErrors(page: Page): Promise<ShaderError[]> {
  return (await call(page, "get_editor_context")).result!.customShaderErrors as ShaderError[];
}

async function readCompile(page: Page, materialAssetId: string): Promise<Compile> {
  const response = await call(page, "get_custom_shader", { materialAssetId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.compile as Compile;
}

/** The result the Editor holds for a Material, read without asking it to compile. */
function recordedStatus(page: Page, materialAssetId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    const path = "/src/lib/visual-editor/custom-shader-compile.ts";
    const { customShaderCompileStore } = await import(/* @vite-ignore */ path);
    return customShaderCompileStore.get(id)?.status ?? null;
  }, materialAssetId);
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__?.unhandledCommands ?? [])).toEqual([]);
});

test("コンパイルできないカスタムシェーダーの理由を作者とMCPへ示し、直すと消える", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await openBlankWorld(page, "custom-shader-compile-fixture");
  expect(await shaderErrors(page)).toEqual([]);

  // 1. AIクライアントが壊れたGLSLを書く。保存はされ、結果にコンパイラの言葉が返る。
  const created = await call(page, "create_custom_shader", { name: "Broken Glow", shader: { fragmentShader: BROKEN_FRAGMENT } }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const materialAssetId = created.result!.materialAssetId as string;
  const compile = created.result!.compile as Compile;
  expect(compile.status).toBe("error");
  expect(compile.nextStep).toContain("update_custom_shader");
  const issue = compile.issues[0]!;
  expect(issue.variants).toEqual(["default"]);
  expect(issue.fragmentLog).toMatch(/^ERROR: 0:\d+: 'missingValue' : undeclared identifier/);
  expect(issue.vertexLog).toBe("");
  expect(issue.programLog.length).toBeGreaterThan(0);
  // ログの行番号はThree.jsが前に足すコードと#includeの中身を数える。作者の行は5行目。
  expect(issue.lines).toHaveLength(1);
  expect(issue.lines[0]).toMatchObject({ stage: "fragment", severity: "error", line: 5, message: COMPILER_MESSAGE, source: "gl_FragColor = vec4(uColor * missingValue, 1.0);" });
  expect(issue.lines[0]!.reportedLine).toBeGreaterThan(60);
  expect((created.result!.shader as { fragmentShader: string }).fragmentShader).toBe(BROKEN_FRAGMENT);

  // 2. 作者には、そのMaterialのInspectorで示す。まだどのMeshにも割り当てていない。
  const notice = page.locator('[data-custom-shader-compile="error"]');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute("role", "alert");
  await expect(notice).toContainText("GLSLをコンパイルできません");
  await expect(notice).toContainText("フラグメントシェーダー 5行目");
  await expect(notice).toContainText(COMPILER_MESSAGE);
  await expect(notice).toContainText("「シェーダーコード」の「編集」でこの行を直してください。");
  await notice.getByText("コンパイラのログ", { exact: true }).click();
  await expect(notice.locator("pre")).toContainText("Fragment Shader Log:");
  await expect(notice.locator("pre")).toContainText(/ERROR: 0:\d+: 'missingValue' : undeclared identifier/);
  await page.screenshot({ path: testInfo.outputPath("inspector-compile-error.png") });

  // 3. 読み取りのツールでも同じ結果が読める。
  expect((await readCompile(page, materialAssetId)).status).toBe("error");
  const listed = [{ materialAssetId, materialName: "Broken Glow", issueCount: expect.any(Number), message: `fragment:5: ${COMPILER_MESSAGE}` }];
  expect(await shaderErrors(page)).toEqual(listed);

  // 4. Meshへ割り当てると、Scene Viewが実際に描こうとしたプログラムの失敗として記録される。
  const box = ((await call(page, "list_entities")).result!.entities as { id: string; name: string }[]).find(entity => entity.name === "Box");
  expect(box).toBeDefined();
  expect((await call(page, "set_material", { entityId: box!.id, materialAssetId }, true)).ok).toBe(true);
  await expect.poll(async () => (await readCompile(page, materialAssetId)).issues.some(entry => entry.origin === "scene"), { timeout: 60_000 }).toBe(true);
  const drawn = (await readCompile(page, materialAssetId)).issues.find(entry => entry.origin === "scene")!;
  expect(drawn.lines[0]).toMatchObject({ stage: "fragment", line: 5, message: COMPILER_MESSAGE });
  // 描いて失敗したプログラムについては、Three.js自身のコンソール出力がこれまでどおり残る。
  expect(consoleErrors.some(text => text.includes("THREE.WebGLProgram: Shader Error"))).toBe(true);

  // 5. GLSLを書く場所でも、同じ行を示す。
  const editButtons = page.getByRole("button", { name: "編集", exact: true });
  await expect(editButtons).toHaveCount(2);
  await editButtons.nth(1).click();
  const editor = page.getByLabel("GLSL editor: Broken Glow");
  await expect(editor).toBeVisible({ timeout: 60_000 });
  const strip = editor.locator('[data-shader-editor-compile="error"]');
  await expect(strip).toBeVisible();
  await expect(strip).toHaveAttribute("role", "alert");
  await expect(strip).toContainText("次の行を直してください。保存すると、この表示は消えます。");
  await expect(strip).toContainText(`5行目: ${COMPILER_MESSAGE}`);
  await page.screenshot({ path: testInfo.outputPath("glsl-editor-compile-error.png") });

  // 6. 直したGLSLを送ると結果はokになり、作者への表示もツールの一覧も消える。
  const fixed = await call(page, "update_custom_shader", { materialAssetId, patch: { fragmentShader: FIXED_FRAGMENT } }, true);
  expect(fixed.ok, JSON.stringify(fixed)).toBe(true);
  expect(fixed.result!.compile).toMatchObject({ status: "ok", issues: [] });
  await expect(strip).toHaveCount(0);
  await expect(notice).toHaveCount(0);
  expect(await shaderErrors(page)).toEqual([]);
  expect(await readCompile(page, materialAssetId)).toMatchObject({ status: "ok", issues: [] });
  await page.screenshot({ path: testInfo.outputPath("compile-error-cleared.png") });
  await editor.getByRole("button", { name: "GLSLエディターを閉じる", exact: true }).click();
  await expect(editor).toHaveCount(0);

  // 7. 誰も問い合わせなくても、Scene Viewが描けなかったMaterialは記録される。
  //    もう一度壊し、Inspectorを別の対象へ移す。投影方式を変えるとレンダラーが作り直され、
  //    記録は空になる。そのあと記録が戻るのは、Scene Viewが描いて失敗したからである。
  const broken = await call(page, "update_custom_shader", { materialAssetId, patch: { fragmentShader: BROKEN_FRAGMENT } }, true);
  expect((broken.result!.compile as Compile).status).toBe("error");
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("Plane", { exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.evaluate(async () => {
    const path = "/src/lib/visual-editor/custom-shader-compile.ts";
    const { customShaderCompileStore } = await import(/* @vite-ignore */ path);
    const log: number[] = [];
    window.__XRIFT_SHADER_COMPILE_LOG__ = log;
    customShaderCompileStore.subscribe(() => log.push(Object.keys(customShaderCompileStore.getSnapshots()).length));
  });
  await page.getByLabel("カメラ投影方式").selectOption("orthographic");
  await expect.poll(async () => {
    const log = await page.evaluate(() => window.__XRIFT_SHADER_COMPILE_LOG__ ?? []);
    const emptied = log.indexOf(0);
    return emptied >= 0 && log.slice(emptied).some(count => count > 0);
  }, { timeout: 60_000 }).toBe(true);
  expect(await recordedStatus(page, materialAssetId)).toBe("error");
  expect(await shaderErrors(page)).toEqual(listed);

  // 8. Playでも同じレンダラーで描くので、同じように読めて、直すと消える。
  await page.getByLabel("カメラ投影方式").selectOption("perspective");
  expect((await call(page, "set_play_mode", { mode: "play" }, true)).ok).toBe(true);
  await expect.poll(async () => (await readCompile(page, materialAssetId)).issues.some(entry => entry.origin === "scene"), { timeout: 60_000 }).toBe(true);
  const fixedInPlay = await call(page, "update_custom_shader", { materialAssetId, patch: { fragmentShader: FIXED_FRAGMENT } }, true);
  expect(fixedInPlay.ok, JSON.stringify(fixedInPlay)).toBe(true);
  expect(fixedInPlay.result!.compile).toMatchObject({ status: "ok", issues: [] });
  expect(await shaderErrors(page)).toEqual([]);
  expect((await call(page, "set_play_mode", { mode: "edit" }, true)).ok).toBe(true);
});

test("Meshへ割り当てていないMaterialも、作者の編集だけでコンパイルし直して示す", async ({ page }) => {
  await openBlankWorld(page, "custom-shader-link-fixture");

  // フラグメントだけが読むvarying。各段のコンパイルは通り、リンクで失敗する。
  const linked = await call(page, "create_custom_shader", {
    name: "Link Mismatch",
    shader: {
      vertexShader: "void main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
      fragmentShader: "varying vec3 vMissing;\nvoid main() {\n  gl_FragColor = vec4(vMissing, 1.0);\n}",
    },
  }, true);
  expect(linked.ok, JSON.stringify(linked)).toBe(true);
  const materialAssetId = linked.result!.materialAssetId as string;
  const link = linked.result!.compile as Compile;
  expect(link.status).toBe("error");
  expect(link.issues[0]!.origin).toBe("check");
  expect(link.issues[0]!.lines).toEqual([]);
  expect(link.issues[0]!.programLog).toContain("vMissing");
  const notice = page.locator('[data-custom-shader-compile="error"]');
  await expect(notice).toContainText("頂点とフラグメントの組み合わせ");
  await expect(notice).toContainText("vMissing");

  // 作者がInspectorで初期のシェーダーへ戻す。MCPは使わない。Scene Viewがコンパイルし直し、
  // 結果はokになる。どのMeshも使っていないので、描画の失敗から記録されることはない。
  await page.getByRole("button", { name: "初期のシェーダーに戻す", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => recordedStatus(page, materialAssetId)).toBe("ok");
  expect(await shaderErrors(page)).toEqual([]);

  // 元に戻すと壊れたGLSLへ戻る。これも作者の操作だけで、同じ表示が出る。
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("vMissing");
  await expect.poll(() => recordedStatus(page, materialAssetId)).toBe("error");
  expect(await shaderErrors(page)).toEqual([
    { materialAssetId, materialName: "Link Mismatch", issueCount: 1, message: expect.stringContaining("vMissing") },
  ]);

  // 既定のシェーダーで作ったMaterialはコンパイルでき、何も表示しない。
  const starter = await call(page, "create_custom_shader", { name: "Starter" }, true);
  expect(starter.result!.compile).toMatchObject({ status: "ok", issues: [] });
  await expect(notice).toHaveCount(0);
  expect(await shaderErrors(page)).toHaveLength(1);

  // 読み取りのツールは、記録が無くても自分でコンパイルして答える。レンダラーを作り直すと
  // 記録は消える。このMaterialはどのMeshも使わず、Inspectorも別のMaterialを表示している。
  await page.getByLabel("カメラ投影方式").selectOption("orthographic");
  await expect.poll(() => recordedStatus(page, materialAssetId)).toBe(null);
  expect(await shaderErrors(page)).toEqual([]);
  const reread = await readCompile(page, materialAssetId);
  expect(reread.status).toBe("error");
  expect(reread.issues[0]!.programLog).toContain("vMissing");
  expect(await recordedStatus(page, materialAssetId)).toBe("error");
  expect(await shaderErrors(page)).toHaveLength(1);

  // 未知の#includeは、Three.jsがコンパイルの前に例外にする。Scene Viewは描画へ渡す前に
  // 見つけて、その行を返す。作品へ保存すると描画のたびに例外になるので、ここでは保存せず、
  // Scene Viewのコンパイルだけを呼ぶ。
  const include = await page.evaluate(async () => {
    const path = "/src/lib/visual-editor/custom-shader-compile.ts";
    const { customShaderCompileStore } = await import(/* @vite-ignore */ path);
    return customShaderCompileStore.check({
      id: "unsaved-include-probe",
      shader: {
        kind: "classic-r3f",
        sourceModulePath: "studio://custom-shader",
        vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
        fragmentShader: "varying vec2 vUv;\n#include <no_such_chunk>\nvoid main() {\n  gl_FragColor = vec4(vUv, 0.0, 1.0);\n}",
        uniforms: {},
        variants: [{ name: "default", defines: {}, side: "front", transparent: false, depthWrite: true }],
      },
    });
  }) as { status: string; issues: CompileIssue[] };
  expect(include.status).toBe("error");
  expect(include.issues[0]!.lines[0]).toMatchObject({ stage: "fragment", line: 2, message: "Can not resolve #include <no_such_chunk>" });
});

test("SceneのFogで変わるプログラムの失敗も記録し、Fogを切ってリンクできると消える", async ({ page }) => {
  await openBlankWorld(page, "custom-shader-fog-fixture");
  // 空のワールドは最初からFogが入っている。Fogを切った状態から始める。
  expect((await call(page, "update_scene_settings", { fog: { enabled: false } }, true)).ok).toBe(true);

  // フラグメントだけがfogのチャンクを読む。Fogが無ければ何も展開されずコンパイルできる。
  // Fogを入れるとThree.jsは同じMaterialに別のプログラムを作り、頂点側にvFogDepthが無いのでリンクできない。
  const created = await call(page, "create_custom_shader", {
    name: "Fog Half",
    shader: {
      vertexShader: "varying vec2 vUv;\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}",
      fragmentShader: "uniform vec3 uColor;\nvarying vec2 vUv;\n#include <fog_pars_fragment>\nvoid main() {\n  gl_FragColor = vec4(uColor * vUv.y, 1.0);\n  #include <fog_fragment>\n}",
    },
  }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const materialAssetId = created.result!.materialAssetId as string;
  expect(created.result!.compile).toMatchObject({ status: "ok", issues: [] });
  const box = ((await call(page, "list_entities")).result!.entities as { id: string; name: string }[]).find(entity => entity.name === "Box");
  expect((await call(page, "set_material", { entityId: box!.id, materialAssetId }, true)).ok).toBe(true);
  // Inspectorは別の対象を表示する。ここから先、このMaterialを問い合わせる者はいない。
  await page.getByRole("tree", { name: "シーンのEntity階層" }).getByText("Plane", { exact: true }).click();
  await expect.poll(() => recordedStatus(page, materialAssetId)).toBe("ok");

  expect((await call(page, "update_scene_settings", { fog: { enabled: true } }, true)).ok).toBe(true);
  await expect.poll(() => shaderErrors(page), { timeout: 60_000 }).toEqual([
    { materialAssetId, materialName: "Fog Half", issueCount: expect.any(Number), message: expect.stringContaining("vFogDepth") },
  ]);

  // GLSLは変えていない。Fogを切るとSceneは元のプログラムで描けるので、記録は古くなり、消える。
  expect((await call(page, "update_scene_settings", { fog: { enabled: false } }, true)).ok).toBe(true);
  await expect.poll(() => shaderErrors(page), { timeout: 60_000 }).toEqual([]);
  expect(await recordedStatus(page, materialAssetId)).toBe("ok");
});

test("公開したワールドでは、コンパイルできないMaterialの名前をコンソールへ出す", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible({ timeout: 120_000 });
  const result = await page.evaluate(async () => {
    const url = "/e2e/custom-shader-compile.fixture.tsx";
    return (await import(/* @vite-ignore */ url)).renderPublishedShaderFailure() as ReturnType<typeof renderPublishedShaderFailure>;
  });
  // 同じMaterialを2つのMeshが使っていても、名前を出すのは1回。行は作者のGLSLの行。
  expect(result.errors.filter(text => text.startsWith("[XRift Studio]"))).toEqual([
    "[XRift Studio] Material「看板のGlow」のカスタムシェーダーをコンパイルできませんでした。\nfragment:5: 'missingValue' : undeclared identifier",
  ]);
  // Three.js自身の出力は置き換えない。こちらにはMaterialの名前が無い。
  expect(result.errors.some(text => text.includes("THREE.WebGLProgram: Shader Error") && text.includes("Material Name: \n"))).toBe(true);
  expect(result.afterMoreFrames).toBe(0);
});
