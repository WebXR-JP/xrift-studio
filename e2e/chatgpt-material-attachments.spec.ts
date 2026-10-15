import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { ChatgptResourceContext } from "../src/lib/visual-editor/chatgpt-resources";
import type { AssetManifest } from "../src/lib/visual-editor/asset-manifest";

declare global { interface Window { __XRIFT_MATERIAL_CONTEXTS__?: ChatgptResourceContext[] } }
const chat = (page: Page) => page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
function authored(asset: AssetManifest["assets"][string]) {
  const { thumbnail: _thumbnail, ...content } = asset;
  return content;
}
async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false) {
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
    return { assets: JSON.parse(files.assetManifestJson) as AssetManifest, scene: JSON.parse(files.sceneDocuments[0].content) };
  });
}
async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "material-chat-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(async () => {
    window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptPlan.bind(tauri);
    window.__XRIFT_MATERIAL_CONTEXTS__ = [];
    tauri.chatgptPlan = async (...args: Parameters<typeof tauri.chatgptPlan>) => {
      if (args[7]) window.__XRIFT_MATERIAL_CONTEXTS__!.push(structuredClone(args[7] as ChatgptResourceContext));
      return original(...args);
    };
  });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(chat(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  return Object.values((await saved(page)).assets.assets).filter(asset => asset.kind === "material");
}
async function drop(page: Page, ids: string[], mime = "application/x-xrift-visual-editor-materials", fallback = false) {
  const transfer = await page.evaluateHandle(({ ids, mime, fallback }) => {
    const data = new DataTransfer(), value = mime.endsWith("materials") ? JSON.stringify(ids) : ids[0];
    data.setData(fallback ? "text/plain" : mime, fallback ? JSON.stringify({ type: "xrift-studio/editor-drag", version: 1, data: { [mime]: value } }) : value);
    return data;
  }, { ids, mime, fallback });
  await chat(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).dispatchEvent("drop", { dataTransfer: transfer });
}
async function fixturePlan(page: Page, materialId: string, patch: Record<string, unknown>) {
  await page.evaluate(({ materialId, patch }) => {
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "添付Materialの編集", description: "既存のMaterialの設定を変更します", objects: [], operations: [{ kind: "material-update", candidateId: `project:${materialId}`, propertiesJson: JSON.stringify(patch) }] });
  }, { materialId, patch });
}
async function submit(page: Page, prompt: string) {
  await chat(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true }).fill(prompt);
  await chat(page).getByRole("button", { name: "依頼を送信", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBeGreaterThan(0);
  const id = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.at(-1)!.generationId);
  await expect.poll(async () => ((await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration).status).toBe("completed");
  return (await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration;
}

test("AssetsのMaterialを実ドラッグで添付し、現在値を渡して同じMaterialを編集・保存・取り消す", async ({ page }, info) => {
  const materials = await ready(page);
  const material = materials[0], other = materials[1];
  const before = await saved(page);
  const input = chat(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  const card = page.locator('button[draggable="true"]').filter({ has: page.getByText(material.name, { exact: true }) });
  await card.dragTo(input);
  const attachments = chat(page).getByLabel("添付したMaterial", { exact: true });
  await expect(attachments).toContainText(material.name);
  await card.dragTo(input);
  await expect(attachments.locator("li")).toHaveCount(1);
  const otherCard = page.locator('button[draggable="true"]').filter({ has: page.getByText(other.name, { exact: true }) });
  await card.click();
  await otherCard.click({ modifiers: ["Control"] });
  await otherCard.dragTo(input);
  await expect(attachments.locator("li")).toHaveCount(2);
  await attachments.getByRole("button", { name: `${other.name}のMaterial添付を外す`, exact: true }).click();
  await expect(input).toHaveValue("");
  await page.screenshot({ path: info.outputPath("material-attachment.png") });
  await fixturePlan(page, material.id, { color: "#4a6b3c", roughness: 0.82, metalness: 0.17, opacity: 0.65, alphaMode: "BLEND", emissiveFactor: [0.1, 0, 0] });
  const job = await submit(page, "添付したMaterialを緑色、粗さ0.82、金属感0.17、透明度0.65に変更して");
  expect(job.attachedMaterials).toEqual([{ id: material.id, name: material.name }]);
  const resource = await page.evaluate(id => window.__XRIFT_MATERIAL_CONTEXTS__!.at(-1)!.projectAssets.find(asset => asset.id === id), material.id);
  expect(resource?.attached).toBe(true);
  expect(JSON.parse(resource!.propertiesJson!).pbrMetallicRoughness).toEqual(material.properties.pbrMetallicRoughness);
  const after = await saved(page), changed = after.assets.assets[material.id];
  expect(changed.kind).toBe("material");
  if (changed.kind !== "material") throw new Error("Material missing");
  expect(changed.properties).toMatchObject({ color: "#4a6b3c", roughness: 0.82, metalness: 0.17, opacity: 0.65, alphaMode: "BLEND", emissiveFactor: [0.1, 0, 0] });
  expect(changed.shader).toEqual(material.shader);
  expect(authored(after.assets.assets[other.id])).toEqual(authored(before.assets.assets[other.id]));
  expect(after.scene).toEqual(before.scene);
  await expect(chat(page).getByLabel("添付したMaterial", { exact: true })).toHaveCount(0);
  await expect(chat(page)).toContainText(`添付Material：${material.name}`);
  const settings = chat(page).getByLabel("設定項目", { exact: true });
  await expect(settings).toContainText("Base Color");
  await expect(settings).toContainText("#4a6b3c");
  await expect(settings).toContainText("Roughness");
  await expect(settings).toContainText("0.82");
  await settings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("material-settings.png") });
  await chat(page).getByRole("button", { name: "この依頼の変更を戻す", exact: true }).click();
  const restored = (await saved(page)).assets.assets[material.id];
  expect(authored(restored)).toEqual(authored(before.assets.assets[material.id]));
});

test("複数MaterialとEntityを一緒に添付し、互換JSONを本文へ入れず、チャット別に下書きを保つ", async ({ page }, info) => {
  const materials = await ready(page);
  await chat(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await drop(page, materials.map(asset => asset.id), undefined, true);
  const attachments = chat(page).getByLabel("添付したMaterial", { exact: true });
  await expect(attachments.locator("li")).toHaveCount(2);
  await drop(page, [materials[0].id], "application/x-xrift-visual-editor-material", true);
  await expect(attachments.locator("li")).toHaveCount(2);
  await drop(page, ["starter-floor"], "application/x-xrift-visual-editor-entity", true);
  await expect(chat(page).getByLabel("添付したEntity", { exact: true })).toContainText("Plane");
  const input = chat(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  await expect(input).toHaveValue("");
  await attachments.getByRole("button", { name: `${materials[1].name}のMaterial添付を外す`, exact: true }).click();
  await expect(attachments.locator("li")).toHaveCount(1);
  const first = await chat(page).getByRole("combobox", { name: "制作チャットの履歴", exact: true }).inputValue();
  await input.fill("素材の設定を見直して");
  await chat(page).getByRole("button", { name: "新しいチャット", exact: true }).click();
  await expect(attachments).toHaveCount(0);
  await chat(page).getByRole("combobox", { name: "制作チャットの履歴", exact: true }).selectOption(first);
  await expect(attachments).toContainText(materials[0].name);
  await expect(input).toHaveValue("素材の設定を見直して");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "ChatGPTを開く", exact: true }).click();
  await expect(attachments).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("phone-material-attachments.png") });
});

