import {
  getGeometryAsset,
  getTextureSourceFormat,
  isEnvironmentTextureAsset,
  type AssetManifest,
  type SceneAsset,
} from "../asset-manifest";
import type { SceneDocument, SceneEntity } from "../scene-document";
import { resolveSceneSettings } from "../scene-settings";
import type {
  XriftRuntimeAsset,
  XriftRuntimeComponent,
  XriftRuntimeEntity,
  XriftRuntimeDecoderPaths,
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
import { isPublishedAsKtx2 } from "../texture-conversion";
import { resolveRenderedTextFontId } from "../../../../packages/xrift-studio-runtime/src/text-font-catalog";

export function compileRuntimeManifest(
  documents: VisualCompilerDocuments,
  entryScene: SceneDocument | null,
  assetCopyPlan: readonly AssetCopyPlanEntry[],
  compilerVersion: string,
  diagnostics: CompilerDiagnostic[],
  decoders?: XriftRuntimeDecoderPaths,
  textFontDirectoryUrl?: string,
): XriftRuntimeManifest {
  const runtimeAssets = compileRuntimeAssets(documents.assets, assetCopyPlan);
  const scenes = entryScene
    ? {
        [entryScene.sceneId]: compileRuntimeScene(
          entryScene,
          documents.assets,
          diagnostics,
          new Set(Object.keys(runtimeAssets)),
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
    ...(decoders && Object.keys(decoders).length > 0 ? { decoders } : {}),
    ...(textFontDirectoryUrl ? { textFontDirectoryUrl } : {}),
  };
}

function compileRuntimeScene(
  scene: SceneDocument,
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
  compiledAssetIds: ReadonlySet<string>,
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
          compileRuntimeEntity(
            entity,
            assets,
            diagnostics,
            scene.sceneId,
            scene.entities,
            compiledAssetIds,
          ),
        ]),
    ),
    settings: scene.settings
      ? (JSON.parse(
          JSON.stringify(resolveSceneSettings(scene.settings)),
        ) as Record<string, unknown>)
      : undefined,
  };
}

