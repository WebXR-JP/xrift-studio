import {
  getLightmapAsset,
  type AssetManifest,
  type LightmapAsset,
} from "../asset-manifest";
import { sha256Utf8 } from "../compiler/hash";
import {
  isMeshLightBakeTarget,
  type LightBakeMode,
  type LightComponent,
  type LightType,
  type MeshComponent,
  type SceneDocument,
  type SceneEntity,
} from "../scene-document";
import { resolveSceneSettings, type SceneSettings } from "../scene-settings";

/**
 * Sceneの文書から、ライトベイクに関わる情報を読む。
 *
 * 対象のMeshとライトの一覧、今のライトマップ、焼き直しが要るかの判定を扱う。
 * three.jsには触らないので、パネル・コンパイラ・MCPが同じ答えを使える。
 */

/** 細かさの上限（1メートルあたりのピクセル数）。約2.5cm刻み。 */
export const LIGHT_BAKE_MAX_TEXELS_PER_METER = 40;

export type LightBakeMeshEntry = {
  entityId: string;
  name: string;
  componentId: string;
  /** ベイクの対象になっているか。 */
  target: boolean;
  scale: number;
  /** 動くと見込まれる理由。あれば「動かないMeshを選ぶ」の候補から外す。 */
  movableReason?: string;
};

export type LightBakeLightEntry = {
  entityId: string;
  name: string;
  componentId: string;
  lightType: LightType;
  bakeMode: LightBakeMode;
  enabled: boolean;
};

function isEffectivelyEnabled(scene: SceneDocument, entity: SceneEntity): boolean {
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current && !visited.has(current.id)) {
    if (!current.enabled) return false;
    visited.add(current.id);
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return true;
}

function ancestors(scene: SceneDocument, entity: SceneEntity): SceneEntity[] {
  const chain: SceneEntity[] = [];
  const visited = new Set<string>();
  let current: SceneEntity | undefined = entity;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return chain;
}

function meshModelAssetId(mesh: MeshComponent): string {
  return mesh.geometry?.kind === "asset" ? mesh.geometry.assetId : mesh.geometryAssetId;
}

/** 動かす仕組みが付いているか。焼いた陰影は動いても元の場所に残るので、候補から外す。 */
function movableReason(
  scene: SceneDocument,
  assets: AssetManifest,
  entity: SceneEntity,
  mesh: MeshComponent,
): string | undefined {
  for (const current of ancestors(scene, entity)) {
    for (const component of current.components) {
      if (!component.enabled) continue;
      if (component.type === "rigid-body" && component.bodyType !== "fixed") {
        return "物理で動くRigidbodyが付いています";
      }
      if (component.type === "collider" && component.bodyType && component.bodyType !== "fixed") {
        return "物理で動くColliderが付いています";
      }
      if (component.type === "script") return "Scriptが付いています";
      if (component.type === "vegetation-wind") return "風で揺れる設定です";
    }
  }
  const model = assets.assets[meshModelAssetId(mesh)];
  if (model?.kind === "model") {
    if ((model.importMetadata?.animations.length ?? 0) > 0) return "アニメーションを持つModelです";
    if ((model.importMetadata?.bones?.length ?? 0) > 0) return "ボーンを持つModelです";
  }
  return undefined;
}

/** Sceneにある有効なMeshを、ベイクの対象かどうかと合わせて並べる。 */
export function listLightBakeMeshes(
  scene: SceneDocument,
  assets: AssetManifest,
): LightBakeMeshEntry[] {
  const entries: LightBakeMeshEntry[] = [];
  const visit = (entityId: string) => {
    const entity = scene.entities[entityId];
    if (!entity) return;
    if (isEffectivelyEnabled(scene, entity)) {
      for (const component of entity.components) {
        if (component.type !== "mesh" || !component.enabled) continue;
        const reason = movableReason(scene, assets, entity, component);
        entries.push({
          entityId: entity.id,
          name: entity.name,
          componentId: component.id,
          target: isMeshLightBakeTarget(component),
          scale: component.lightBake?.scale ?? 1,
          ...(reason ? { movableReason: reason } : {}),
        });
      }
    }
    for (const child of entity.children) visit(child);
  };
  for (const root of scene.rootEntityIds) visit(root);
  return entries;
}

