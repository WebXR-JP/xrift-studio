import type { PrototypeVisualProject } from "../prototype-project";
import { resolvePrefabInstances } from "../compiler/prefab-resolver";

export type PerformanceBudget = {
  maxEntities: number;
  maxLights: number;
  maxPhysicsBodies: number;
  maxTextureAssets: number;
  maxModelAssets: number;
};

// Authoring heuristics, not platform limits or measured device performance.
export const DEFAULT_PERFORMANCE_BUDGET: Readonly<PerformanceBudget> = Object.freeze({
  maxEntities: 800, maxLights: 12, maxPhysicsBodies: 120, maxTextureAssets: 180, maxModelAssets: 140,
});

export function analyzeProjectPerformance(
  bundle: PrototypeVisualProject,
  budget: PerformanceBudget = DEFAULT_PERFORMANCE_BUDGET,
) {
  for (const [key, value] of Object.entries(DEFAULT_PERFORMANCE_BUDGET)) {
    const limit = budget[key as keyof PerformanceBudget];
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error(`${key}には正の整数を指定してください (${value})`);
  }
  // Every placed Prefab copy instantiates its whole content at runtime. Twenty
  // copies of a lamp with a Light are twenty Lights, not the one authored.
  const resolved = resolvePrefabInstances(bundle.scene, bundle.assets, bundle.prefabs).scene;
  const entities = Object.values(resolved.entities);
  const placedCopies = Object.values(bundle.scene.entities).reduce(
    (count, entity) => count + entity.components.filter((c) => c.type === "prefab-instance").length, 0);
  const assets = Object.values(bundle.assets.assets);
  const metrics = {
    entities: entities.length,
    lights: entities.reduce((count, entity) => count + entity.components.filter((c) => c.type === "light").length, 0),
    physicsBodies: entities.reduce((count, entity) => count + entity.components.filter((c) => c.type === "rigid-body").length, 0),
    textureAssets: assets.filter((asset) => asset.kind === "texture").length,
    modelAssets: assets.filter((asset) => asset.kind === "model").length,
  };
  const checks = [
    ["entities", "maxEntities", "Entity"], ["lights", "maxLights", "Light"],
    ["physicsBodies", "maxPhysicsBodies", "Rigid Body"], ["textureAssets", "maxTextureAssets", "Texture"],
    ["modelAssets", "maxModelAssets", "Model"],
  ] as const;
  const warnings: string[] = [];
  let highestRatio = 0;
  for (const [metric, key, label] of checks) {
    const ratio = metrics[metric] / budget[key];
    highestRatio = Math.max(highestRatio, ratio);
    if (ratio > 0.8) warnings.push(`${label}が${ratio > 1 ? "目安を" : "目安の80%を"}超えています (${metrics[metric]}/${budget[key]})`);
  }
  return {
    scope: "authoring-counts" as const,
    tier: highestRatio > 1 ? "over-budget" as const : highestRatio > 0.8 ? "warning" as const : "within-budget" as const,
    metrics, budget: { ...budget }, warnings,
    prefabExpansion: {
      placedCopies,
      expandedEntities: entities.length - Object.keys(bundle.scene.entities).length,
    },
    limitations: [
      "無効なEntity・Componentと未使用Assetも含む、編集データの件数です。配置したPrefabは中身を展開して数えます。Scriptによる実行時生成は含みません。",
      "描画負荷、三角形数、Texture解像度、メモリー、FPSは測定していません。Playと対象端末で確認してください。",
    ],
  };
}
