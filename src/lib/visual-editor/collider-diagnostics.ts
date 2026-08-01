import {
  updateColliderComponent,
  updateRigidBodyComponent,
  type ColliderComponent,
  type RigidBodyComponent,
  type RigidBodyType,
  type SceneDocument,
  type SceneEntity,
} from "./scene-document";

export type ColliderDiagnosticSeverity = "error" | "warning" | "info";

export type ColliderDiagnosticCode =
  | "entity-disabled"
  | "mesh-collider-without-mesh"
  | "dynamic-trimesh"
  | "ccd-disabled"
  | "duplicate-mesh-collider"
  | "explicit-mesh-with-auto-collider"
  | "rigid-body-without-shape"
  | "auto-collider-without-mesh"
  | "invalid-surface";

export type ColliderDiagnostic = {
  code: ColliderDiagnosticCode;
  severity: ColliderDiagnosticSeverity;
  entityId: string;
  entityName: string;
  componentId?: string;
  message: string;
  fixable: boolean;
  fixLabel?: string;
};

export type ColliderInspection = {
  colliderCount: number;
  enabledColliderCount: number;
  boxColliderCount: number;
  meshColliderCount: number;
  diagnostics: ColliderDiagnostic[];
  fixableCount: number;
  summary: "ready" | "warning" | "error";
};

export type ColliderOptimizationChange = {
  code: ColliderDiagnosticCode;
  entityId: string;
  componentId?: string;
  message: string;
};

export type ColliderOptimizationResult = {
  scene: SceneDocument;
  changes: ColliderOptimizationChange[];
  before: ColliderInspection;
  after: ColliderInspection;
};

type ColliderInspectionOptions = {
  entityIds?: readonly string[];
};

function isMovingBody(bodyType: RigidBodyType): boolean {
  return bodyType !== "fixed";
}

function getEnabledRigidBody(entity: SceneEntity): RigidBodyComponent | undefined {
  return entity.components.find(
    (component): component is RigidBodyComponent =>
      component.type === "rigid-body" && component.enabled,
  );
}

function findOwningRigidBody(
  scene: SceneDocument,
  entityId: string,
): { entity: SceneEntity; component: RigidBodyComponent } | undefined {
  let current: SceneEntity | undefined = scene.entities[entityId];
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const component = getEnabledRigidBody(current);
    if (component) return { entity: current, component };
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return undefined;
}

function hasEnabledMeshInBody(scene: SceneDocument, rootId: string): boolean {
  const pending = [rootId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const entityId = pending.pop();
    if (entityId === undefined || visited.has(entityId)) continue;
    visited.add(entityId);
    const entity = scene.entities[entityId];
    if (!entity || !entity.enabled) continue;
    if (
      entity.components.some(
        (component) => component.type === "mesh" && component.enabled,
      )
    ) {
      return true;
    }
    for (const childId of entity.children) {
      const child = scene.entities[childId];
      if (child && !getEnabledRigidBody(child)) pending.push(childId);
    }
  }
  return false;
}

function hasEnabledColliderInBody(scene: SceneDocument, rootId: string): boolean {
  const pending = [rootId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const entityId = pending.pop();
    if (!entityId || visited.has(entityId)) continue;
    visited.add(entityId);
    const entity = scene.entities[entityId];
    if (!entity || !entity.enabled) continue;
    if (entity.components.some((component) => component.type === "collider" && component.enabled)) {
      return true;
    }
    for (const childId of entity.children) {
      const child = scene.entities[childId];
      if (child && !getEnabledRigidBody(child)) pending.push(childId);
    }
  }
  return false;
}

function bodyTypeForCollider(
  scene: SceneDocument,
  entity: SceneEntity,
  collider: ColliderComponent,
): { bodyType: RigidBodyType; owner?: { entity: SceneEntity; component: RigidBodyComponent } } {
  const owner = findOwningRigidBody(scene, entity.id);
  return {
    bodyType: owner?.component.bodyType ?? collider.bodyType ?? "fixed",
    owner,
  };
}

function pushDiagnostic(
  diagnostics: ColliderDiagnostic[],
  diagnostic: ColliderDiagnostic,
): void {
  diagnostics.push(diagnostic);
}

