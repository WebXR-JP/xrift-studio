import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const modulePath = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ modulePath);
    const context = fresh ? (await invoke("get_editor_context")).result : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}

test("Skyboxを実サムネイルで比較し、選んだ候補を回答に残して反映する。記録は常時表示する", async ({ page }, info) => {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "visual-choices-isolated", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await page.evaluate(async () => {
    const tauriPath = "/src/lib/tauri.ts";
    let skies: { name: string; candidateId: string }[] = [];
    const { tauri } = await import(/* @vite-ignore */ tauriPath);
    const plan = tauri.chatgptPlan.bind(tauri); let round = 0;
    tauri.chatgptPlan = (...args: Parameters<typeof import("../src/lib/tauri").tauri.chatgptPlan>) => {
      if (round === 0) { skies = args[7]!.builtinCandidates.filter(item => item.providerId === "xrift-sky-shaders").slice(0, 3); if (skies.length !== 3) throw new Error(`Visual-choice budget needs 3 skies, received ${skies.length}`); }
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify(++round === 1
        ? { title: "空を選択", description: "見た目を比べて選んでください", objects: [], questions: [{ question: "どのSkyboxにしますか？", choices: skies.map((item: any) => item.name), choiceCandidateIds: skies.map((item: any) => item.candidateId) }] }
        : round === 2 ? { title: "仕上げの確認", description: "明るさを確認", objects: [], questions: [{ question: "明るさは？", choices: ["柔らかい", "明るい", "暗い"] }] } : { title: "空を反映", description: "選んだSkyboxを設定", objects: [], operations: [{ kind: "skybox", candidateId: skies[1].candidateId, enabled: true, iblEnabled: false }] });
      return plan(...args);
    };
  });
  const started = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "Skyboxを選んで設定して" }, true);
  expect(started.ok).toBe(true);
  const generationId = started.result!.generationId;
  const job = async () => (await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration;
  try { await expect.poll(async () => (await job()).status).toBe("planned"); } catch (error) { await info.attach("generation", { body: JSON.stringify(await job()), contentType: "application/json" }); throw error; }
  const question = (await job()).plan!.questions![0];
  const candidates = question.choices.map((name, index) => ({ name, candidateId: question.choiceCandidateIds![index]! }));
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const form = panel.getByRole("form", { name: "制作の確認事項", exact: true });
  await expect(form.locator("[data-chatgpt-choice-preview]")).toHaveCount(3);
  for (const candidate of candidates) {
    const image = form.locator(`[data-chatgpt-choice-preview="${candidate.candidateId}"] img`);
    await expect(image).toHaveAttribute("src", /visual-editor\/sky-shaders\/v3\/.*\.webp/);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("skybox-candidates.png") });
  await form.getByRole("radio").first().focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await form.getByRole("button", { name: "回答して進める", exact: true }).click();
  await expect.poll(async () => (await job()).plan?.title).toBe("仕上げの確認");
  expect((await job()).clarifications?.[0].candidateId).toBe(candidates[1].candidateId);
  await form.getByRole("radio").first().check();
  await form.getByRole("button", { name: "回答して進める", exact: true }).click();
  await expect.poll(async () => (await job()).status).toBe("completed");
  const log = panel.getByRole("region", { name: "作業の記録", exact: true });
  await expect(log).toBeVisible();
  await expect(log.getByRole("listitem").first()).toBeVisible();
  expect(await log.evaluate(element => element.closest("details"))).toBeNull();
  const result = await page.evaluate(async () => {
    const tauriPath = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ tauriPath)).tauri.readVisualProject(project.path);
    const scene = JSON.parse(files.sceneDocuments[0].content), assets = JSON.parse(files.assetManifestJson);
    return { sky: assets.assets[scene.settings.skybox.materialAssetId], context: window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts[2] };
  });
  expect(result.sky.name).toBe(`空 · ${candidates[1].name}`);
  expect(JSON.stringify(result.context.conversation)).toContain(candidates[1].candidateId);
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    tauri.chatgptPlan = async () => ({ plan: JSON.stringify({ title: "確認のみ", description: "現在の結果を保持", objects: [] }), assetCandidates: [] });
  });
  const next = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "現在の結果を確認して" }, true);
  await expect.poll(async () => ((await call(page, "get_chatgpt_generation", { generationId: next.result!.generationId })).result as ChatgptGeneration).status).toBe("completed");
  const logs = panel.getByRole("region", { name: "作業の記録", exact: true });
  await expect(logs).toHaveCount(2);
  expect(await logs.evaluateAll(elements => elements.every(element => !element.closest("details")))).toBe(true);
});
