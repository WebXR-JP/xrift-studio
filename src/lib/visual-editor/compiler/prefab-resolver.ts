import {
  type AssetManifest,
  type PrefabAsset,
  type SceneAsset,
} from "../asset-manifest";
import type { PrefabDocument } from "../prefab-document";
import {
  type PrefabInstanceComponent,
  type RegisteredSceneComponent,
  type SceneDocument,
  type SceneEntity,
} from "../scene-document";
import { sha256Utf8 } from "./hash";
import type { CompilerDiagnostic } from "./types";

export const MAX_PREFAB_EXPANSION_DEPTH = 32;

export type PrefabResolutionResult = {
  scene: SceneDocument;
  diagnostics: CompilerDiagnostic[];
  referencedPrefabAssetIds: string[];
};

type PrefabStackFrame = {
  prefabId: string;
  assetId: string;
};

type ResolverState = {
  sceneId: string;
  assets: AssetManifest;
  prefabs: Readonly<Record<string, PrefabDocument>>;
  entities: Record<string, SceneEntity>;
  diagnostics: CompilerDiagnostic[];
  diagnosticKeys: Set<string>;
  referencedPrefabAssetIds: Set<string>;
  usedEntityIds: Set<string>;
  usedComponentIds: Set<string>;
  expandedEntityIds: Set<string>;
};

type PrefabAssetDocumentReference = {
  asset: PrefabAsset;
  prefabId: string;
  prefabPath: string;
};

/**
 * Expands reachable Prefab instances into a compiler-only SceneDocument.
 * Authoring documents and IDs are never mutated. Generated IDs are scoped to
 * the concrete instance path so two placements of the same Prefab cannot
 * alias each other or a normal Scene Entity.
 */
export function resolvePrefabInstances(
  scene: SceneDocument,
  assets: AssetManifest,
  prefabs: Readonly<Record<string, PrefabDocument>> = {},
): PrefabResolutionResult {
  const entities = Object.fromEntries(
    Object.entries(scene.entities).map(([entityId, entity]) => [
      entityId,
      cloneExpansionEntity(entity),
    ]),
  );
  const state: ResolverState = {
    sceneId: scene.sceneId,
    assets,
    prefabs,
    entities,
    diagnostics: [],
    diagnosticKeys: new Set(),
    referencedPrefabAssetIds: new Set(),
    usedEntityIds: new Set(Object.keys(scene.entities)),
    usedComponentIds: new Set(
      Object.values(scene.entities).flatMap((entity) =>
        entity.components.map((component) => component.id),
      ),
    ),
    expandedEntityIds: new Set(),
  };

  for (const rootEntityId of scene.rootEntityIds) {
    expandEntity(rootEntityId, [], state);
  }

  return {
    scene: { ...scene, entities: state.entities },
    diagnostics: state.diagnostics,
    referencedPrefabAssetIds: [...state.referencedPrefabAssetIds].sort(),
  };
}

export function isPrefabAsset(asset: SceneAsset): asset is PrefabAsset {
  return (
    asset.kind === "template" &&
    asset.templateType === "prefab" &&
    "prefabPath" in asset
  );
}

/** Returns the persisted Prefab ID only when all authoring paths agree. */
export function getPrefabAssetDocumentReference(
  asset: SceneAsset,
): PrefabAssetDocumentReference | null {
  if (
    !isPrefabAsset(asset) ||
    asset.source.kind !== "project" ||
    !isPrefabDocumentPath(asset.prefabPath) ||
    asset.templatePath !== asset.prefabPath ||
    asset.source.relativePath !== asset.prefabPath
  ) {
    return null;
  }
  const fileName = asset.prefabPath.slice(asset.prefabPath.lastIndexOf("/") + 1);
  const prefabId = fileName.replace(/\.prefab\.json$/, "");
  return prefabId
    ? { asset, prefabId, prefabPath: asset.prefabPath }
    : null;
}

function expandEntity(
  entityId: string,
  stack: readonly PrefabStackFrame[],
  state: ResolverState,
): void {
  if (state.expandedEntityIds.has(entityId)) return;
  const entity = state.entities[entityId];
  if (!entity) return;
  state.expandedEntityIds.add(entityId);
  if (!entity.enabled) return;

  const instances = entity.components.filter(
    (component): component is PrefabInstanceComponent =>
      component.type === "prefab-instance",
  );
  if (instances.length > 0) {
    state.entities[entityId] = {
      ...entity,
      // Prefab Instance is an authoring instruction. Runtime source receives
      // only the deterministically expanded components and child Entities.
      components: entity.components.filter(
        (component) => component.type !== "prefab-instance",
      ),
    };
    for (const instance of instances) {
      if (instance.enabled) instantiatePrefab(entityId, instance, stack, state);
    }
  }

  for (const childEntityId of state.entities[entityId]?.children ?? []) {
    expandEntity(childEntityId, stack, state);
  }
}

