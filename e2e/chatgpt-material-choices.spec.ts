import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { ChatgptResourceContext } from "../src/lib/visual-editor/chatgpt-resources";
import type { ChatgptSceneContext, XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ path)).tauri.readVisualProject(project.path);
    return { scene: JSON.parse(files.sceneDocuments[0].content), assets: JSON.parse(files.assetManifestJson) };
  });
}
const material = (snapshot: Awaited<ReturnType<typeof saved>>, id: string) => snapshot.scene.entities[id].components.find((component: any) => component.type === "mesh").materialBindings[0].materialAssetId as string;
const authored = (asset: Record<string, unknown>) => { const { thumbnail: _thumbnail, ...value } = asset; return value; };

for (const count of [1, 2, 3]) test(`Material候補を対象ごとに選び、${count === 1 ? "単体" : count === 2 ? "選んだ一部" : "指定した全体"}だけ変更する`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: `material-choice-scope-${count}-isolated`, kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const created = await call(page, "create_primitive", { shape: "box", name: "別の箱", position: [3, 1, 0] }, true);
  expect(created.ok).toBe(true);
  const allIds = ["starter-floor", "starter-box", created.result!.entityId as string];
  if (count === 3) for (let index = 0; index < 33; index++) {
    const extra = await call(page, "create_primitive", { shape: "box", name: `一括変更の箱${index}`, position: [index % 6, 1, Math.floor(index / 6)] }, true);
    expect(extra.ok).toBe(true); allIds.push(extra.result!.entityId as string);
  }
  const targets = count === 3 ? allIds : allIds.slice(0, count);
  const questionCount = count === 3 ? 1 : count;
  const initial = await saved(page), shared = material(initial, allIds[0]);
  for (const entityId of allIds) expect((await call(page, "set_material", { entityId, materialAssetId: shared }, true)).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const before = await saved(page);
  await page.evaluate(async ({ targets, bulk }) => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptPlan.bind(tauri);
    let round = 0;
    tauri.chatgptPlan = (...args: Parameters<typeof tauri.chatgptPlan>) => {
      const candidates = (args[7] as ChatgptResourceContext).builtinCandidates.filter(item => item.actions.includes("material") && !item.actions.includes("skybox")).slice(0, 12);
      if (candidates.length !== 12) throw new Error(`Expected 12 surface materials, got ${candidates.length}`);
      const answers = round ? JSON.parse((args[5] as ChatgptSceneContext).conversation!.at(-1)!.result) as { candidateId: string }[] : [];
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify(++round === 1
        ? { title: "Materialを比較", description: "対象ごとに質感を選んでください。選ぶまで変更しません。", objects: [], questions: (bulk ? targets.slice(0, 1) : targets).map((_, index) => ({ question: bulk ? "Scene全体に適用するMaterialは？" : `対象${index + 1}のMaterialは？`, choices: candidates.map(item => item.name), choiceCandidateIds: candidates.map(item => item.candidateId) })) }
        : { title: "選んだMaterialを反映", description: "指定した対象だけ割り当てを変更します。", objects: [], operations: bulk ? [{ kind: "material-scene", candidateId: answers[0].candidateId }] : targets.map((entityId, index) => ({ kind: "material", entityId, candidateId: answers[index].candidateId })) });
      return original(...args);
    };
  }, { targets, bulk: count === 3 });
  const start = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: count === 3 ? "Scene全体を同じ発光するMaterialへ一括変更したいので、候補を1つ選びたい" : "添付した対象だけ発光するMaterialに変えたいので、それぞれ候補を見比べて選びたい", attachedEntityIds: targets }, true);
  expect(start.ok, JSON.stringify(start)).toBe(true);
  const generationId = start.result!.generationId;
  const job = async () => (await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration;
  await expect.poll(async () => (await job()).status).toBe("planned");
  expect((await saved(page)).scene).toEqual(before.scene);
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await panel.getByRole("button", { name: "チャットを広く", exact: true }).click();
  const form = panel.getByRole("form", { name: "制作の確認事項", exact: true });
  const question = (await job()).plan!.questions![0];
  const indexes = question.choiceCandidateIds!.flatMap((id, index) => id?.startsWith("builtin:xrift-glow-materials:") ? [index] : []);
  expect(indexes.length).toBeGreaterThanOrEqual(questionCount);
  const selected = indexes.slice(0, questionCount).map(index => question.choiceCandidateIds![index]);
  for (let pageIndex = 0; pageIndex < questionCount; pageIndex++) {
    await expect(form.locator("[data-chatgpt-choice-preview]")).toHaveCount(12);
    await expect(form.getByText("おすすめ順 · 12候補", { exact: true })).toBeVisible();
    await form.getByRole("radio").nth(indexes[pageIndex]).check();
    if (!pageIndex) await page.screenshot({ path: info.outputPath("material-candidates.png") });
    await form.getByRole("button", { name: pageIndex === questionCount - 1 ? "回答して進める" : "次へ", exact: true }).click();
  }
  await expect.poll(async () => (await job()).status).toBe("completed");
  expect((await job()).clarifications!.map(answer => answer.candidateId)).toEqual(selected);
  const after = await saved(page);
  const expectedAssets = await page.evaluate(async ids => {
    const path = "/src/lib/visual-editor/glow-material-catalog.ts";
    const { glowMaterialAssetId } = await import(/* @vite-ignore */ path);
    return ids.map(id => glowMaterialAssetId(id!.split(":").at(-1)!));
  }, selected);
  expect(targets.map(id => material(after, id))).toEqual(count === 3 ? targets.map(() => expectedAssets[0]) : expectedAssets);
  expect(new Set(expectedAssets).size).toBe(questionCount);
  expect(authored(after.assets.assets[shared])).toEqual(authored(before.assets.assets[shared]));
  for (const id of allIds.filter(id => !targets.includes(id))) expect(after.scene.entities[id]).toEqual(before.scene.entities[id]);
  for (const id of targets) expect(after.scene.entities[id].components.filter((component: any) => component.type !== "mesh")).toEqual(before.scene.entities[id].components.filter((component: any) => component.type !== "mesh"));
  await expect(panel.locator("[data-chatgpt-result-preview]")).toHaveCount(questionCount);
  if (count === 3) { expect((await job()).progress.total).toBe(1); expect((await job()).plan!.objects).toHaveLength(1); }
  expect((await call(page, "revert_chatgpt_generation", { generationId }, true)).ok).toBe(true);
  expect((await saved(page)).scene).toEqual(before.scene);
  expect(errors).toEqual([]);
});
