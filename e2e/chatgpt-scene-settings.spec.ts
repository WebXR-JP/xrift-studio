import { expect, test, type Page } from "@playwright/test";
import type { ChatgptGeneration } from "../src/lib/visual-editor/chatgpt-generation";
import type { XriftMcpEditorResponse } from "../src/lib/tauri";

async function call(page: Page, tool: string, args: Record<string, unknown> = {}, fresh = false) {
  return page.evaluate(async ({ tool, args, fresh }) => {
    const path = "/src/release-e2e/mock-tauri.ts";
    const { callReleaseE2EMcp: call } = await import(/* @vite-ignore */ path);
    const context = fresh ? (await call("get_editor_context")).result : {};
    return call(tool, { ...(fresh ? { projectId: context.projectId, sceneId: context.sceneId, expectedRevision: context.revision } : {}), ...args });
  }, { tool, args, fresh }) as Promise<XriftMcpEditorResponse>;
}
async function ready(page: Page) {
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  expect((await call(page, "create_project", { name: "chatgpt-settings-isolated-fixture", kind: "world", templateId: "blank" })).ok).toBe(true);
  await page.evaluate(() => { window.__XRIFT_RELEASE_E2E__!.chatgpt = { signedIn: true, email: "fixture@example.invalid", planUsageEnabled: true, connecting: false, restoring: false, error: null }; });
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
}
async function setPlan(page: Page, operations: unknown[]) {
  await page.evaluate(operations => { window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "Sceneの設定", description: "既存の配置を保って設定します", objects: [], operations }); }, operations);
}
async function generate(page: Page, mode = "build") {
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "SkyboxとBGMとColliderを調整して", mode }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result!.generationId as string;
}
async function job(page: Page, generationId: string) {
  const response = await call(page, "get_chatgpt_generation", { generationId });
  expect(response.ok, JSON.stringify(response)).toBe(true);
  return response.result as ChatgptGeneration;
}
async function savedScene(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/src/lib/tauri.ts";
    const project = window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!;
    const files = await (await import(/* @vite-ignore */ modulePath)).tauri.readVisualProject(project.path);
    return JSON.parse(files.sceneDocuments[0].content);
  });
}

test("作業の記録は連続するScene設定も項目名と実際の変更前後で区別できる", async ({ page }, info) => {
  await ready(page);
  expect((await call(page, "update_scene_settings", { skybox: { enabled: false, rotationDegrees: 0 }, fog: { near: 10, far: 100 }, ambient: { intensity: 0.3 }, postprocessing: { exposure: 1, bloom: { strength: 0.1 } } }, true)).ok).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  await page.evaluate(() => {
    const settings = [
      { skybox: { rotationDegrees: 45 } },
      { skybox: { enabled: true, iblEnabled: true } },
      { ambient: { intensity: 0.4 } },
      { fog: { near: 30, far: 180 } },
      { postprocessing: { exposure: 0.9 } },
      { postprocessing: { bloom: { strength: 0.2 } } },
      { postprocessing: { grading: { temperature: 0.15 } } },
      { vegetation: { windStrength: 0.4 } },
    ];
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "公園の配置と空を調整", description: "具体的な設定を順に更新", objects: [],
      edits: [{ entityId: "starter-floor", name: "公園の芝生", position: [1, 0, 0], scale: [10, 1, 8] }, { entityId: "starter-box", name: "中央の散歩道", position: [-2, 0.1, 1], rotation: [0, 45, 0] }],
      operations: settings.map(patch => ({ kind: "scene-settings", settingsJson: JSON.stringify(patch) })),
    });
  });
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const generation = await job(page, id);
  const saved = generation.progress.recentEvents.filter(event => event.saved).map(event => event.message);
  expect(saved).toHaveLength(10);
  expect(saved[0]).toContain("公園の芝生");
  expect(saved[0]).toContain("大きさ：");
  expect(saved[1]).toContain("中央の散歩道");
  expect(saved[1]).toContain("Y 45°");
  expect(saved[2]).toContain("Skyboxの水平回転：0° → 45°");
  expect(saved[3]).toContain("Skyboxの背景表示：非表示 → 表示");
  expect(saved[3]).not.toContain("IBL"); // Requested true was normalized to the existing false.
  expect(saved[4]).toContain("Ambient Lightの強さ：0.3 → 0.4");
  expect(saved[5]).toContain("Fogの開始距離：10 → 30");
  expect(saved[5]).toContain("Fogの終了距離：100 → 180");
  expect(saved[6]).toContain("画面全体の露出：1 → 0.9");
  expect(saved[7]).toContain("Bloomの強さ：0.1 → 0.2");
  expect(saved[8]).toContain("Color Gradingの色温度：0 → 0.15");
  expect(saved[9]).toContain("風の強さ：");
  expect(new Set(saved).size).toBe(10);
  expect(saved.some(message => message.includes("Scene設定を調整"))).toBe(false);
  expect(generation.plan!.objects.some(object => object.name === "Scene設定を調整")).toBe(false);
  expect(generation.plan!.objects.some(object => object.name === "Fogの開始距離・Fogの終了距離を変更")).toBe(true);
  expect(generation.plan!.objects.some(object => object.detail?.includes("Fogの開始距離：10 → 30"))).toBe(true);
  const log = page.getByRole("region", { name: "作業の記録", exact: true });
  await expect(log.getByText(saved[5], { exact: true })).toBeVisible();
  await log.getByText(saved[5], { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("specific-work-log.png") });
  expect((await savedScene(page)).settings.skybox.iblEnabled).toBe(false);
});