function instantiatePrefab(
  hostEntityId: string,
  instance: PrefabInstanceComponent,
  stack: readonly PrefabStackFrame[],
  state: ResolverState,
): void {
  state.referencedPrefabAssetIds.add(instance.prefabAssetId);
  const asset = state.assets.assets[instance.prefabAssetId];
  if (!asset) {
    addResolverDiagnostic(
      state,
      instanceDiagnostic(
        state.sceneId,
        hostEntityId,
        instance,
        "prefab-asset-missing",
        `Prefab Assetが見つかりません: ${instance.prefabAssetId}`,
      ),
    );
    return;
  }
  const reference = getPrefabAssetDocumentReference(asset);
  if (!reference) {
    addResolverDiagnostic(
      state,
      instanceDiagnostic(
        state.sceneId,
        hostEntityId,
        instance,
        "prefab-asset-invalid",
        "参照先Assetはproject-relativeなPrefab documentを指していません",
      ),
    );
    return;
  }
  const prefab = state.prefabs[reference.prefabId];
  if (!prefab) {
    addResolverDiagnostic(state, {
      ...instanceDiagnostic(
        state.sceneId,
        hostEntityId,
        instance,
        "prefab-document-missing",
        `Prefab documentが見つかりません: ${reference.prefabPath}`,
      ),
      prefabId: reference.prefabId,
      fieldPath: "prefabPath",
    });
    return;
  }
  if (prefab.prefabId !== reference.prefabId) {
    addResolverDiagnostic(state, {
      ...instanceDiagnostic(
        state.sceneId,
        hostEntityId,
        instance,
        "prefab-document-id-mismatch",
        `Prefab document IDがAsset pathと一致しません: ${reference.prefabId}`,
      ),
      prefabId: prefab.prefabId,
      fieldPath: "prefabId",
    });
    return;
  }
  if (!prefab.entities[instance.sourceEntityId]) {
    addResolverDiagnostic(state, {
      ...instanceDiagnostic(
        state.sceneId,
        hostEntityId,
        instance,
        "prefab-source-entity-missing",
        `Prefab内の配置元Entityが見つかりません: ${instance.sourceEntityId}`,
      ),
      prefabId: prefab.prefabId,
      fieldPath: "sourceEntityId",
    });
    return;
  }

  const cycleStart = stack.findIndex((frame) => frame.prefabId === prefab.prefabId);
  if (cycleStart >= 0) {
    const cycle = [
      ...stack.slice(cycleStart).map((frame) => frame.prefabId),
      prefab.prefabId,
    ].join(" -> ");
    addResolverDiagnostic(state, {
      ...instanceDiagnostic(
        state.sceneId,
        hostEntityId,
        instance,
        "prefab-dependency-cycle",
        `Prefab参照が循環しています: ${cycle}`,
      ),
      prefabId: prefab.prefabId,
    });
    return;
  }
  if (stack.length >= MAX_PREFAB_EXPANSION_DEPTH) {
    addResolverDiagnostic(state, {
      ...instanceDiagnostic(
        state.sceneId,
        hostEntityId,
        instance,
        "prefab-recursion-depth-exceeded",
        `Prefab展開が上限${MAX_PREFAB_EXPANSION_DEPTH}階層を超えました`,
      ),
      prefabId: prefab.prefabId,
    });
    return;
  }

  const subtree = collectPrefabSubtree(prefab, instance.sourceEntityId, state, {
    hostEntityId,
    instance,
  });
  if (!subtree) return;

  const namespace = sha256Utf8(
    [hostEntityId, instance.id, instance.prefabAssetId, prefab.prefabId].join("\u0000"),
  ).slice(0, 24);
  const entityIdMap = new Map(
    subtree.map((sourceEntityId) => [
      sourceEntityId,
      generatedEntityId(namespace, sourceEntityId),
    ]),
  );
  const componentIdMap = new Map<string, string>();
  for (const sourceEntityId of subtree) {
    for (const component of prefab.entities[sourceEntityId].components) {
      componentIdMap.set(
        componentKey(sourceEntityId, component.id),
        generatedComponentId(namespace, sourceEntityId, component.id),
      );
    }
  }
  if (
    !reserveGeneratedIds(
      prefab,
      subtree,
      entityIdMap,
      componentIdMap,
      hostEntityId,
      instance,
      state,
    )
  ) {
    return;
  }

  for (const sourceEntityId of subtree) {
    const source = prefab.entities[sourceEntityId];
    const generatedId = entityIdMap.get(sourceEntityId)!;
    const components = source.components.map((component) =>
      clonePrefabComponent(
        component,
        componentIdMap.get(componentKey(sourceEntityId, component.id))!,
        sourceEntityId,
        entityIdMap,
        prefab,
        hostEntityId,
        instance,
        state,
      ),
    );
    state.entities[generatedId] = {
      ...source,
      id: generatedId,
      parentId:
        sourceEntityId === instance.sourceEntityId
          ? hostEntityId
          : source.parentId
            ? (entityIdMap.get(source.parentId) ?? hostEntityId)
            : hostEntityId,
      children: source.children.flatMap((childId) => {
        const generatedChildId = entityIdMap.get(childId);
        return generatedChildId ? [generatedChildId] : [];
      }),
      components,
    };
  }

  const generatedRootId = entityIdMap.get(instance.sourceEntityId)!;
  const host = state.entities[hostEntityId];
  state.entities[hostEntityId] = {
    ...host,
    children: [...host.children, generatedRootId],
  };
  expandEntity(
    generatedRootId,
    [...stack, { prefabId: prefab.prefabId, assetId: reference.asset.id }],
    state,
  );
}

