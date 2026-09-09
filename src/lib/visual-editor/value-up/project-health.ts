import type { PrototypeVisualProject } from "../prototype-project";
import { getTransform } from "../scene-document";
import { validateAssetManifest, validateSceneDocument, validateVisualProjectDocument } from "../serialization";

export type ProjectHealthIssue = {
  id: string;
  area: "project" | "scene" | "asset";
  severity: "info" | "warning" | "blocking";
  message: string;
  entityId?: string;
  path?: string;
  nextAction?: string;
};

/** Document diagnostics only: no filesystem, compile, runtime or publication checks. */
export function inspectProjectHealth(bundle: PrototypeVisualProject) {
  const issues: ProjectHealthIssue[] = [];
  const checks = [
    ["project", validateVisualProjectDocument(bundle.project)],
    ["scene", validateSceneDocument(bundle.scene)],
    ["asset", validateAssetManifest(bundle.assets)],
  ] as const;
  for (const [area, diagnostics] of checks) {
    for (const diagnostic of diagnostics) {
      issues.push({ id: `${area}:${diagnostic.path}:${diagnostic.code}`, area,
        severity: "blocking", message: diagnostic.message, path: diagnostic.path });
    }
  }
  const entities = Object.values(bundle.scene.entities);
  const assets = Object.values(bundle.assets.assets);
  if (entities.length === 0) {
    issues.push({ id: "empty-scene", area: "scene", severity: "warning",
      message: "SceneにEntityがありません", nextAction: "create_primitive" });
  }
  for (const entity of entities) {
    if (!entity.name.trim()) {
      issues.push({ id: `entity-name:${entity.id}`, area: "scene", severity: "info",
        message: "名前のないEntityがあります", entityId: entity.id });
    }
    const transform = getTransform(entity);
    if (transform?.scale.some((value) => Math.abs(value) < 0.0001)) {
      issues.push({ id: `entity-scale:${entity.id}`, area: "scene", severity: "warning",
        message: "ほぼ0のScaleを持つEntityがあります", entityId: entity.id, nextAction: "update_transform" });
    }
  }
  const blocking = issues.filter((issue) => issue.severity === "blocking").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return {
    scope: "document" as const,
    status: blocking ? "error" as const : warnings ? "warning" as const : "ready" as const,
    summary: {
      entities: entities.length, assets: assets.length,
      materials: assets.filter((asset) => asset.kind === "material").length,
      prefabs: Object.keys(bundle.prefabs).length,
      interactivityAssets: assets.filter((asset) => asset.kind === "interactivity").length,
      scripts: assets.filter((asset) => asset.kind === "script").length,
    },
    issues,
  };
}