for (const width of [1440, 375]) test(`FogをJSONやPlan見出しではなく設定項目として表示し、確認して反映できる（${width}px）`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: width < 600 ? 812 : 1100 });
  await ready(page);
  const before = await savedScene(page);
  await setPlan(page, [{ kind: "scene-settings", settingsJson: JSON.stringify({ fog: { enabled: true, color: "#dce8ed", near: 35, far: 110 } }) }]);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  const chat = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const fields = chat.getByLabel("設定項目", { exact: true });
  await expect(fields).toHaveCount(1);
  for (const text of ["Fog", "オン", "Fogの色", "#dce8ed", "Fogの開始距離", "Fogの終了距離"]) await expect(fields.getByText(text, { exact: true })).toBeVisible();
  await expect(fields).toContainText("35");
  await expect(fields).toContainText("110");
  await expect(fields).toContainText("変更前：");
  await expect(chat.getByText("Plan：Sceneの設定", { exact: true })).toHaveCount(0);
  await expect(chat).not.toContainText('"enabled"');
  await expect(chat).not.toContainText("fog:");
  expect(await savedScene(page)).toEqual(before);
  await fields.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("fog-settings-fields.png") });
  await chat.getByRole("button", { name: "変更を反映", exact: true }).click();
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect((await savedScene(page)).settings.fog).toMatchObject({ enabled: true, color: "#dce8ed", near: 35, far: 110 });
  await expect(fields.getByText("オン", { exact: true })).toBeVisible();
});

test("Skybox・Audio Source・Colliderを順次保存し配置を保持、再表示しても設定が残る", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const created = await call(page, "create_primitive", { shape: "box", position: [2, 1, -3] }, true);
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const entityId = created.result!.entityId as string;
  expect((await call(page, "update_transform", { entityId, rotation: [0, 0.6, 0], scale: [2, 1, 3] }, true)).ok).toBe(true);
  const audio = await call(page, "add_component", { entityId, definitionId: "core.audio-source" }, true);
  expect(audio.ok, JSON.stringify(audio)).toBe(true);
  await expect.poll(async () => (await call(page, "get_editor_context")).result?.saveStatus).toBe("saved");
  const before = await savedScene(page);
  await setPlan(page, [
    { kind: "skybox", enabled: true, iblEnabled: false, rotationDegrees: 35, exposure: 0.7 },
    { kind: "audio", entityId, componentId: audio.result!.componentId, volume: 0.2, loop: true, spatial: false, autoplay: true },
    { kind: "mesh-collision", entityId, action: "add" },
  ]);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  expect((await job(page, id)).progress.completed).toBe(3);
  const after = await savedScene(page);
  expect(after.settings.skybox).toMatchObject({ enabled: true, iblEnabled: false, rotationDegrees: 35, exposure: 0.7 });
  expect(after.entities[entityId].components.find((c: { type: string }) => c.type === "audio-source")).toMatchObject({ volume: 0.2, loop: true, spatial: false, autoplay: true });
  expect(after.entities[entityId].components.some((c: { type: string }) => c.type === "collider")).toBe(true);
  expect(after.entities[entityId].components.find((c: { type: string }) => c.type === "transform")).toEqual(before.entities[entityId].components.find((c: { type: string }) => c.type === "transform"));
  expect(after.entities[entityId].name).toBe(before.entities[entityId].name);
  await page.screenshot({ path: info.outputPath("settings-saved.png") });
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  expect((await savedScene(page)).settings.skybox).toEqual(after.settings.skybox);
  expect(errors).toEqual([]);
});