function compileRuntimeEntity(
  entity: SceneEntity,
  assets: AssetManifest,
  diagnostics: CompilerDiagnostic[],
  sceneId: string,
  allEntities: Record<string, SceneEntity>,
  compiledAssetIds: ReadonlySet<string>,
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
          ...(binding.sourceNodeIndex === undefined
            ? {}
            : { sourceNodeIndex: binding.sourceNodeIndex }),
        })),
        castShadow: component.castShadow,
        receiveShadow: component.receiveShadow,
        ...(component.maxDistance === undefined
          ? {}
          : { maxDistance: component.maxDistance }),
        modelPose: component.modelPose
          ? JSON.parse(JSON.stringify(component.modelPose))
          : undefined,
      });
      continue;
    }
    if (component.type === "interaction-trigger") {
      const asset = assets.assets[component.interactivityAssetId];
      if (asset?.kind !== "interactivity") {
        diagnostics.push({
          severity: "blocking",
          code: "runtime-interaction-trigger-graph-missing",
          message:
            "Interaction Triggerが参照するInteractivity Assetが見つかりません",
          sceneId,
          entityId: entity.id,
          componentId: component.id,
          fieldPath: "interactivityAssetId",
        });
        continue;
      }
      components.push({
        id: component.id,
        type: "interaction-trigger",
        enabled: component.enabled,
        // Inlined rather than referenced: see the schema. The clone keeps the
        // manifest free of any object the authoring document still holds.
        graph: JSON.parse(JSON.stringify(asset.extension)),
        entityReferences: [...component.entityReferences],
        assetReferences: [...component.assetReferences],
      });
      continue;
    }
    if (component.type === "animation") {
      // v1 removed the Animation Component: what plays a clip is an
      // `animation/start` node. Opening a project converts any that are left,
      // so one reaching here is a document that skipped that and is dropped
      // rather than published as a Component nothing reads.
      continue;
    }
    if (component.type === "xrift-component") {
      appendRuntimeAdapterDiagnostic(
        diagnostics,
        component.type,
        sceneId,
        entity.id,
        component.id,
        runtimeXriftComponentSupport(component.schemaId),
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
    if (component.type === "particle-emitter") {
      // The R3F runtime uses the same bounded particle simulation as the
      // generated Script runtime. Keep the authored component in the manifest
      // so the adapter can resolve its Particle Asset at load time.
    } else if (component.type === "audio-source") {
      // Audio sources are mounted by the R3F adapter using the shared
      // AudioSource runtime (including positional audio and autoplay state).
    } else if (
      component.type === "collider" ||
      component.type === "rigid-body" ||
      component.type === "spawn-point"
    ) {
      const runtimePhysicsSupport =
        component.type === "rigid-body"
          ? runtimeRigidBodySupport(entity, component, allEntities)
          : component.type === "collider" &&
              component.bodyType !== undefined &&
              component.bodyType !== "fixed"
            ? runtimeLegacyDynamicColliderSupport(entity, component, allEntities)
            : "supported";
      appendRuntimeAdapterDiagnostic(
        diagnostics,
        component.type,
        sceneId,
        entity.id,
        component.id,
        runtimePhysicsSupport,
      );
    }
    const runtimeComponent = JSON.parse(
      JSON.stringify(component),
    ) as XriftRuntimeComponent;
    if (runtimeComponent.type === "text") {
      // A font the world cannot carry is dropped rather than left as an id the
      // runtime would look up and miss; the Text then renders with the catalog
      // face, which is what the compiler warns about.
      if (
        runtimeComponent.fontAssetId &&
        !compiledAssetIds.has(runtimeComponent.fontAssetId)
      ) {
        delete runtimeComponent.fontAssetId;
      }
      // The face is resolved here so the manifest names the file the world
      // actually carries, rather than leaving "auto" for the runtime to
      // interpret.
      runtimeComponent.fontId = resolveRenderedTextFontId(
        runtimeComponent.fontId,
      );
    }
    components.push(runtimeComponent);
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
    // A shared-Model node owns no geometry: the runtime resolves its Mesh
    // Collider (and nothing else, today) through the Model root's loaded
    // object by source node index.
    ...(entity.modelNode
      ? {
          modelNode: {
            modelAssetId: entity.modelNode.modelAssetId,
            modelEntityId: entity.modelNode.modelEntityId,
            sourceNodeIndex: entity.modelNode.sourceNodeIndex,
          },
        }
      : {}),
  };
}

function runtimeXriftComponentSupport(
  schemaId: string,
): "supported" | "missing" {
  switch (schemaId) {
    case "xrift.spawn-point":
    case "xrift.skybox":
    case "xrift.mirror":
    case "xrift.billboard-y":
    case "xrift.interactable":
    case "xrift.grabbable":
    case "xrift.text-input":
    case "xrift.video-screen":
    case "xrift.video-player":
    case "xrift.live-video-player":
    case "xrift.video-180-sphere":
    case "xrift.screen-share-display":
    case "xrift.tag-board":
    case "xrift.entry-log-board":
    case "xrift.portal":
      return "supported";
    default:
      return "missing";
  }
}

function appendRuntimeAdapterDiagnostic(
  diagnostics: CompilerDiagnostic[],
  componentType: string,
  sceneId: string,
  entityId: string,
  componentId: string,
  support: "missing" | "metadata-only" | "supported",
): void {
  if (support === "supported") return;
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

function runtimeRigidBodySupport(
  entity: SceneEntity,
  component: Extract<SceneEntity["components"][number], { type: "rigid-body" }>,
  allEntities: Record<string, SceneEntity>,
): "supported" | "metadata-only" {
  if (entity.parentId !== null) return "metadata-only";
  const descendantPhysics = Object.values(allEntities).some(
    (candidate) =>
      candidate.id !== entity.id &&
      isDescendantEntity(candidate.id, entity.id, allEntities) &&
      candidate.components.some(
        (child) =>
          child.enabled &&
          child.type === "rigid-body",
      ),
  );
  if (descendantPhysics) return "metadata-only";
  const hasMeshInBody = hasEnabledMeshInSubtree(entity.id, allEntities);
  const colliders = entity.components.filter(
    (candidate): candidate is Extract<
      SceneEntity["components"][number],
      { type: "collider" }
    > => candidate.enabled && candidate.type === "collider",
  );
  if (colliders.some((candidate) => candidate.shape === "mesh") && !hasMeshInBody) {
    return "metadata-only";
  }
  const hasDescendantCollider = Object.values(allEntities).some(
    (candidate) =>
      candidate.id !== entity.id &&
      isDescendantEntity(candidate.id, entity.id, allEntities) &&
      candidate.components.some(
        (child) => child.enabled && child.type === "collider",
      ),
  );
  if (colliders.length > 0 || hasDescendantCollider) return "supported";
  return component.autoColliders !== "none" && hasMeshInBody
    ? "supported"
    : "metadata-only";
}

function isDescendantEntity(
  entityId: string,
  ancestorId: string,
  allEntities: Record<string, SceneEntity>,
): boolean {
  let current: SceneEntity | undefined = allEntities[entityId];
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parentId === null ? undefined : allEntities[current.parentId];
  }
  return false;
}