test("制作中に予約したMaterialをその依頼へ保持し、次の下書きの添付で置き換えない", async ({ page }) => {
  const materials = await ready(page);
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptPlan.bind(tauri);
    tauri.chatgptPlan = async (...args: Parameters<typeof tauri.chatgptPlan>) => {
      const resources = args[7] as ChatgptResourceContext;
      const target = resources.projectAssets.find(asset => asset.attached)!;
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "予約したMaterialを編集", description: target.name, objects: [], operations: [{ kind: "material-update", candidateId: `project:${target.id}`, propertiesJson: JSON.stringify({ roughness: 0.41 }) }] });
      return original(...args);
    };
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true;
  });
  const input = chat(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  await drop(page, [materials[0].id]);
  await input.fill("最初のMaterialの粗さを変更");
  await input.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptPlanWaiting)).toBe(true);
  await drop(page, [materials[1].id]);
  await input.fill("次のMaterialの粗さを変更");
  await input.press("Enter");
  await expect(chat(page).getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText(materials[1].name);
  await drop(page, [materials[0].id]);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; });
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
  const ids = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.map(request => request.generationId));
  for (const id of ids) await expect.poll(async () => ((await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration).status).toBe("completed");
  const contexts = await page.evaluate(() => window.__XRIFT_MATERIAL_CONTEXTS__!.map(context => context.projectAssets.filter(asset => asset.attached).map(asset => asset.id)));
  expect(contexts).toEqual([[materials[0].id], [materials[1].id]]);
  await expect(chat(page).getByLabel("添付したMaterial", { exact: true })).toContainText(materials[0].name);
});

test("送信待ちのMaterialが削除されたら別素材へ置き換えず保留する", async ({ page }) => {
  await ready(page);
  const created = await call(page, "create_document_asset", { kind: "material" }, true);
  expect(created.ok).toBe(true);
  const material = created.result!.asset as { id: string; name: string };
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: false, email: null, planUsageEnabled: false, connecting: false, restoring: false, error: null }; });
  await expect(chat(page).getByRole("button", { name: "ChatGPTに接続", exact: true })).toBeVisible();
  await drop(page, [material.id]);
  const input = chat(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
  await input.fill("添付のMaterialを青色にして");
  await input.press("Enter");
  expect((await call(page, "delete_asset", { assetId: material.id }, true)).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect(chat(page).getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("添付したMaterialを利用できません");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(0);
});