for (const builtin of [false, true]) {
  test(`画像なしのIBL指定でも空の制作を完了する（組み込み素材: ${builtin}）`, async ({ page }) => {
    await ready(page);
    const candidateId = builtin ? await page.evaluate(async () => {
      const path = "/src/lib/visual-editor/chatgpt-builtin-catalog.ts";
      const { listChatgptBuiltinCandidates } = await import(/* @vite-ignore */ path);
      return listChatgptBuiltinCandidates("world", "空").find((candidate: { providerId: string }) => candidate.providerId === "xrift-sky-shaders")!.candidateId;
    }) : undefined;
    // Direct MCP callers still receive validation errors for invalid settings.
    expect((await call(page, "update_scene_settings", { skybox: { iblEnabled: true } }, true)).ok).toBe(false);
    await setPlan(page, [{ kind: "skybox", candidateId, enabled: true, iblEnabled: true, exposure: 0.8 }]);
    const id = await generate(page);
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    expect((await job(page, id)).error).toBeUndefined();
    const scene = await savedScene(page);
    expect(scene.settings.skybox).toMatchObject({ enabled: true, iblEnabled: false, exposure: 0.8 });
    if (builtin) expect(scene.settings.skybox.materialAssetId).toBeTruthy();
    expect(scene.settings.skybox.imageAssetId).toBeUndefined();
    const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
    expect((await call(page, "close_project")).ok).toBe(true);
    expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
    expect((await savedScene(page)).settings.skybox).toEqual(scene.settings.skybox);
  });
}

test("IBLの補正は既存画像と新規画像の指定を保つ", async ({ page }) => {
  await ready(page);
  const patches = await page.evaluate(async () => {
    const helperPath = "/src/lib/visual-editor/chatgpt-skybox.ts";
    const starterPath = "/src/lib/visual-editor/starter-templates.ts";
    const { normalizeChatgptSkyboxPatch: normalize } = await import(/* @vite-ignore */ helperPath);
    const { createStarterVisualProject } = await import(/* @vite-ignore */ starterPath);
    const bundle = createStarterVisualProject("world", "blank");
    bundle.scene.settings = { ...bundle.scene.settings, skybox: { imageAssetId: "existing-image", iblEnabled: false } };
    return [normalize(bundle, { iblEnabled: true }), normalize(bundle, { imageAssetId: "new-image", iblEnabled: true }),
      normalize(bundle, { imageAssetId: null, iblEnabled: true }), normalize(bundle, { iblEnabled: false }), normalize(bundle, { exposure: 2 })];
  });
  expect(patches).toEqual([{ iblEnabled: true }, { imageAssetId: "new-image", iblEnabled: true },
    { imageAssetId: null, iblEnabled: false }, { iblEnabled: false }, { exposure: 2 }]);
});

for (const mode of ["build", "plan"]) {
  test(`前提不足を再計画し保存済みの配置を重複しない（${mode}）`, async ({ page }) => {
    await ready(page);
    const empty = await call(page, "create_empty_entity", { name: "Meshのない対象" }, true);
    expect(empty.ok, JSON.stringify(empty)).toBe(true);
    const floorId = Object.values((await savedScene(page)).entities).find((entity: any) => entity.name === "Plane") as any;
    await page.evaluate(async ({ emptyId, floorId }) => {
      const path = "/src/lib/tauri.ts";
      const { tauri } = await import(/* @vite-ignore */ path);
      const plan = tauri.chatgptPlan.bind(tauri);
      let rounds = 0;
      tauri.chatgptPlan = async (...args: Parameters<typeof import("../src/lib/tauri").tauri.chatgptPlan>) => {
        rounds++;
        window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify({ title: "Colliderを設定", description: "配置済みの結果を保って設定します",
          objects: rounds === 1 ? [{ name: "保存済みの球", shape: "sphere", position: [0, 1, 0], scale: [1, 1, 1] }] : [],
          operations: [{ kind: "mesh-collision", entityId: rounds === 1 ? emptyId : floorId, action: "add" }] });
        return plan(...args);
      };
    }, { emptyId: empty.result!.entityId, floorId: floorId.id });
    const id = await generate(page, mode);
    if (mode === "plan") {
      await expect.poll(async () => (await job(page, id)).status).toBe("planned");
      expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
    }
    await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
    if (mode === "plan") {
      await expect.poll(async () => (await job(page, id)).status).toBe("planned");
      expect((await job(page, id)).progress.message).toContain("利用できる素材と設定に合わせた");
      expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
    }
    await expect.poll(async () => (await job(page, id)).status).toBe("completed");
    const state = await job(page, id);
    expect(state.progress.completed).toBe(2);
    expect(state.error).toBeUndefined();
    expect(state.progress.recentEvents.some(event => event.message.includes("利用できる素材と設定で"))).toBe(true);
    const scene = await savedScene(page);
    expect(Object.values(scene.entities).filter((entity: any) => entity.name === "保存済みの球")).toHaveLength(1);
    expect(scene.entities[empty.result!.entityId as string].name).toBe("Meshのない対象");
    expect(scene.entities[floorId.id].components.some((component: any) => component.type === "collider")).toBe(true);
    const contexts = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts);
    expect(JSON.stringify(contexts[1])).toContain("有効なMesh Renderer");
    expect(JSON.stringify(contexts[1])).toContain("重複して追加しない");
  });
}

