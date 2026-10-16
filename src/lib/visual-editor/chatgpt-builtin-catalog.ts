import type { ChatgptBuiltinAction, ChatgptBuiltinCandidate, ChatgptOperation } from "./chatgpt-resources";
import type { PrototypeVisualProject } from "./prototype-project";
import type { VisualProjectKind } from "./project-document";
import { SKY_SHADER_CATALOG } from "./sky-shader-catalog";
import { WATER_SHADER_CATALOG } from "./water-shader-catalog";
import { TERRAIN_PRESETS } from "./terrain-presets";
import { GLOW_FIXTURE_SHAPES, GLOW_MATERIAL_PRESETS } from "./glow-material-catalog";
import { PARTICLE_AUTHORING_PRESETS, addDefaultParticleAsset } from "./particle-system";
import { getSceneRecipesForProjectKind, type SceneRecipe } from "./scene-recipe-catalog";
import { OPEN_BRUSH_CATALOG } from "./open-brush-catalog";
import { getMaterialShowcaseAsset } from "./material-showcase-catalog";
import { listXriftComponentDefinitions } from "./component-registry";
import { executeXriftMcpEditorTool, type XriftMcpEditorContext, type XriftMcpEditorRequest } from "./mcp-editor-tools";
import { addBuiltinPrimitiveEntity, createScriptComponent } from "./scene-document";
import { instantiateSceneAsset } from "./asset-placement";
import { createDocumentId } from "./document-id";
import { getMaterialAssignmentTarget } from "./material-assignment";
import { normalizeChatgptSkyboxPatch } from "./chatgpt-skybox";
import { ChatgptPlanInputError } from "./chatgpt-plan-recovery";
import { applyChatgptSceneMaterial, chatgptSceneMaterialTargets } from "./chatgpt-scene-material";

type BuiltinOperation = Extract<ChatgptOperation, { kind: "catalog" | "material" | "material-scene" | "skybox" }>;
type Entry = {
  candidate: ChatgptBuiltinCandidate;
  kind: "sky" | "water" | "terrain" | "glow" | "particle" | "recipe" | "open-brush" | "component" | "world-asset";
  key: string;
  materialId?: string;
  shapeId?: string;
};
const entriesByKind = new Map<VisualProjectKind, ReadonlyMap<string, Entry>>();
const candidateId = (providerId: string, key: string) => `builtin:${providerId}:${key}`;

function entry(providerId: string, key: string, name: string, description: string, actions: ChatgptBuiltinAction[], kind: Entry["kind"], extra: Partial<Entry> = {}): Entry {
  return { candidate: { candidateId: candidateId(providerId, key), providerId, name, description, actions }, kind, key, ...extra };
}

function recipeEntry(providerId: string, recipe: SceneRecipe): Entry {
  // Comparison stages have ordinary shared Materials too. Only advertise the
  // authored showcase surface, not a pedestal or the stage's charcoal paint.
  const part = recipe.parts.find(part => (part.kind === "primitive" || part.kind === "model") && part.materialAssetId?.startsWith("builtin-material-showcase-"));
  const materialId = part && "materialAssetId" in part ? part.materialAssetId : undefined;
  const material = materialId ? getMaterialShowcaseAsset(materialId) : undefined;
  return entry(providerId, recipe.id, recipe.name, `${recipe.description} ${recipe.note}`, material ? ["catalog", "material"] : ["catalog"], "recipe", { materialId: material?.id });
}