function runtimeLegacyDynamicColliderSupport(
  entity: SceneEntity,
  component: Extract<SceneEntity["components"][number], { type: "collider" }>,
  allEntities: Record<string, SceneEntity>,
): "supported" | "metadata-only" {
  if (entity.parentId !== null) return "metadata-only";
  if (component.shape === "box") return "supported";
  return hasEnabledMeshInSubtree(entity.id, allEntities)
    ? "supported"
    : "metadata-only";
}

function hasEnabledMeshInSubtree(
  rootEntityId: string,
  allEntities: Record<string, SceneEntity>,
): boolean {
  return Object.values(allEntities).some((candidate) => {
    if (
      !candidate.enabled ||
      !candidate.components.some(
        (component) => component.enabled && component.type === "mesh",
      )
    ) {
      return false;
    }
    let current: SceneEntity | undefined = candidate;
    while (current) {
      if (current.id === rootEntityId) return true;
      current = current.parentId === null ? undefined : allEntities[current.parentId];
    }
    return false;
  });
}

function resolveRuntimeGeometry(
  component: Extract<SceneEntity["components"][number], { type: "mesh" }>,
  assets: AssetManifest,
): XriftRuntimeGeometry | null {
  if (component.geometry?.kind === "terrain") {
    return {
      kind: "terrain",
      width: component.geometry.terrain.width,
      depth: component.geometry.terrain.depth,
      resolution: component.geometry.terrain.resolution,
      heights: [...component.geometry.terrain.heights],
      ...(component.geometry.terrain.holes
        ? { holes: [...component.geometry.terrain.holes] }
        : {}),
    };
  }
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
      // Relative to the manifest, which sits at the world root alongside the
      // Assets: a published world serves nothing below that root.
      `./${entry.targetRelativePath.replace(/^public\//, "")}`,
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
  if (isEnvironmentTextureAsset(asset) && url) {
    const sourceFormat = getTextureSourceFormat(asset);
    return {
      id: asset.id,
      kind: "skybox",
      name: asset.name,
      url,
      sourceFormat:
        sourceFormat === "hdr" || sourceFormat === "exr"
          ? sourceFormat
          : "image",
      projection: asset.projection ?? "equirectangular",
      flipY: asset.importSettings.flipY,
    };
  }
  if (asset.kind === "texture" && url) {
    return {
      id: asset.id,
      kind: "texture",
      name: asset.name,
      url,
      sourceFormat:
        isPublishedAsKtx2(asset) ? "ktx2" : "image",
      colorSpace: asset.importSettings.colorSpace,
      flipY: asset.importSettings.flipY,
      sampler: {
        wrapS: asset.importSettings.sampler.wrapS,
        wrapT: asset.importSettings.sampler.wrapT,
      },
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
      flipY: false,
    };
  }
  if (asset.kind === "audio" && url) {
    return { id: asset.id, kind: "audio", name: asset.name, url };
  }
  if (asset.kind === "font" && url) {
    return { id: asset.id, kind: "font", name: asset.name, url };
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
  if (asset.kind === "interactivity") {
    return {
      id: asset.id,
      kind: "interactivity",
      name: asset.name,
      extensionName: asset.extensionName,
      specStatus: asset.specStatus,
      extension: JSON.parse(JSON.stringify(asset.extension)) as Record<string, unknown>,
    };
  }
  return null;
}