test("不正なPlanは2回まで考え直し、解決できない場合も内部項目名を停止理由にしない", async ({ page }) => {
  await ready(page);
  await setPlan(page, [{ kind: "skybox", exposure: -1 }]);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("failed");
  expect(await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(3);
  expect((await job(page, id)).error).toContain("素材や設定の組み合わせを自動で解決できなかった");
  expect((await job(page, id)).progress.completed).toBe(0);
});

test("新規ワールドのPlanを修復しても元のSceneへ反映しない", async ({ page }) => {
  await ready(page);
  const before = await savedScene(page);
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const plan = tauri.chatgptPlan.bind(tauri);
    let rounds = 0;
    tauri.chatgptPlan = async (...args: Parameters<typeof import("../src/lib/tauri").tauri.chatgptPlan>) => {
      window.__XRIFT_RELEASE_E2E__!.chatgptPlanFixture = JSON.stringify(++rounds === 1
        ? { title: "不正な設定", description: "", objects: [], operations: [{ kind: "skybox", exposure: -1 }] }
        : { title: "別の作品", description: "新規ワールドに配置", objects: [{ name: "新規作品の球", shape: "sphere", position: [0, 1, 0], scale: [1, 1, 1] }] });
      return plan(...args);
    };
  });
  const response = await call(page, "generate_chatgpt_world", { model: "fixture-model", prompt: "新しいワールドを作って", target: "new", mode: "build" }, true);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  const id = response.result!.generationId as string;
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const state = await job(page, id);
  expect(state.projectId).not.toBe(state.sourceProjectId);
  const original = await savedScene(page);
  expect(original).toEqual(before);
  const contexts = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts);
  expect(JSON.stringify(contexts)).toContain("Planの検証");
});

test("自動再計画中の停止を守り、接続エラーは再計画しない", async ({ page }) => {
  await ready(page);
  await setPlan(page, [{ kind: "skybox", exposure: -1 }]);
  await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const plan = tauri.chatgptPlan.bind(tauri);
    let rounds = 0;
    tauri.chatgptPlan = async (...args: Parameters<typeof import("../src/lib/tauri").tauri.chatgptPlan>) => {
      if (++rounds === 2) window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = true;
      return plan(...args);
    };
  });
  const id = await generate(page);
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
  expect((await call(page, "cancel_chatgpt_generation", { generationId: id })).ok).toBe(true);
  await expect.poll(async () => (await job(page, id)).status).toBe("cancelled");
  await page.evaluate(async () => {
    window.__XRIFT_RELEASE_E2E__!.chatgptPlanGate = false;
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    tauri.chatgptPlan = async () => { throw new Error("接続を確認してください"); };
  });
  const connectionId = await generate(page);
  await expect.poll(async () => (await job(page, connectionId)).status).toBe("failed");
  expect((await job(page, connectionId)).error).toBe("接続を確認してください");
  expect((await job(page, connectionId)).progress.recentEvents.some(event => event.message.includes("考え直して"))).toBe(false);
});

test("Plan待ちに手動変更したSkyboxを上書きしない", async ({ page }) => {
  await ready(page);
  await setPlan(page, [{ kind: "skybox", exposure: 0.5 }]);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await call(page, "update_scene_settings", { skybox: { exposure: 1.8 } }, true)).ok).toBe(true);
  expect((await call(page, "apply_chatgpt_plan", { generationId: id }, true)).ok).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptRequests.length)).toBe(2);
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  expect((await job(page, id)).error).toBeUndefined();
  await expect.poll(async () => (await savedScene(page)).settings.skybox.exposure).toBe(1.8);
});