function trustedEntries(projectKind: VisualProjectKind): ReadonlyMap<string, Entry> {
  const cached = entriesByKind.get(projectKind);
  if (cached) return cached;
  const groups: Entry[][] = [
    SKY_SHADER_CATALOG.map(preset => entry("xrift-sky-shaders", preset.id, preset.label, preset.description, ["skybox", "material"], "sky")),
    WATER_SHADER_CATALOG.map(preset => entry("xrift-water-shaders", preset.id, preset.label, preset.description, ["material"], "water")),
    projectKind === "world" ? TERRAIN_PRESETS.map(preset => entry("xrift-terrain-presets", preset.id, preset.label, preset.description, ["catalog"], "terrain")) : [],
    [
      ...GLOW_MATERIAL_PRESETS.map(preset => entry("xrift-glow-materials", preset.id, `${preset.label}の発光マテリアル`, preset.description, ["material"], "glow")),
      ...GLOW_FIXTURE_SHAPES.flatMap(shape => GLOW_MATERIAL_PRESETS.map(preset => entry("xrift-glow-materials", `${shape.id}/${preset.id}`, `${preset.label}の光る${shape.label}`, shape.description, ["catalog"], "glow", { shapeId: shape.id, key: preset.id }))),
    ],
    PARTICLE_AUTHORING_PRESETS.map(preset => entry("xrift-particle-presets", preset.id, preset.name, preset.description, ["catalog"], "particle")),
    getSceneRecipesForProjectKind(projectKind, "models").map(recipe => recipeEntry("xrift-scene-recipes", recipe)),
    OPEN_BRUSH_CATALOG.map(brush => entry("open-brush", brush.id, brush.label, brush.description, ["material"], "open-brush")),
    getSceneRecipesForProjectKind(projectKind, "materials").map(recipe => recipeEntry("xrift-material-showcases", recipe)),
    getSceneRecipesForProjectKind(projectKind, "gimmicks").map(recipe => recipeEntry("xrift-gimmicks", recipe)),
    [
      ...listXriftComponentDefinitions(projectKind).filter(component => component.importName !== "DevEnvironment").map(component => entry("xrift-components", component.schemaId, component.label, component.description, ["catalog"], "component")),
      ...(["vehicle", "seat"] as const).map(template => entry("xrift-components", `studio.${template}`, template === "vehicle" ? "Vehicle" : "Seat", template === "vehicle" ? "公式Vehicle、車体、座席、タイヤ、煙の設定を含む車" : "Playでクリックして座り、Spaceで立てる椅子", ["catalog"], "world-asset", { key: template })),
    ],
  ];
  // The caller budgets prompt data. Round-robin keeps all shelves represented
  // when its bounded context takes a prefix of this trusted catalog.
  const ordered = new Map<string, Entry>();
  for (let index = 0; groups.some(group => index < group.length); index++) {
    for (const group of groups) {
      const item = group[index];
      if (item) ordered.set(item.candidate.candidateId, item);
    }
  }
  entriesByKind.set(projectKind, ordered);
  return ordered;
}

const shelfSearchTerms: Readonly<Record<string, string>> = {
  "xrift-sky-shaders": "sky skybox 空 天空 背景 星空 夕焼け",
  "xrift-water-shaders": "water 水 水面 海 川 湖",
  "xrift-terrain-presets": "terrain 地形 山 島 草原",
  "xrift-glow-materials": "emissive glow 発光 照明 ネオン",
  "xrift-particle-presets": "particle パーティクル 粒子",
  "xrift-scene-recipes": "3d セット モデル 家 建物",
  "open-brush": "openbrush open brush ブラシ",
  "xrift-material-showcases": "gltf material マテリアル 材質 素材",
  "xrift-gimmicks": "gimmick ギミック 仕掛け ボタン",
  "xrift-components": "xrift component コンポーネント",
};
const normalizedSearchText = (value: string) => value.normalize("NFKC").toLocaleLowerCase();