/** Sceneにあるライトを、ベイクでの扱いと合わせて並べる。 */
export function listLightBakeLights(scene: SceneDocument): LightBakeLightEntry[] {
  const entries: LightBakeLightEntry[] = [];
  const visit = (entityId: string) => {
    const entity = scene.entities[entityId];
    if (!entity) return;
    const effective = isEffectivelyEnabled(scene, entity);
    for (const component of entity.components) {
      if (component.type !== "light") continue;
      entries.push({
        entityId: entity.id,
        name: entity.name,
        componentId: component.id,
        lightType: component.lightType,
        bakeMode: component.bakeMode ?? "realtime",
        enabled: effective && component.enabled,
      });
    }
    for (const child of entity.children) visit(child);
  };
  for (const root of scene.rootEntityIds) visit(root);
  return entries;
}

/** 「ベイク」にしてある、有効なLightコンポーネント。 */
export function authoredBakedLightComponentIds(scene: SceneDocument): Set<string> {
  const ids = new Set<string>();
  for (const light of listLightBakeLights(scene)) {
    if (light.enabled && light.bakeMode === "baked") ids.add(light.componentId);
  }
  return ids;
}

/** Sceneが使っているライトマップ。別のScene用のAssetは使わない。 */
export function resolveSceneLightmap(
  scene: SceneDocument,
  assets: AssetManifest,
): LightmapAsset | undefined {
  const settings = resolveSceneSettings(scene.settings);
  const asset = getLightmapAsset(assets, settings.lightBake.lightmapAssetId);
  if (!asset || asset.status !== "ready") return undefined;
  if (asset.lightmap.sceneId !== scene.sceneId) return undefined;
  return asset;
}

/**
 * このScene用に焼いた、いちばん新しいライトマップ。Sceneから外してあっても返す。
 *
 * 焼き直しでは、新しいAssetを増やさずにこれを更新する。外して焼き直すたびに
 * 同じ名前のライトマップがAssetsに並ぶのを防ぐ。
 */
export function findSceneLightmapAsset(
  assets: AssetManifest,
  sceneId: string,
): LightmapAsset | undefined {
  let latest: LightmapAsset | undefined;
  for (const asset of Object.values(assets.assets)) {
    if (asset.kind !== "lightmap" || asset.lightmap.sceneId !== sceneId) continue;
    if (!latest || asset.lightmap.bakedAt > latest.lightmap.bakedAt) latest = asset;
  }
  return latest;
}

/**
 * 描画時に消すライト。
 *
 * ライトマップへ直接光まで焼いたライトのうち、今も「ベイク」のままのもの。
 * 作者が「リアルタイム」へ戻したライトは、焼き直す前でもすぐに点く。
 */