test("ChatGPTのBGM参照を実WAVで再生し、Play・Stop・Entity操作後も保存とAudioを保つ", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await ready(page);
  const projectPath = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.projects.find(project => project.format === "visual")!.path);
  expect((await call(page, "close_project")).ok).toBe(true);
  const fixture = await page.evaluate(async path => {
    const modulePath = "/e2e/chatgpt-bgm.fixture.ts";
    return (await import(/* @vite-ignore */ modulePath)).installBgmFixture(path);
  }, projectPath);
  expect(fixture.byteLength).toBe(8044);
  expect(fixture.relativePath.endsWith(".wav")).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  await setPlan(page, [{ kind: "audio", entityId: fixture.entityId, componentId: fixture.componentId, candidateId: `project:${fixture.assetId}`, volume: 0.18, loop: true, spatial: false, autoplay: true }]);
  const id = await generate(page, "plan");
  await expect.poll(async () => (await job(page, id)).status).toBe("planned");
  const proposed = (await job(page, id)).plan!.objects[0].detail;
  expect(proposed).toContain("音量 18%"); expect(proposed).toContain("ループ 有効"); expect(proposed).toContain("空間音声 無効");
  const chat = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  await expect(chat.getByText(/音量 18%/)).toBeVisible();
  await page.screenshot({ path: info.outputPath("bgm-plan-detail.png") });
  await chat.getByRole("button", { name: "変更を反映", exact: true }).click();
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const expected = { audioAssetId: fixture.assetId, enabled: true, volume: 0.18, loop: true, spatial: false, autoplay: true };
  const audio = (scene: any) => scene.entities[fixture.entityId]?.components.find((component: any) => component.id === fixture.componentId);
  expect(audio(await savedScene(page))).toMatchObject(expected);
  const runtime = () => page.evaluate(async componentId => {
    const modulePath = "/e2e/chatgpt-bgm.fixture.ts";
    return (await import(/* @vite-ignore */ modulePath)).readBgmRuntime(componentId);
  }, fixture.componentId);
  const rounds = [];
  for (let round = 0; round < 2; round++) {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
    await expect.poll(async () => (await runtime())?.threePlaying).toBe(true);
    // Three Audio smooths gain changes with setTargetAtTime. Observe its
    // settled native gain at the original precision, after playback begins.
    await expect.poll(async () => (await runtime())?.gain).toBeCloseTo(0.18, 5);
    const state = await runtime();
    expect(state).toMatchObject({ audioAssetId: fixture.assetId, spatial: false, playing: true, volume: 0.18, loop: true, contextState: "running" });
    expect(state!.duration).toBeCloseTo(0.25, 4);
    expect(state!.gain).toBeCloseTo(0.18, 5);
    expect(state!.decodedFrames).toBeGreaterThan(0);
    rounds.push(state);
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect.poll(runtime).toBeNull();
    const renamed = await call(page, "rename_entity", { entityId: fixture.entityId, name: `BGMを保って操作${round}` }, true);
    expect(renamed.ok, JSON.stringify(renamed)).toBe(true);
    const moved = await call(page, "update_transform", { entityId: fixture.entityId, position: [round + 1, 0, -2] }, true);
    expect(moved.ok, JSON.stringify(moved)).toBe(true);
    await expect.poll(async () => audio(await savedScene(page))?.audioAssetId).toBe(fixture.assetId);
  }
  await info.attach("real-bgm-play-rounds", { body: JSON.stringify(rounds), contentType: "application/json" });
  expect((await call(page, "delete_entity", { entityId: fixture.entityId }, true)).ok).toBe(true);
  await expect.poll(async () => (await savedScene(page)).entities[fixture.entityId]).toBeUndefined();
  await page.getByRole("group", { name: "編集履歴", exact: true }).getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect.poll(async () => audio(await savedScene(page))?.audioAssetId).toBe(fixture.assetId);
  expect(audio(await savedScene(page))).toMatchObject(expected);
  expect((await call(page, "close_project")).ok).toBe(true);
  expect((await call(page, "open_project", { path: projectPath })).ok).toBe(true);
  expect(audio(await savedScene(page))).toMatchObject(expected);
  expect(errors).toEqual([]);
});