export function listChatgptBuiltinCandidates(projectKind: VisualProjectKind = "world", query = ""): ChatgptBuiltinCandidate[] {
  const normalizedQuery = normalizedSearchText(query);
  // Match the same catalog names/descriptions as the store's token search.
  // Japanese requests also contain particles between those search words.
  const tokens = [...new Set(normalizedQuery.split(/[\s\p{P}]+|(?:から|まで|して|した|する|ください|ほしい|を|に|の|と|で|へ|が|は|も)/u).filter(token => token.length >= 2))];
  const scored = [...trustedEntries(projectKind).values()].map(({ candidate }, index) => {
    const name = normalizedSearchText(candidate.name);
    const description = normalizedSearchText(`${candidate.description} ${candidate.candidateId}`);
    const aliases = normalizedSearchText(shelfSearchTerms[candidate.providerId] ?? "");
    const aliasWords = aliases.split(" ").filter(Boolean);
    const score = (normalizedQuery.includes(name) && name.length >= 2 ? 24 : 0)
      + tokens.reduce((sum, token) => sum + (name.includes(token) ? 8 : description.includes(token) ? 3 : aliases.includes(token) ? 1 : 0), 0)
      + aliasWords.reduce((sum, alias) => sum + (normalizedQuery.includes(alias) ? 1 : 0), 0);
    return { candidate, index, score };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map(({ candidate }) => ({ ...candidate, actions: [...candidate.actions] }));
}

function runner(initial: PrototypeVisualProject) {
  let bundle = initial;
  let revision = 0;
  return {
    get bundle() { return bundle; },
    replace(next: PrototypeVisualProject) { bundle = next; },
    run(tool: XriftMcpEditorRequest["tool"], args: Record<string, unknown>) {
      const context: XriftMcpEditorContext = { bundle, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision, saveStatus: "dirty" };
      const outcome = executeXriftMcpEditorTool(context, { id: crypto.randomUUID(), tool, arguments: { projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: revision, ...args } });
      bundle = outcome.bundle; revision += outcome.changed ? 1 : 0;
      return outcome.result;
    },
  };
}

async function installMaterial(run: ReturnType<typeof runner>, selected: Entry, projectPath: string): Promise<string> {
  if (selected.kind === "sky" || selected.kind === "water" || selected.kind === "glow") {
    const result = run.run("create_material_from_preset", { kind: selected.kind, presetId: selected.key });
    return result.materialAssetId as string;
  }
  if (selected.kind === "open-brush") {
    const { applyOpenBrushCatalogInstall } = await import("./external-store");
    const brush = OPEN_BRUSH_CATALOG.find(item => item.id === selected.key)!;
    const installed = applyOpenBrushCatalogInstall(run.bundle.assets, brush);
    run.replace({ ...run.bundle, assets: installed.manifest });
    return installed.primaryAssetId;
  }
  const material = selected.materialId ? getMaterialShowcaseAsset(selected.materialId) : undefined;
  if (!material) throw new Error("この候補には割り当てられるマテリアルがありません");
  const existing = run.bundle.assets.assets[material.id];
  if (existing && existing.kind !== "material") throw new Error("マテリアルのIDが別の素材に使用されています");
  const source = existing?.kind === "material" ? existing : material;
  const { ensureCatalogMaterialTextures } = await import("./asset-import-persistence");
  const manifest = await ensureCatalogMaterialTextures(projectPath, run.bundle.assets, source.properties);
  if (!manifest) throw new Error("マテリアルのテクスチャを保存できませんでした。接続を確認して再試行してください");
  run.replace({ ...run.bundle, assets: { ...manifest, assets: { ...manifest.assets, [source.id]: source } } });
  return source.id;
}

async function addWorldAsset(bundle: PrototypeVisualProject, templateId: string, projectPath: string): Promise<{ bundle: PrototypeVisualProject; entityId: string }> {
  const [{ ensureWorldAssetModels }, { createWorldAssetHierarchy }, { createScriptAsset, createScriptRelativePath, addScriptAsset }, { createScriptTemplateSource }, { createEmptyEntity }, { createPrefabDocument, addPrefabAsset }, { tauri }] = await Promise.all([
    import("./scripting/world-asset-import"), import("./scripting/world-asset-hierarchy"), import("./scripting/script-files"), import("./scripting/script-templates"), import("./editor-session"), import("./prefab-document"), import("../tauri"),
  ]);
  const name = templateId === "vehicle" ? "Vehicle" : "Seat";
  let assets = await ensureWorldAssetModels(projectPath, bundle.assets, templateId);
  const path = createScriptRelativePath(name, assets, [], "tsx");
  const script = createScriptAsset(createDocumentId("script"), name, path, null, "tsx");
  const source = createScriptTemplateSource(templateId, name);
  if (!source) throw new Error("公式テンプレートが見つかりません");
  await tauri.writeTextFile(projectPath, path, source);
  assets = addScriptAsset(assets, script);
  const created = createEmptyEntity(bundle.scene, null, name);
  if (!created) throw new Error("公式テンプレートの配置先を作成できませんでした");
  const root = created.scene.entities[created.entityId]!;
  const component = createScriptComponent(createDocumentId("component-script"), script.id);
  if (!component) throw new Error("公式テンプレートのScriptを追加できませんでした");
  let scene = { ...created.scene, entities: { ...created.scene.entities, [root.id]: { ...root, components: [...root.components, component] } } };
  scene = createWorldAssetHierarchy(scene, assets, root.id, templateId);
  const prefabId = createDocumentId("prefab");
  const prefab = createPrefabDocument(scene, assets, { prefabId, name, sourceRootEntityIds: [root.id] });
  if (!prefab) throw new Error("公式テンプレートのPrefabを作成できませんでした");
  const added = addPrefabAsset(assets, { id: createDocumentId("asset-prefab"), name, prefabPath: `prefabs/${prefabId}.prefab.json` });
  if (!added.added) throw new Error("公式テンプレートのPrefab素材を追加できませんでした");
  return { bundle: { ...bundle, scene, assets: added.manifest, prefabs: { ...bundle.prefabs, [prefabId]: prefab.document } }, entityId: root.id };
}

/** Builds documents atomically. Shared importers persist trusted dependencies
 * before returning; App must recheck its session before committing the result. */
export async function applyChatgptBuiltinOperation(bundle: PrototypeVisualProject, operation: BuiltinOperation, projectPath: string): Promise<{ bundle: PrototypeVisualProject; entityId?: string }> {
  const selected = operation.candidateId ? trustedEntries(bundle.project.projectKind).get(operation.candidateId) : undefined;
  if (operation.candidateId && !selected) throw new Error("この組み込み候補は現在のプロジェクトで利用できません");
  if (selected && !selected.candidate.actions.includes(operation.kind === "material-scene" ? "material" : operation.kind)) throw new Error("この組み込み候補には指定された操作を使用できません");
  if (operation.kind !== "skybox" && !selected) throw new Error("組み込み候補を指定してください");
  const run = runner(bundle);
  if (operation.kind === "material-scene") {
    if (!chatgptSceneMaterialTargets(bundle).length) throw new ChatgptPlanInputError("Materialを一括変更できるMesh RendererがSceneにありません");
    const materialAssetId = await installMaterial(run, selected!, projectPath);
    applyChatgptSceneMaterial(run.bundle, materialAssetId, args => run.run("set_material", args));
    return { bundle: run.bundle };
  }
  if (operation.kind === "skybox") {
    const { kind: _kind, candidateId: _candidate, ...patch } = operation;
    const materialAssetId = selected ? await installMaterial(run, selected, projectPath) : undefined;
    run.run("update_scene_settings", { skybox: normalizeChatgptSkyboxPatch(run.bundle, { ...patch, ...(materialAssetId ? { materialAssetId, enabled: patch.enabled ?? true } : {}) }) });
    return { bundle: run.bundle };
  }
  if (operation.kind === "material") {
    // Validate the target before fetching or saving any catalog dependencies.
    if (!getMaterialAssignmentTarget(bundle.scene, bundle.assets, operation.entityId, operation.componentId).ready) throw new ChatgptPlanInputError("マテリアルを割り当てられるメッシュが見つかりません");
    const materialAssetId = await installMaterial(run, selected!, projectPath);
    run.run("set_material", { entityId: operation.entityId, materialAssetId, ...(operation.componentId ? { meshComponentId: operation.componentId } : {}) });
    return { bundle: run.bundle, entityId: operation.entityId };
  }
  const chosen = selected!;
  let entityId: string;
  if (chosen.kind === "terrain") {
    if (!Object.values(run.bundle.assets.assets).some(asset => asset.kind === "material")) run.run("create_document_asset", { kind: "material" });
    entityId = run.run("create_terrain_from_preset", { presetId: chosen.key, position: operation.position }).entityId as string;
  } else if (chosen.kind === "glow") {
    const materialAssetId = await installMaterial(run, chosen, projectPath);
    const shape = GLOW_FIXTURE_SHAPES.find(item => item.id === chosen.shapeId)!;
    const added = addBuiltinPrimitiveEntity(run.bundle.scene, run.bundle.assets, shape.creationId, materialAssetId, operation.position);
    if (!added) throw new Error("発光する形を追加できませんでした");
    run.replace({ ...run.bundle, scene: added.scene }); entityId = added.entityId;
  } else if (chosen.kind === "particle") {
    const preset = PARTICLE_AUTHORING_PRESETS.find(item => item.id === chosen.key)!;
    const added = addDefaultParticleAsset(run.bundle.assets, { id: createDocumentId("particle"), name: preset.name, folderId: null, properties: preset.properties });
    if (!added.added) throw new Error("パーティクルを追加できませんでした");
    const placed = instantiateSceneAsset(run.bundle.scene, added.manifest, run.bundle.prefabs, added.assetId, { position: operation.position });
    if (!placed.placed) throw new Error("パーティクルを配置できませんでした");
    run.replace({ ...run.bundle, assets: placed.assets, scene: placed.scene }); entityId = placed.entityId;
  } else if (chosen.kind === "recipe") {
    const { instantiateSceneRecipe } = await import("./scene-recipe-catalog");
    const added = await instantiateSceneRecipe(run.bundle.scene, run.bundle.assets, chosen.key, bundle.project.projectKind, projectPath, operation.position);
    if (!added) throw new Error("3Dセットのモデル・テクスチャ・音を保存できませんでした");
    run.replace({ ...run.bundle, scene: added.scene, assets: added.assets }); entityId = added.rootEntityId;
  } else if (chosen.kind === "component") {
    const { analyzeComponentCode, applyComponentCodeImportPlan, createOfficialXriftComponentSample } = await import("./component-code-import");
    const definition = listXriftComponentDefinitions(bundle.project.projectKind).find(item => item.schemaId === chosen.key)!;
    const plan = analyzeComponentCode(createOfficialXriftComponentSample(definition.importName), bundle.project.projectKind);
    const added = applyComponentCodeImportPlan({ scene: run.bundle.scene, assets: run.bundle.assets, projectKind: bundle.project.projectKind, plan });
    if (!added.entityIds.length || added.diagnostics.some(item => item.severity === "error")) throw new Error(added.diagnostics[0]?.message ?? "公式Componentを追加できませんでした");
    const newIds = new Set(added.entityIds);
    entityId = added.entityIds.find(id => !newIds.has(added.scene.entities[id]?.parentId ?? ""))!;
    run.replace({ ...run.bundle, scene: added.scene, assets: added.assets });
  } else if (chosen.kind === "world-asset") {
    const added = await addWorldAsset(run.bundle, chosen.key, projectPath);
    run.replace(added.bundle); entityId = added.entityId;
  } else throw new Error("この候補はEntityの追加に対応していません");
  if (!entityId || !run.bundle.scene.entities[entityId]) throw new Error("追加したEntityを確認できませんでした");
  run.run("update_transform", { entityId, position: operation.position, ...(operation.rotation ? { rotation: operation.rotation.map(value => value * Math.PI / 180) } : {}), ...(operation.scale ? { scale: operation.scale } : {}) });
  if (operation.name) run.run("rename_entity", { entityId, name: operation.name });
  return { bundle: run.bundle, entityId };
}