export function suppressedBakedLightComponentIds(
  scene: SceneDocument,
  assets: AssetManifest,
): ReadonlySet<string> {
  const lightmap = resolveSceneLightmap(scene, assets);
  if (!lightmap) return EMPTY_IDS;
  const authored = authoredBakedLightComponentIds(scene);
  const ids = new Set<string>();
  for (const id of lightmap.lightmap.bakedLightComponentIds) {
    if (authored.has(id)) ids.add(id);
  }
  return ids;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

/**
 * ライトマップを貼るEntity。
 *
 * ライトマップが持っているEntityのうち、今もベイクの対象になっているもの。
 * 対象から外したMeshは、焼き直す前でもライトマップを外す。
 */
export function lightmappedEntityIds(
  scene: SceneDocument,
  assets: AssetManifest,
): ReadonlySet<string> {
  const lightmap = resolveSceneLightmap(scene, assets);
  if (!lightmap) return EMPTY_IDS;
  const ids = new Set<string>();
  for (const id of lightmap.lightmap.entityIds) {
    const entity = scene.entities[id];
    if (!entity) continue;
    if (entity.components.some((component) => component.type === "mesh" && isMeshLightBakeTarget(component))) {
      ids.add(id);
    }
  }
  return ids;
}

/**
 * ベイクの結果を左右するSceneの状態を、一つの文字列へまとめる。
 *
 * ベイクした時点の値をLightmap Assetへ残し、今の値と比べる。違えば、
 * 物を動かしたりライトを変えたりした後で、焼いた陰影が合わなくなっている。
 */
export function computeLightBakeSignature(
  scene: SceneDocument,
  assets: AssetManifest,
): string {
  const settings = resolveSceneSettings(scene.settings);
  const relevant = new Map<string, unknown>();
  const materialIds = new Set<string>();
  const modelIds = new Set<string>();
  const addChain = (entity: SceneEntity) => {
    for (const current of ancestors(scene, entity)) {
      if (relevant.has(current.id)) continue;
      const transform = current.components.find((component) => component.type === "transform");
      relevant.set(current.id, {
        parent: current.parentId,
        enabled: current.enabled,
        transform: transform && transform.type === "transform"
          ? [transform.position, transform.rotation, transform.scale]
          : null,
      });
    }
  };
  const meshes: unknown[] = [];
  const lights: unknown[] = [];
  for (const entity of Object.values(scene.entities)) {
    for (const component of entity.components) {
      if (component.type === "mesh" && isMeshLightBakeTarget(component)) {
        addChain(entity);
        for (const binding of component.materialBindings) materialIds.add(binding.materialAssetId);
        modelIds.add(meshModelAssetId(component));
        meshes.push([
          entity.id,
          component.id,
          component.geometry ?? component.geometryAssetId,
          component.materialBindings,
          component.lightBake,
          component.modelPose ?? null,
        ]);
      }
      if (component.type === "light" && component.enabled) {
        addChain(entity);
        lights.push([entity.id, lightSignature(component)]);
      }
    }
  }
  const materials = [...materialIds].sort().map((id) => {
    const asset = assets.assets[id];
    return [id, asset?.kind === "material" ? asset.properties : null];
  });
  const models = [...modelIds].sort().map((id) => {
    const asset = assets.assets[id];
    return [id, asset?.kind === "model" ? [asset.sourceHash ?? null, asset.importSettings.scale] : null];
  });
  const environment = [
    settings.ambient,
    settings.skybox.iblEnabled
      ? [
          settings.skybox.imageAssetId ?? null,
          settings.skybox.rotationDegrees,
          settings.skybox.exposure,
          settings.skybox.flipY,
        ]
      : null,
  ];
  const bake = [settings.lightBake.resolution, settings.lightBake.quality, settings.lightBake.softness];
  return sha256Utf8(
    JSON.stringify([
      [...relevant.entries()].sort(([left], [right]) => left.localeCompare(right)),
      meshes,
      lights,
      materials,
      models,
      environment,
      bake,
    ]),
  );
}

function lightSignature(light: LightComponent): unknown {
  return [
    light.id,
    light.lightType,
    light.color,
    light.intensity,
    light.bakeMode ?? "realtime",
    light.targetPosition ?? null,
    light.groundColor ?? null,
    light.distance ?? null,
    light.decay ?? null,
    light.angle ?? null,
    light.penumbra ?? null,
    light.width ?? null,
    light.height ?? null,
  ];
}

export type LightBakeStatus =
  | { state: "none" }
  | { state: "current"; lightmap: LightmapAsset }
  | { state: "stale"; lightmap: LightmapAsset };

/** 今のライトマップがSceneと合っているか。 */
export function resolveLightBakeStatus(
  scene: SceneDocument,
  assets: AssetManifest,
): LightBakeStatus {
  const lightmap = resolveSceneLightmap(scene, assets);
  if (!lightmap) return { state: "none" };
  return lightmap.lightmap.signature === computeLightBakeSignature(scene, assets)
    ? { state: "current", lightmap }
    : { state: "stale", lightmap };
}

/** Sceneが使うライトマップを差し替える。`undefined` で外す。 */
export function setSceneLightmap(
  scene: SceneDocument,
  lightmapAssetId: string | undefined,
): SceneDocument {
  const settings = resolveSceneSettings(scene.settings);
  if (settings.lightBake.lightmapAssetId === lightmapAssetId) return scene;
  return {
    ...scene,
    settings: {
      ...settings,
      lightBake: { ...settings.lightBake, lightmapAssetId },
    },
  };
}

/** ベイクの設定（大きさ・品質・影のやわらかさ）を変える。 */
export function updateSceneLightBakeSettings(
  scene: SceneDocument,
  patch: Partial<Omit<SceneSettings["lightBake"], "lightmapAssetId">>,
): SceneDocument {
  const settings = resolveSceneSettings(scene.settings);
  const next = resolveSceneSettings({
    ...settings,
    lightBake: { ...settings.lightBake, ...patch },
  }).lightBake;
  if (
    next.resolution === settings.lightBake.resolution &&
    next.quality === settings.lightBake.quality &&
    next.softness === settings.lightBake.softness
  ) {
    return scene;
  }
  return { ...scene, settings: { ...settings, lightBake: next } };
}
