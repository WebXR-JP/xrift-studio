import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { ChatgptSceneContext, XriftMcpEditorResponse } from "../src/lib/tauri";

declare global {
  interface Window {
    __XRIFT_GOAL_TEST__?: { calls: { id: string; prompt: string; scene?: ChatgptSceneContext }[]; holdPass: number; released: boolean };
  }
}
const panel = (page: Page) => page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
const input = (page: Page) => panel(page).getByRole("textbox", { name: "ワールドへの依頼", exact: true });
const empty = { title: "目標の確認", description: "目標に必要な構成を確認しました", objects: [], hasMore: false };
async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false): Promise<XriftMcpEditorResponse> {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: invoke } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await invoke("get_editor_context")).result! : {};
    return invoke(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh });
}
async function ready(page: Page, plans: Record<string, unknown>[], holdPass = 0) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "goal-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await page.evaluate(async ({ plans, holdPass }) => {
    const fixture = window.__XRIFT_RELEASE_E2E__!;
    fixture.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null };
    window.__XRIFT_GOAL_TEST__ = { calls: [], holdPass, released: false };
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const original = tauri.chatgptPlan.bind(tauri) as typeof import("../src/lib/tauri").tauri.chatgptPlan;
    tauri.chatgptPlan = async (...args: Parameters<typeof original>) => {
      const state = window.__XRIFT_GOAL_TEST__!;
      state.calls.push({ id: args[4]!, prompt: args[1], scene: structuredClone(args[5]) });
      fixture.chatgptPlanGate = state.calls.length === state.holdPass && !state.released;
      fixture.chatgptPlanFixture = JSON.stringify(plans[Math.min(state.calls.length - 1, plans.length - 1)]);
      return original(...args);
    };
  }, { plans, holdPass });
  expect((await call(page, "open_chatgpt_panel")).ok).toBe(true);
  await expect(panel(page).getByRole("combobox", { name: "ワールド制作のモデル", exact: true })).toHaveValue("fixture-model");
}
async function send(page: Page, prompt = "/goal 広場全体の配置と見た目を仕上げてください") { await input(page).fill(prompt); await input(page).press("Enter"); }
async function calls(page: Page) { return page.evaluate(() => window.__XRIFT_GOAL_TEST__!.calls); }
async function generation(page: Page, id: string) { return (await call(page, "get_chatgpt_generation", { generationId: id })).result as ChatgptGeneration; }
async function firstId(page: Page) { await expect.poll(async () => (await calls(page)).length).toBeGreaterThan(0); return (await calls(page))[0].id; }
async function release(page: Page) { await page.evaluate(() => { window.__XRIFT_GOAL_TEST__!.released = true; window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false; }); }
async function floor(page: Page, projectId?: string) {
  const response = await call(page, "get_editor_context");
  const project = projectId ?? response.result!.projectId;
  return page.evaluate(async project => {
    const path = "/src/lib/tauri.ts";
    const native = (await import(/* @vite-ignore */ path)).tauri;
    const fixture = window.__XRIFT_RELEASE_E2E__!;
    for (const source of fixture.projects.filter(p => p.format === "visual")) {
      const files = await native.readVisualProject(source.path);
      if (JSON.parse(files.projectJson).projectId === project) return JSON.parse(files.sceneDocuments[0].content).entities["starter-floor"];
    }
    throw new Error("Isolated project not found");
  }, project);
}

test("/goalは保存後も同じ依頼で見直し、完了まで次の依頼を待たせる", async ({ page }, info) => {
  await ready(page, [
    { ...empty, edits: [{ entityId: "starter-floor", name: "広場の床" }], hasMore: true, remainingWork: "床の位置を整える" },
    { ...empty, edits: [{ entityId: "starter-floor", position: [3, 0, 0] }] }, empty,
  ], 2);
  await input(page).fill("/goal");
  await expect(panel(page).getByRole("button", { name: "依頼を送信", exact: true })).toBeDisabled();
  await input(page).press("Enter"); await expect(input(page)).toHaveValue("/goal");
  await send(page); const id = await firstId(page);
  try {
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    expect((await generation(page, id)).status).toBe("running");
    expect((await calls(page))[1].scene!.entities.find(e => e.id === "starter-floor")!.name).toBe("広場の床");
    await send(page, "Goalの後で確認する依頼"); await input(page).fill("入力中の下書き");
    await expect(panel(page).getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("Goalの後で確認する依頼");
    await panel(page).getByRole("button", { name: "チャットを広く", exact: true }).click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await call(page, "open_chatgpt_panel");
      await expect(panel(page).getByRole("button", { name: "制作を停止", exact: true })).toBeInViewport();
      await expect(input(page)).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`goal-running-${width}.png`) });
    }
    await release(page);
    await expect.poll(async () => (await generation(page, id)).status).toBe("completed");
    await expect.poll(async () => (await calls(page)).length).toBe(4);
    const requests = await calls(page);
    expect(requests.slice(0, 3).every(request => request.id === id && request.scene!.goal && !request.prompt.startsWith("/goal"))).toBe(true);
    expect(requests[2].scene!.entities.find(e => e.id === "starter-floor")!.position).toEqual([3, 0, 0]);
    expect(requests[2].scene!.conversation!.at(-1)!.result).toContain("保存済み作業: 2件");
    expect(requests[3].scene!.goal).toBeUndefined();
    expect((await generation(page, id)).goal?.iteration).toBe(3);
    expect((await generation(page, id)).progress.completed).toBe(2);
    expect((await floor(page)).name).toBe("広場の床");
    await expect(input(page)).toHaveValue("入力中の下書き");
  } finally { await release(page).catch(() => undefined); }
});

