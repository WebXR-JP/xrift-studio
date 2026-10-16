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
      if (round === 0) { skies = args[7]!.builtinCandidates.filter(item => item.providerId === "xrift-sky-shaders").slice(0, 12).reverse(); if (skies.length !== 12) throw new Error(`Visual-choice budget needs 12 skies, received ${skies.length}`); }
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify(++round === 1
        ? { title: "空を選択", description: "見た目を比べて選んでください", objects: [], questions: [{ question: "どのSkyboxにしますか？", choices: skies.map((item: any) => item.name), choiceCandidateIds: skies.map((item: any) => item.candidateId) }] }
        : round === 2 ? { title: "仕上げの確認", description: "明るさを確認", objects: [], questions: [{ question: "明るさは？", choices: ["柔らかい", "明るい", "暗い"] }] } : { title: "空を反映", description: "選んだSkyboxを設定", objects: [], operations: [{ kind: "skybox", candidateId: skies[7].candidateId, enabled: true, iblEnabled: false }] });
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
  await expect(form.locator("[data-chatgpt-choice-preview]")).toHaveCount(12);
  for (const candidate of candidates) {
    const image = form.locator(`[data-chatgpt-choice-preview="${candidate.candidateId}"] img`);
    await expect(image).toHaveAttribute("src", /visual-editor\/sky-shaders\/v3\/.*\.webp/);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(form.getByText("おすすめ順 · 12候補", { exact: true })).toBeVisible();
  expect(await form.locator("[data-chatgpt-choice-preview]").evaluateAll(elements => elements.map(element => element.getAttribute("data-chatgpt-choice-preview")))).toEqual(candidates.map(candidate => candidate.candidateId));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 1440) await panel.getByRole("button", { name: "チャットを広く", exact: true }).click();
    await form.getByRole("radio").first().scrollIntoViewIfNeeded();
    expect(await form.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`skybox-candidates-${width}.png`) });
  }
  await form.getByRole("radio").first().focus();
  for (let index = 0; index < 7; index++) await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await form.getByRole("button", { name: "回答して進める", exact: true }).click();
  await expect.poll(async () => (await job()).plan?.title).toBe("仕上げの確認");
  expect((await job()).clarifications?.[0].candidateId).toBe(candidates[7].candidateId);
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
  const expectedSkyName = await page.evaluate(async candidateId => {
    const path = "/src/lib/visual-editor/chatgpt-builtin-catalog.ts";
    const { listChatgptBuiltinCandidates } = await import(/* @vite-ignore */ path);
    return listChatgptBuiltinCandidates("world", "Skyboxを選んで設定して").find((candidate: { candidateId: string }) => candidate.candidateId === candidateId)!.name;
  }, candidates[7].candidateId);
  expect(result.sky.name).toBe(`空 · ${expectedSkyName}`);
  expect(JSON.stringify(result.context.conversation)).toContain(candidates[7].candidateId);
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

test("素材集の提案名の下に実プレビューを表示し、変更予定と会話履歴にも残す", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "catalog-thumbnails-isolated", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptPlan.bind(tauri);
    let candidates: { candidateId: string; name: string }[] = [], round = 0;
    tauri.chatgptPlan = (...args: Parameters<typeof import("../src/lib/tauri").tauri.chatgptPlan>) => {
      if (!round) candidates = ["xrift-scene-recipes", "xrift-material-showcases", "xrift-components"].map(provider => args[7]!.builtinCandidates.find(item => item.providerId === provider)!);
      if (candidates.some(item => !item)) throw new Error("Missing catalog shelf");
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify(++round === 1
        ? { title: "素材の提案", description: "この素材を追加できます。見た目から選んでください。", objects: [], questions: [{ question: "追加したい素材は？", choices: candidates.map(item => item.name), choiceCandidateIds: candidates.map(item => item.candidateId) }] }
        : { title: "素材を追加する予定", description: "選んだ素材をSceneに追加します。", objects: [], operations: [{ kind: "catalog", candidateId: candidates[0].candidateId, position: [0, 0, 0] }] });
      return original(...args);
    };
  });
  const start = await call(page, "generate_chatgpt_world", { model: "fixture-model", mode: "plan", prompt: "Mirrorと焚き火とClearcoatを使いたいので、素材集から追加できる素材を提案して" }, true);
  expect(start.ok).toBe(true);
  const generationId = start.result!.generationId;
  const job = async () => (await call(page, "get_chatgpt_generation", { generationId })).result as ChatgptGeneration;
  await expect.poll(async () => (await job()).status).toBe("planned");
  const panel = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await panel.getByRole("button", { name: "チャットを広く", exact: true }).click();
  const form = panel.getByRole("form", { name: "制作の確認事項", exact: true });
  await expect(form.locator("[data-chatgpt-choice-preview]")).toHaveCount(3);
  for (const card of await form.locator("[data-chatgpt-choice-preview]").all()) {
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator("img").evaluateAll((images: HTMLImageElement[]) => images.some(image => image.complete && image.naturalWidth > 0))).toBe(true);
    expect(await card.evaluate(element => element.getBoundingClientRect().top >= element.previousElementSibling!.getBoundingClientRect().bottom)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("catalog-choice-thumbnails.png") });
  await form.getByRole("radio").first().check();
  await form.getByRole("button", { name: "回答して進める", exact: true }).click();
  await expect.poll(async () => (await job()).plan?.title).toBe("素材を追加する予定");
  const preview = panel.locator("[data-chatgpt-result-preview]");
  await preview.scrollIntoViewIfNeeded();
  await expect.poll(() => preview.locator("img").evaluateAll((images: HTMLImageElement[]) => images.some(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(panel.getByRole("button", { name: "変更を反映", exact: true })).toBeVisible();
  expect((await job()).progress.completed).toBe(0);
  await page.screenshot({ path: info.outputPath("catalog-proposal-thumbnail.png") });
  expect((await call(page, "cancel_chatgpt_generation", { generationId })).ok).toBe(true);
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    tauri.chatgptPlan = async () => ({ plan: JSON.stringify({ title: "確認", description: "現在のSceneを保持", objects: [] }), assetCandidates: [] });
  });
  const next = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "確認して" }, true);
  await expect.poll(async () => ((await call(page, "get_chatgpt_generation", { generationId: next.result!.generationId })).result as ChatgptGeneration).status).toBe("completed");
  await expect(preview).toHaveCount(1);
  await preview.scrollIntoViewIfNeeded();
  await expect.poll(() => preview.locator("img").evaluateAll((images: HTMLImageElement[]) => images.some(image => image.complete && image.naturalWidth > 0))).toBe(true);
  expect(errors).toEqual([]);
});
