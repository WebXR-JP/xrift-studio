import {
  getGeometryAsset,
  type AssetManifest,
  type SceneAsset,
} from "../asset-manifest";
import type { SceneDocument, SceneEntity } from "../scene-document";
import type {
  XriftRuntimeAsset,
  XriftRuntimeComponent,
  XriftRuntimeEntity,
  XriftRuntimeGeometry,
  XriftRuntimeManifest,
} from "../../../../packages/xrift-studio-runtime/src/schema";
import {
  XRIFT_STUDIO_RUNTIME_FORMAT,
  XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION,
} from "../../../../packages/xrift-studio-runtime/src/schema";
import type {
  AssetCopyPlanEntry,
  CompilerDiagnostic,
  VisualCompilerDocuments,
} from "./types";
import { OPEN_BRUSH_BRUSH_BASE_URL } from "../open-brush";

export function compileRuntimeManifest(
  documents: VisualCompilerDocuments,
  entryScene: SceneDocument | null,
  assetCopyPlan: readonly AssetCopyPlanEntry[],
  compilerVersion: string,
  diagnostics: CompilerDiagnostic[],
): XriftRuntimeManifest {
  const runtimeAssets = compileRuntimeAssets(documents.assets, assetCopyPlan);
  const scenes = entryScene
    ? {
        [entryScene.sceneId]: compileRuntimeScene(
          entryScene,
          documents.assets,
          diagnostics,
        ),
      }
    : {};
  return {
    format: XRIFT_STUDIO_RUNTIME_FORMAT,
    schemaVersion: XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION,
    generator: "xrift-studio",
    compilerVersion,
    projectId: documents.project.projectId,
    projectKind: documents.project.projectKind,
    entryScene: documents.project.entrySceneId,
    scenes,
    assets: runtimeAssets,
  };
}

function compileRuntimeScene(
  scene: SceneDocument,
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
) {
  return {
    id: scene.sceneId,
    name: scene.name,
    rootEntityIds: [...scene.rootEntityIds],
    entities: Object.fromEntries(
      Object.entries(scene.entities)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([entityId, entity]) => [
          entityId,
          compileRuntimeEntity(entity, assets, diagnostics, scene.sceneId),
        ]),
    ),
    settings: scene.settings
      ? (JSON.parse(JSON.stringify(scene.settings)) as Record<string, unknown>)
      : undefined,
  };
}