function collectPrefabSubtree(
  prefab: PrefabDocument,
  sourceEntityId: string,
  state: ResolverState,
  owner: { hostEntityId: string; instance: PrefabInstanceComponent },
): string[] | null {
  const ordered: string[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();
  let valid = true;
  const visit = (entityId: string): void => {
    if (active.has(entityId)) {
      valid = false;
      addResolverDiagnostic(state, {
        ...instanceDiagnostic(
          state.sceneId,
          owner.hostEntityId,
          owner.instance,
          "prefab-hierarchy-cycle",
          `Prefab hierarchyが循環しています: ${entityId}`,
        ),
        prefabId: prefab.prefabId,
        fieldPath: `entities.${entityId}`,
      });
      return;
    }
    if (visited.has(entityId)) {
      valid = false;
      addResolverDiagnostic(state, {
        ...instanceDiagnostic(
          state.sceneId,
          owner.hostEntityId,
          owner.instance,
          "prefab-entity-multiple-parents",
          `Prefab Entityが複数箇所から参照されています: ${entityId}`,
        ),
        prefabId: prefab.prefabId,
        fieldPath: `entities.${entityId}`,
      });
      return;
    }
    const entity = prefab.entities[entityId];
    if (!entity) {
      valid = false;
      addResolverDiagnostic(state, {
        ...instanceDiagnostic(
          state.sceneId,
          owner.hostEntityId,
          owner.instance,
          "prefab-child-entity-missing",
          `Prefab child Entityが見つかりません: ${entityId}`,
        ),
        prefabId: prefab.prefabId,
        fieldPath: `entities.${entityId}`,
      });
      return;
    }
    visited.add(entityId);
    active.add(entityId);
    ordered.push(entityId);
    entity.children.forEach(visit);
    active.delete(entityId);
  };
  visit(sourceEntityId);
  return valid ? ordered : null;
}

function reserveGeneratedIds(
  prefab: PrefabDocument,
  subtree: readonly string[],
  entityIdMap: ReadonlyMap<string, string>,
  componentIdMap: ReadonlyMap<string, string>,
  hostEntityId: string,
  instance: PrefabInstanceComponent,
  state: ResolverState,
): boolean {
  const plannedEntityIds = new Set<string>();
  const plannedComponentIds = new Set<string>();
  let valid = true;
  for (const sourceEntityId of subtree) {
    const generatedId = entityIdMap.get(sourceEntityId)!;
    if (state.usedEntityIds.has(generatedId) || plannedEntityIds.has(generatedId)) {
      valid = false;
      addResolverDiagnostic(state, {
        ...instanceDiagnostic(
          state.sceneId,
          hostEntityId,
          instance,
          "prefab-expanded-entity-id-collision",
          `Prefab展開後のEntity IDが衝突しました: ${sourceEntityId}`,
        ),
        prefabId: prefab.prefabId,
        fieldPath: `entities.${sourceEntityId}.id`,
      });
    }
    plannedEntityIds.add(generatedId);
    for (const component of prefab.entities[sourceEntityId].components) {
      const generatedComponent = componentIdMap.get(
        componentKey(sourceEntityId, component.id),
      )!;
      if (
        state.usedComponentIds.has(generatedComponent) ||
        plannedComponentIds.has(generatedComponent)
      ) {
        valid = false;
        addResolverDiagnostic(state, {
          ...instanceDiagnostic(
            state.sceneId,
            hostEntityId,
            instance,
            "prefab-expanded-component-id-collision",
            `Prefab展開後のComponent IDが衝突しました: ${component.id}`,
          ),
          prefabId: prefab.prefabId,
          fieldPath: `entities.${sourceEntityId}.components.${component.id}`,
        });
      }
      plannedComponentIds.add(generatedComponent);
    }
  }
  if (!valid) return false;
  plannedEntityIds.forEach((entityId) => state.usedEntityIds.add(entityId));
  plannedComponentIds.forEach((componentId) =>
    state.usedComponentIds.add(componentId),
  );
  return true;
}

function clonePrefabComponent(
  component: RegisteredSceneComponent,
  generatedId: string,
  sourceEntityId: string,
  entityIdMap: ReadonlyMap<string, string>,
  prefab: PrefabDocument,
  hostEntityId: string,
  ownerInstance: PrefabInstanceComponent,
  state: ResolverState,
): RegisteredSceneComponent {
  if (component.type === "transform") {
    return {
      ...component,
      id: generatedId,
      position: [...component.position],
      rotation: [...component.rotation],
      scale: [...component.scale],
    };
  }
  if (component.type === "mesh") {
    return {
      ...component,
      id: generatedId,
      ...(component.geometry ? { geometry: { ...component.geometry } } : {}),
      materialBindings: component.materialBindings.map((binding) => ({
        ...binding,
      })),
    };
  }
  if (component.type === "xrift-component") {
    const entityReferences = component.entityReferences.map((entityReference) => {
      const generatedReference = entityIdMap.get(entityReference);
      if (generatedReference) return generatedReference;
      addResolverDiagnostic(state, {
        ...instanceDiagnostic(
          state.sceneId,
          hostEntityId,
          ownerInstance,
          prefab.entities[entityReference]
            ? "prefab-entity-reference-outside-subtree"
            : "prefab-entity-reference-missing",
          prefab.entities[entityReference]
            ? `XRift Entity参照が配置対象subtreeの外にあります: ${entityReference}`
            : `XRift Entity参照がPrefab内にありません: ${entityReference}`,
        ),
        prefabId: prefab.prefabId,
        componentId: generatedId,
        fieldPath: `entities.${sourceEntityId}.components.${component.id}.entityReferences`,
      });
      return entityReference;
    });
    return {
      ...component,
      id: generatedId,
      properties: { ...component.properties },
      assetReferences: [...component.assetReferences],
      entityReferences,
      ...(component.authoring
        ? {
            authoring: {
              ...component.authoring,
              ...(component.authoring.editablePropertyNames
                ? {
                    editablePropertyNames: [
                      ...component.authoring.editablePropertyNames,
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };
  }
  return { ...component, id: generatedId };
}

function cloneExpansionEntity(entity: SceneEntity): SceneEntity {
  return {
    ...entity,
    children: [...entity.children],
    components: [...entity.components],
  };
}

function generatedEntityId(namespace: string, sourceEntityId: string): string {
  return `__xrift_prefab_entity_${namespace}_${sha256Utf8(sourceEntityId).slice(0, 16)}`;
}

function generatedComponentId(
  namespace: string,
  sourceEntityId: string,
  sourceComponentId: string,
): string {
  return `__xrift_prefab_component_${namespace}_${sha256Utf8(
    `${sourceEntityId}\u0000${sourceComponentId}`,
  ).slice(0, 16)}`;
}

function componentKey(entityId: string, componentId: string): string {
  return `${entityId}\u0000${componentId}`;
}

function instanceDiagnostic(
  sceneId: string,
  entityId: string,
  component: PrefabInstanceComponent,
  code: string,
  message: string,
): CompilerDiagnostic {
  return {
    severity: "blocking",
    code,
    message,
    sceneId,
    entityId,
    componentId: component.id,
    assetId: component.prefabAssetId,
  };
}

function addResolverDiagnostic(
  state: ResolverState,
  diagnostic: CompilerDiagnostic,
): void {
  const key = [
    diagnostic.severity,
    diagnostic.code,
    diagnostic.sceneId,
    diagnostic.prefabId,
    diagnostic.entityId,
    diagnostic.componentId,
    diagnostic.assetId,
    diagnostic.fieldPath,
  ].join("|");
  if (state.diagnosticKeys.has(key)) return;
  state.diagnosticKeys.add(key);
  state.diagnostics.push(diagnostic);
}

function isPrefabDocumentPath(value: string): boolean {
  return (
    /^prefabs\/(?:[^/]+\/)*[^/]+\.prefab\.json$/.test(value) &&
    !value.includes("..") &&
    !value.includes("\\")
  );
}