export function inspectColliderConfiguration(
  scene: SceneDocument,
  options: ColliderInspectionOptions = {},
): ColliderInspection {
  const requestedIds = options.entityIds ? new Set(options.entityIds) : null;
  const diagnostics: ColliderDiagnostic[] = [];
  let colliderCount = 0;
  let enabledColliderCount = 0;
  let boxColliderCount = 0;
  let meshColliderCount = 0;

  for (const entity of Object.values(scene.entities)) {
    if (requestedIds && !requestedIds.has(entity.id)) continue;
    const colliders = entity.components.filter(
      (component): component is ColliderComponent => component.type === "collider",
    );
    colliderCount += colliders.length;
    boxColliderCount += colliders.filter((collider) => collider.shape === "box").length;
    meshColliderCount += colliders.filter((collider) => collider.shape === "mesh").length;
    const enabledColliders = colliders.filter((collider) => collider.enabled);
    enabledColliderCount += enabledColliders.length;

    if (enabledColliders.length > 0 && !entity.enabled) {
      pushDiagnostic(diagnostics, {
        code: "entity-disabled",
        severity: "warning",
        entityId: entity.id,
        entityName: entity.name,
        message: "Colliderは有効ですが、Entityが無効なので実行時には使われません",
        fixable: false,
      });
    }

    const meshColliders = enabledColliders.filter(
      (collider) => collider.shape === "mesh",
    );
    for (const [index, collider] of meshColliders.entries()) {
      const { bodyType, owner } = bodyTypeForCollider(scene, entity, collider);
      if (!hasEnabledMeshInBody(scene, entity.id)) {
        pushDiagnostic(diagnostics, {
          code: "mesh-collider-without-mesh",
          severity: "error",
          entityId: entity.id,
          entityName: entity.name,
          componentId: collider.id,
          message: "Mesh Colliderの範囲に有効なMesh Rendererがありません",
          fixable: false,
        });
      }
      if (isMovingBody(bodyType) && collider.meshMode === "trimesh") {
        pushDiagnostic(diagnostics, {
          code: "dynamic-trimesh",
          severity: "warning",
          entityId: entity.id,
          entityName: entity.name,
          componentId: collider.id,
          message: "Dynamic / KinematicのTrimeshは実行時にConvex Hullへ変換されます",
          fixable: true,
          fixLabel: "Convex Hullへ変更",
        });
      }
      if (owner?.component.autoColliders !== "none") {
        pushDiagnostic(diagnostics, {
          code: "explicit-mesh-with-auto-collider",
          severity: "warning",
          entityId: entity.id,
          entityName: entity.name,
          componentId: collider.id,
          message: "明示的なMesh ColliderとRigid Bodyの自動Colliderが重複する可能性があります",
          fixable: false,
        });
      }
      if (index > 0) {
        pushDiagnostic(diagnostics, {
          code: "duplicate-mesh-collider",
          severity: "warning",
          entityId: entity.id,
          entityName: entity.name,
          componentId: collider.id,
          message: "同じEntityのMesh Colliderは先頭の1つだけが実行・出力されます",
          fixable: true,
          fixLabel: "重複を無効化",
        });
      }
    }

    for (const collider of enabledColliders) {
      const { bodyType } = bodyTypeForCollider(scene, entity, collider);
      if (isMovingBody(bodyType) && !collider.ccd) {
        pushDiagnostic(diagnostics, {
          code: "ccd-disabled",
          severity: "warning",
          entityId: entity.id,
          entityName: entity.name,
          componentId: collider.id,
          message: "移動するColliderのCCDが無効です。高速移動時のすり抜け対策を有効にできます",
          fixable: true,
          fixLabel: "CCDを有効化",
        });
      }
      if (
        !Number.isFinite(collider.friction) ||
        collider.friction < 0 ||
        !Number.isFinite(collider.restitution) ||
        collider.restitution < 0 ||
        collider.restitution > 1
      ) {
        pushDiagnostic(diagnostics, {
          code: "invalid-surface",
          severity: "error",
          entityId: entity.id,
          entityName: entity.name,
          componentId: collider.id,
          message: "Frictionは0以上、Restitutionは0から1の範囲で指定してください",
          fixable: true,
          fixLabel: "値を正規化",
        });
      }
    }

    const rigidBody = getEnabledRigidBody(entity);
    if (rigidBody) {
      const hasExplicitShape = hasEnabledColliderInBody(scene, entity.id);
      if (rigidBody.autoColliders === "none" && !hasExplicitShape) {
        pushDiagnostic(diagnostics, {
          code: "rigid-body-without-shape",
          severity: "error",
          entityId: entity.id,
          entityName: entity.name,
          componentId: rigidBody.id,
          message: "Rigid Bodyの範囲に有効なMeshまたはColliderがありません",
          fixable: false,
        });
      } else if (rigidBody.autoColliders !== "none" && !hasEnabledMeshInBody(scene, entity.id)) {
        pushDiagnostic(diagnostics, {
          code: "auto-collider-without-mesh",
          severity: "warning",
          entityId: entity.id,
          entityName: entity.name,
          componentId: rigidBody.id,
          message: "自動Colliderを作成する有効なMeshがBody範囲にありません",
          fixable: false,
        });
      }
    }
  }

  const fixableCount = diagnostics.filter((diagnostic) => diagnostic.fixable).length;
  return {
    colliderCount,
    enabledColliderCount,
    boxColliderCount,
    meshColliderCount,
    diagnostics,
    fixableCount,
    summary: diagnostics.some((diagnostic) => diagnostic.severity === "error")
      ? "error"
      : diagnostics.length > 0
        ? "warning"
        : "ready",
  };
}

