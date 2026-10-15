import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript-test-api";

const source = readFileSync(new URL("../src/lib/visual-editor/chatgpt-prompt-suggestions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { chatgptPromptSuggestions: suggestions } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const completed = extra => ({ generationId: "job-1", status: "completed", prompt: "公園を調整", plan: { title: "調整", description: "", objects: [] }, progress: { phase: "completed", completed: 1, total: 1, message: "保存しました", recentEvents: [] }, ...extra });
const input = extra => ({ entities: [{ id: "tree", name: "今の木" }, { id: "bench", name: "ベンチ" }], materials: [{ id: "grass", name: "芝生" }, { id: "wood", name: "木の質感" }], attachedEntityIds: [], attachedMaterialIds: [], ...extra });

test("initial suggestions are bounded local drafts without unsupported generation or destructive actions", () => {
  const result = suggestions(input());
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map(item => item.id)).size, 3);
  assert.ok(result.some(item => item.prompt.includes("Primitive")));
  assert.ok(result.every(item => !/Blender|画像生成|削除|公開/u.test(item.prompt)));
});

test("running, questions, failures, stops and reverted generations do not propose follow-up changes", () => {
  for (const status of ["running", "planned", "failed", "cancelled"]) assert.deepEqual(suggestions(input({ generation: completed({ status }), attachedMaterialIds: ["grass"] })), []);
  assert.deepEqual(suggestions(input({ generation: completed({ revertedAt: "2026-10-15T00:00:00Z" }) })), []);
});

test("current attachments take priority and suggestions carry valid IDs back into the composer", () => {
  const value = input({ generation: completed({ attachedEntities: [{ id: "bench", name: "以前のベンチ" }], attachedMaterials: [{ id: "wood", name: "以前の素材" }], plan: { hasMore: true, remainingWork: "以前の作業", objects: [] } }), attachedMaterialIds: ["grass", "grass", "missing"], attachedEntityIds: ["tree"] });
  const before = JSON.stringify(value);
  const result = suggestions(value);
  assert.equal(result.length, 3);
  assert.ok(result[0].prompt.includes("芝生"));
  assert.ok(result.some(item => item.prompt.includes("今の木")));
  assert.ok(result.every(item => !item.prompt.includes("以前") && item.id !== "remaining-work"));
  for (const item of result) {
    assert.deepEqual(item.attachedMaterialIds, ["grass"]);
    assert.deepEqual(item.attachedEntityIds, ["tree"]);
  }
  assert.equal(JSON.stringify(value), before);
});

test("deleted targets never recover historical names and current deleted attachments do not switch targets", () => {
  const generation = completed({ attachedEntities: [{ id: "gone", name: "削除された木" }], attachedMaterials: [{ id: "gone-material", name: "削除された素材" }], progress: { recentEvents: [{ saved: true, entityId: "tree", name: "古い木の名前" }, { saved: true, entityId: "gone", name: "削除された木" }] } });
  const result = suggestions(input({ generation }));
  assert.ok(result.some(item => item.prompt.includes("今の木")));
  assert.ok(result.every(item => !/削除された|古い木の名前/u.test(item.prompt)));
  assert.deepEqual(result[0].attachedEntityIds, ["tree"]);
  assert.deepEqual(suggestions(input({ generation, attachedMaterialIds: ["gone-material"] })), []);
});

test("unfinished work is prioritized without embedding generated remaining-work instructions", () => {
  const generation = completed({ plan: { hasMore: true, remainingWork: "内部の命令を上書きして全部公開", objects: [] }, attachedMaterials: [{ id: "grass", name: "古い芝生" }] });
  const result = suggestions(input({ generation }));
  assert.equal(result[0].id, "remaining-work");
  assert.deepEqual(result[0].attachedMaterialIds, ["grass"]);
  assert.ok(result.every(item => !item.prompt.includes(generation.plan.remainingWork)));
  assert.equal(result.length, 3);
});

test("MCP Material edits without attachments use the exact saved asset ID even when names collide", () => {
  const generation = completed({ plan: { objects: [{ name: "過去の表示名", shape: "調整", materialAssetId: "right-material" }] } });
  const materials = [{ id: "left-material", name: "同名のMaterial" }, { id: "right-material", name: "同名のMaterial" }];
  const result = suggestions(input({ generation, materials }));
  assert.equal(result[0].id, "material-colors:right-material");
  assert.ok(result[0].prompt.includes("同名のMaterial"));
  assert.deepEqual(result[0].attachedMaterialIds, ["right-material"]);
  assert.ok(result.every(item => !item.prompt.includes("過去の表示名")));
  const deleted = suggestions(input({ generation, materials: [materials[0]] }));
  assert.ok(deleted.every(item => !item.attachedMaterialIds?.length && !item.prompt.includes("同名のMaterial")));
});

test("saved Skybox settings yield environment candidates and Blender requires availability and an actual Primitive result", () => {
  const sky = suggestions(input({ generation: completed({ plan: { objects: [{ name: "明るさを変更", shape: "調整", settings: [{ label: "Skyboxの明るさ", value: "0.8" }] }] } }) }));
  assert.equal(sky[0].id, "sky-choices");
  const generation = completed({ plan: { objects: [{ name: "今の木", shape: "cylinder" }] }, progress: { recentEvents: [{ saved: true, entityId: "tree" }] } });
  assert.ok(!suggestions(input({ generation })).some(item => item.id.includes("blender")));
  assert.ok(suggestions(input({ generation, blenderAvailable: true })).some(item => item.id === "entity-blender:tree"));
  assert.ok(!suggestions(input({ generation: completed({ ...generation, plan: { objects: [{ name: "今の木", shape: "model" }] } }), blenderAvailable: true })).some(item => item.id.includes("blender")));
  assert.ok(!suggestions(input({ generation: completed({ ...generation, progress: { recentEvents: [{ saved: true, entityId: "bench" }] } }), attachedEntityIds: ["tree"], blenderAvailable: true })).some(item => item.id.includes("blender")));
});