function compileRuntimeEntity(
  entity: SceneEntity,
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
  sceneId: string,
): XriftRuntimeEntity {
  const transform = entity.components.find((component) => component.type === "transform");
  const components: XriftRuntimeComponent[] = [];
  for (const component of entity.components) {
    if (component.type === "transform" || component.type === "prefab-instance") continue;
    if (component.type === "mesh") {
      const geometry = resolveRuntimeGeometry(component, assets);
      if (!geometry) {
        diagnostics.push({
          severity: "blocking",
          code: "runtime-mesh-geometry-missing",
          message: "Runtime JSONへ変換できるMesh geometryがありません",
          sceneId,
          entityId: entity.id,
          componentId: component.id,
          fieldPath: "geometry",
        });
        continue;
      }
      components.push({
        id: component.id,
        type: "mesh",
        enabled: component.enabled,
        geometry,
        materialBindings: component.materialBindings.map((binding) => ({
          slot: binding.slot,
          materialAssetId: binding.materialAssetId,
        })),
        castShadow: component.castShadow,
        receiveShadow: component.receiveShadow,
        modelPose: component.modelPose
          ? JSON.parse(JSON.stringify(component.modelPose))
          : undefined,
      });
      continue;
    }
    if (component.type === "animation") {
      components.push({
        id: component.id,
        type: "animation",
        enabled: component.enabled,
        autoplay: component.autoplay,
        loop: component.loop,
      });
      continue;
    }
    if (component.type === "xrift-component") {
      appendRuntimeAdapterDiagnostic(
        diagnostics,
        component.type,
        sceneId,
        entity.id,
        component.id,
        "missing",
      );
      components.push({
        id: component.id,
        type: component.type,
        enabled: component.enabled,
        schemaId: component.schemaId,
        schemaVersion: component.schemaVersion,
        properties: JSON.parse(JSON.stringify(component.properties)),
        assetReferences: [...component.assetReferences],
        entityReferences: [...component.entityReferences],
      });
      continue;
    }
    if (component.type === "audio-source" || component.type === "particle-emitter") {
      appendRuntimeAdapterDiagnostic(
        diagnostics,
        component.type,
        sceneId,
        entity.id,
        component.id,
        "missing",
      );
    } else if (component.type === "collider" || component.type === "spawn-point") {
      appendRuntimeAdapterDiagnostic(
        diagnostics,
        component.type,
        sceneId,
        entity.id,
        component.id,
        "metadata-only",
      );
    }
    components.push(
      JSON.parse(JSON.stringify(component)) as XriftRuntimeComponent,
    );
  }
  return {
    id: entity.id,
    name: entity.name,
    parentId: entity.parentId,
    children: [...entity.children],
    enabled: entity.enabled,
    transform:
      transform?.type === "transform"
        ? {
            position: [...transform.position],
            rotation: [...transform.rotation],
            scale: [...transform.scale],
          }
        : { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    components,
  };
}

function appendRuntimeAdapterDiagnostic(
  diagnostics: CompilerDiagnostic[],
  componentType: string,
  sceneId: string,
  entityId: string,
  componentId: string,
  support: "missing" | "metadata-only",
): void {
  diagnostics.push({
    severity: "warning",
    code:
      support === "missing"
        ? "runtime-component-adapter-missing"
        : "runtime-component-metadata-only",
    message:
      support === "missing"
        ? `xrift-studio-runtimeは${componentType}の実行adapterにまだ対応していません`
        : `xrift-studio-runtimeは${componentType}をmetadataとして保持しますが、実行動作にはまだ接続しません`,
    sceneId,
    entityId,
    componentId,
  });
}

function resolveRuntimeGeometry(
  component: Extract<SceneEntity["components"][number], { type: "mesh" }>,
  assets: AssetManifest,
): XriftRuntimeGeometry | null {
  if (component.geometry?.kind === "builtin-primitive") {
    return { kind: "primitive", primitive: component.geometry.primitive };
  }
  const assetId =
    component.geometry?.kind === "asset"
      ? component.geometry.assetId
      : component.geometryAssetId;
  const geometry = getGeometryAsset(assets, assetId);
  if (geometry?.kind === "model") {
    return {
      kind: "model",
      assetId: geometry.id,
      ...(component.geometry?.kind === "asset" &&
      component.geometry.sourceNodeIndex !== undefined
        ? { sourceNodeIndex: component.geometry.sourceNodeIndex }
        : {}),
    };
  }
  if (geometry?.kind === "primitive") {
    return { kind: "primitive", primitive: geometry.primitive };
  }
  return null;
}

function compileRuntimeAssets(
  assets: AssetManifest,
  assetCopyPlan: readonly AssetCopyPlanEntry[],
): Record<string, XriftRuntimeAsset> {
  const runtimeUrlByAssetId = new Map(
    assetCopyPlan.map((entry) => [
      entry.assetId,
      `./${entry.targetRelativePath.replace(/^public\/xrift\//, "")}`,
    ]),
  );
  const entries: Array<[string, XriftRuntimeAsset]> = [];
  for (const asset of Object.values(assets.assets).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    const compiled = compileRuntimeAsset(asset, runtimeUrlByAssetId.get(asset.id));
    if (compiled) entries.push([asset.id, compiled]);
  }
  return Object.fromEntries(entries);
}

function compileRuntimeAsset(
  asset: SceneAsset,
  url: string | undefined,
): XriftRuntimeAsset | null {
  if (asset.kind === "model" && url) {
    const openBrush = asset.importMetadata?.openBrush;
    return {
      id: asset.id,
      kind: "model",
      name: asset.name,
      url,
      sourceFormat: asset.importMetadata?.sourceFormat,
      scale: asset.importSettings.scale,
      ...(openBrush
        ? {
            openBrush: {
              renderer: openBrush.renderer,
              rendererVersion: openBrush.rendererVersion,
              extensionNames: [...openBrush.extensionNames],
              brushBaseUrl: OPEN_BRUSH_BRUSH_BASE_URL,
            },
          }
        : {}),
      materialSlots: asset.materialSlots.map((slot) => ({
        slot: slot.slot,
        name: slot.name,
        sourceMaterialIndex: slot.sourceMaterialIndex,
      })),
    };
  }
  if (asset.kind === "texture" && url) {
    return {
      id: asset.id,
      kind: "texture",
      name: asset.name,
      url,
      colorSpace: asset.importSettings.colorSpace,
      flipY: asset.importSettings.flipY,
    };
  }
  if (asset.kind === "skybox" && url) {
    return {
      id: asset.id,
      kind: "skybox",
      name: asset.name,
      url,
      sourceFormat: asset.sourceFormat,
      projection: asset.projection,
    };
  }
  if (asset.kind === "audio" && url) {
    return { id: asset.id, kind: "audio", name: asset.name, url };
  }
  if (asset.kind === "material") {
    return {
      id: asset.id,
      kind: "material",
      name: asset.name,
      properties: JSON.parse(JSON.stringify(asset.properties)),
      ...(asset.shader
        ? { shader: JSON.parse(JSON.stringify(asset.shader)) }
        : {}),
    };
  }
  if (asset.kind === "particle") {
    return {
      id: asset.id,
      kind: "particle",
      name: asset.name,
      properties: JSON.parse(JSON.stringify(asset.properties)),
    };
  }
  return null;
}