test("Goalの途中で停止すると保存済みの変更を残し、後の依頼も保留する", async ({ page }) => {
  await ready(page, [{ ...empty, edits: [{ entityId: "starter-floor", name: "停止前に保存した床" }], hasMore: true }, empty], 2);
  await send(page); const id = await firstId(page);
  try {
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    await send(page, "停止後に送る依頼");
    await panel(page).getByRole("button", { name: "制作を停止", exact: true }).click();
    await expect.poll(async () => (await generation(page, id)).status).toBe("cancelled");
    expect((await floor(page)).name).toBe("停止前に保存した床");
    await expect(panel(page).getByRole("region", { name: "送信待ちの依頼", exact: true })).toContainText("停止後に送る依頼");
    expect(await calls(page)).toHaveLength(2);
  } finally { await release(page).catch(() => undefined); }
});

test("進展がないGoalは3回で停止し、通常の依頼はhasMoreでも自動継続しない", async ({ page }) => {
  await ready(page, [{ ...empty, hasMore: true, remainingWork: "必要な素材を検討する" }]);
  const result = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "全体を作り込む", mode: "goal" }, true);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  const id = result.result!.generationId as string;
  await expect.poll(async () => (await generation(page, id)).status).toBe("failed");
  expect((await generation(page, id)).error).toContain("3回続けて"); expect(await calls(page)).toHaveLength(3);
  await page.reload();
  await ready(page, [{ ...empty, edits: [{ entityId: "starter-floor", name: "通常の依頼の床" }], hasMore: true }]);
  await send(page, "床の名前を調整してください"); const normalId = await firstId(page);
  await expect.poll(async () => (await generation(page, normalId)).status).toBe("completed");
  expect(await calls(page)).toHaveLength(1); expect((await generation(page, normalId)).mode).toBe("build");
});

test("質問に回答した後もGoalを保ち、改善と最終確認を続ける", async ({ page }) => {
  await ready(page, [
    { ...empty, questions: [{ question: "広場の雰囲気は？", choices: ["静か", "明るい", "落ち着いた"] }] },
    { ...empty, edits: [{ entityId: "starter-floor", name: "静かな広場の床" }] }, empty,
  ]);
  await send(page); const id = await firstId(page);
  await expect.poll(async () => (await generation(page, id)).status).toBe("planned");
  expect(await calls(page)).toHaveLength(1);
  expect((await call(page, "answer_chatgpt_questions", { generationId: id, answers: [{ questionIndex: 0, answer: "静か" }] }, true)).ok).toBe(true);
  await expect.poll(async () => (await generation(page, id)).status).toBe("completed");
  expect(await calls(page)).toHaveLength(3); expect((await generation(page, id)).mode).toBe("goal");
  expect((await calls(page))[2].scene!.conversation!.some(turn => turn.result.includes("静か"))).toBe(true);
  expect((await floor(page)).name).toBe("静かな広場の床");
});

test("別Worldへ移るとGoalを新しいSceneへ適用せず、元の保存結果を残す", async ({ page }) => {
  await ready(page, [{ ...empty, edits: [{ entityId: "starter-floor", name: "元の作品の床" }], hasMore: true }, { ...empty, edits: [{ entityId: "starter-floor", name: "別作品へ反映しない名前" }] }], 2);
  await send(page); const id = await firstId(page);
  try {
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    expect((await call(page, "create_project", { name: "goal-other-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
    await release(page);
    await expect.poll(async () => (await generation(page, id)).status).toBe("cancelled");
    await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
    expect((await floor(page)).name).toBe("Plane"); expect(await calls(page)).toHaveLength(2);
    expect((await floor(page, (await generation(page, id)).sourceProjectId)).name).toBe("元の作品の床");
  } finally { await release(page).catch(() => undefined); }
});