test("旧本体へ新しいresourceContextを送信せず、更新後は同じラッパーで送信できる", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const path = "/src/lib/tauri.ts";
    const { tauri } = await import(/* @vite-ignore */ path);
    const contractPath = "/src/lib/visual-editor/chatgpt-authoring-contract.json";
    const contract = (await import(/* @vite-ignore */ contractPath)).default;
    const invoke = window.__TAURI_INTERNALS__!.invoke!;
    const calls: string[] = []; let stale = true;
    window.__TAURI_INTERNALS__!.invoke = async (command, args, options) => {
      if (command === "chatgpt_authoring_contract") { calls.push(command); if (stale) throw "Command chatgpt_authoring_contract not found"; return contract; }
      if (command === "chatgpt_plan") { calls.push(command); return { plan: "{}", assetCandidates: [] }; }
      return invoke(command, args, options);
    };
    let message = "";
    try { await tauri.chatgptPlan("fixture", "Skyboxを設定して", { models: true, materials: true, audio: true }); } catch (error) { message = String(error); }
    const before = [...calls]; stale = false;
    await tauri.chatgptPlan("fixture", "Skyboxを設定して", { models: true, materials: true, audio: true });
    window.__TAURI_INTERNALS__!.invoke = invoke;
    return { message, before, after: calls };
  });
  expect(result.message).toContain("再起動");
  expect(result.message).not.toContain("unknown field");
  expect(result.before).toEqual(["chatgpt_authoring_contract"]);
  expect(result.after).toEqual(["chatgpt_authoring_contract", "chatgpt_authoring_contract", "chatgpt_plan"]);
});

test("Skybox・環境光・Fog・画面効果・風・物理・編集設定を保存し、変更を戻せる", async ({ page }, info) => {
  await ready(page);
  // Capture both states before authoring a post-effect change.
  const before = await savedScene(page);
  await page.screenshot({ path: info.outputPath("scene-settings-before.png") });
  const patch = {
    shadowMapType: "pcfSoft",
    skybox: { enabled: true, iblEnabled: true, topColor: "#274d88", bottomColor: "#e7b98f", exposure: 0.9 },
    ambient: { color: "#ffeedd", intensity: 0.4 }, fog: { enabled: true, color: "#d8dfea", near: 30, far: 180 },
    camera: { fov: 65, near: 0.1, far: 600 },
    postprocessing: { enabled: true, bloom: { enabled: true, threshold: 0.9, strength: 0.15 }, grading: { enabled: true, temperature: 0.1 } },
    vegetation: { windStrength: 0.25 }, physics: { gravity: 8 }, editor: { gizmo: { gridVisible: false } },
  };
  await setPlan(page, [{ kind: "scene-settings", settingsJson: JSON.stringify(patch) }]);
  const id = await generate(page);
  await expect.poll(async () => (await job(page, id)).status).toBe("completed");
  const after = await savedScene(page);
  expect(after.entities).toEqual(before.entities);
  expect(after.settings.skybox).toMatchObject({ ...patch.skybox, iblEnabled: false });
  for (const key of ["ambient", "fog", "camera", "postprocessing", "vegetation", "physics", "editor"] as const) expect(after.settings[key]).toMatchObject(patch[key]);
  expect(after.settings.postprocessing.grading.saturation).toBe(1);
  const chat = page.getByRole("region", { name: "ChatGPTの制作チャット", exact: true });
  const saveActions = chat.getByRole("group", { name: "この依頼の保存と取り消し", exact: true });
  await expect(saveActions).toContainText("保存済み 1 / 1");
  const revert = saveActions.getByRole("button", { name: "この依頼の変更を戻す", exact: true });
  await expect(revert).toBeVisible();
  await expect(revert).toHaveAttribute("title", /すべての変更/);
  await expect(chat.getByText("Plan：Sceneの設定", { exact: true })).toHaveCount(0);
  const results = chat.getByRole("list", { name: "依頼の作業結果", exact: true });
  await expect(results).toContainText("反映済み");
  await expect(results).toContainText("Shadow Mapの種類");
  await expect(results).not.toContainText("Scene設定を調整");
  await saveActions.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("scene-settings-after.png") });
  const contexts = await page.evaluate(() => window.__XRIFT_RELEASE_E2E__!.chatgptSceneContexts);
  expect(contexts.length).toBeGreaterThan(0);
  await revert.click();
  await expect(saveActions).toContainText("変更を戻しました");
  await expect(revert).toHaveCount(0);
  await expect(results).toContainText("取り消し済み");
  await expect(saveActions.getByRole("progressbar")).toHaveCount(0);
  expect((await savedScene(page)).settings).toEqual(before.settings);
});