function normalizedSurfacePatch(collider: ColliderComponent) {
  return {
    friction:
      Number.isFinite(collider.friction) && collider.friction >= 0
        ? collider.friction
        : 0.5,
    restitution:
      Number.isFinite(collider.restitution)
        ? Math.min(1, Math.max(0, collider.restitution))
        : 0,
  };
}

export function optimizeColliderConfiguration(
  scene: SceneDocument,
  options: ColliderInspectionOptions = {},
): ColliderOptimizationResult {
  const before = inspectColliderConfiguration(scene, options);
  let nextScene = scene;
  const changes: ColliderOptimizationChange[] = [];

  for (const diagnostic of before.diagnostics) {
    if (!diagnostic.fixable || !diagnostic.componentId) continue;
    const entity = nextScene.entities[diagnostic.entityId];
    const collider = entity?.components.find(
      (component): component is ColliderComponent =>
        component.type === "collider" && component.id === diagnostic.componentId,
    );
    if (!entity || !collider) continue;

    if (diagnostic.code === "dynamic-trimesh" && collider.shape === "mesh") {
      nextScene = updateColliderComponent(
        nextScene,
        entity.id,
        { meshMode: "convex" },
        collider.id,
      );
      changes.push({
        code: diagnostic.code,
        entityId: entity.id,
        componentId: collider.id,
        message: "Dynamic / Kinematic用にMesh ColliderをConvex Hullへ変更しました",
      });
      continue;
    }

    if (diagnostic.code === "duplicate-mesh-collider") {
      nextScene = updateColliderComponent(
        nextScene,
        entity.id,
        { enabled: false },
        collider.id,
      );
      changes.push({
        code: diagnostic.code,
        entityId: entity.id,
        componentId: collider.id,
        message: "出力時に折りたたまれる重複Mesh Colliderを無効化しました",
      });
      continue;
    }

    if (diagnostic.code === "ccd-disabled") {
      const owner = findOwningRigidBody(nextScene, entity.id);
      if (owner) {
        nextScene = updateRigidBodyComponent(
          nextScene,
          owner.entity.id,
          { ccd: true },
          owner.component.id,
        );
      } else {
        nextScene = updateColliderComponent(
          nextScene,
          entity.id,
          { ccd: true },
          collider.id,
        );
      }
      changes.push({
        code: diagnostic.code,
        entityId: entity.id,
        componentId: owner?.component.id ?? collider.id,
        message: "高速移動時のすり抜け対策としてCCDを有効化しました",
      });
      continue;
    }

    if (diagnostic.code === "invalid-surface") {
      nextScene = updateColliderComponent(
        nextScene,
        entity.id,
        normalizedSurfacePatch(collider),
        collider.id,
      );
      changes.push({
        code: diagnostic.code,
        entityId: entity.id,
        componentId: collider.id,
        message: "Colliderの摩擦・反発値を有効範囲へ正規化しました",
      });
    }
  }

  return {
    scene: nextScene,
    changes,
    before,
    after: inspectColliderConfiguration(nextScene, options),
  };
}
