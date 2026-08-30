import { getEntityWorldBounds } from "./entity-bounds";
import { BUILTIN_PRIMITIVE_CREATION_IDS } from "./creation-catalog";
import { reparentEntityHierarchy } from "./editor-session";
import { BUILTIN_ASSET_IDS, createPrototypeProject } from "./prototype-project";
import {
  addBuiltinPrimitiveEntity,
  addTerrainEntity,
  updateEntityTransform,
  type SceneDocument,
  type Vec3,
} from "./scene-document";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function close(actual: number, expected: number, tolerance = 1e-6): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function closeVec(actual: Vec3, expected: Vec3, tolerance = 1e-6): boolean {
  return actual.every((value, index) => close(value, expected[index], tolerance));
}

function project() {
  const bundle = createPrototypeProject("world");
  return { scene: bundle.scene, assets: bundle.assets };
}

function addBox(
  scene: SceneDocument,
  assets: ReturnType<typeof project>["assets"],
  position: Vec3,
): { scene: SceneDocument; entityId: string } {
  const added = addBuiltinPrimitiveEntity(
    scene,
    assets,
    BUILTIN_PRIMITIVE_CREATION_IDS.box,
    BUILTIN_ASSET_IDS.material.blue,
    position,
  );
  if (!added) throw new Error("Box primitive could not be created");
  return { scene: added.scene, entityId: added.entityId };
}

/**
 * A unit box at the origin measures one metre on every axis.
 *
 * This is the assertion the whole module exists for: a caller reading the
 * document alone has a Transform and no size, and everything downstream —
 * "does this overlap", "how high do I put it" — is wrong the moment this is.
 */
function assertUnitBox(): void {
  const { assets, scene: base } = project();
  const { scene, entityId } = addBox(base, assets, [0, 0, 0]);
  const bounds = getEntityWorldBounds(scene, assets, entityId);
  assert(bounds.world !== null, "A builtin box should have resolvable bounds");
  assert(
    closeVec(bounds.world!.size, [1, 1, 1]),
    `Unit box size was ${bounds.world!.size.join(", ")}`,
  );
  assert(
    closeVec(bounds.world!.center, [0, 0, 0]),
    `Unit box center was ${bounds.world!.center.join(", ")}`,
  );
  assert(
    bounds.measured.length === 1 && bounds.measured[0] === entityId,
    "The box itself should be the only measured Entity",
  );
  assert(bounds.unmeasured.length === 0, "A builtin box is never unmeasured");
}

/** Scale and position belong to the world box; local stays the raw mesh. */
function assertTransformIsApplied(): void {
  const { assets, scene: base } = project();
  const { scene: placed, entityId } = addBox(base, assets, [0, 0, 0]);
  const scene = updateEntityTransform(placed, entityId, {
    position: [2, 3, 4],
    scale: [2, 4, 6],
  });
  const bounds = getEntityWorldBounds(scene, assets, entityId);
  assert(
    closeVec(bounds.world!.size, [2, 4, 6]),
    `Scaled size was ${bounds.world!.size.join(", ")}`,
  );
  assert(
    closeVec(bounds.world!.center, [2, 3, 4]),
    `Scaled center was ${bounds.world!.center.join(", ")}`,
  );
  assert(
    closeVec(bounds.local!.size, [1, 1, 1]),
    "Local bounds should stay the untransformed mesh extent",
  );
}

/**
 * A 45° yaw widens the axis-aligned box to the diagonal.
 *
 * The world box is what a caller compares against another world box, so a
 * rotated thing has to report the box that contains it rather than its own
 * unrotated extent — otherwise two things read as clear of each other while
 * their corners overlap.
 */
function assertRotationWidensTheBox(): void {
  const { assets, scene: base } = project();
  const { scene: placed, entityId } = addBox(base, assets, [0, 0, 0]);
  const scene = updateEntityTransform(placed, entityId, {
    rotation: [0, Math.PI / 4, 0],
  });
  const bounds = getEntityWorldBounds(scene, assets, entityId);
  const diagonal = Math.SQRT2;
  assert(
    close(bounds.world!.size[0], diagonal, 1e-6) &&
      close(bounds.world!.size[2], diagonal, 1e-6),
    `Rotated box width was ${bounds.world!.size.join(", ")}`,
  );
  assert(
    close(bounds.world!.size[1], 1, 1e-6),
    "A yaw should not change the height of the box",
  );
}

/** A child is measured through its parent's Transform, not its own alone. */
function assertParentChainIsWalked(): void {
  const { assets, scene: base } = project();
  const parent = addBox(base, assets, [10, 0, 0]);
  const child = addBox(parent.scene, assets, [1, 0, 0]);
  const reparented = reparentEntityHierarchy(
    child.scene,
    child.entityId,
    parent.entityId,
  );
  const scaledParent = updateEntityTransform(reparented, parent.entityId, {
    scale: [2, 2, 2],
  });
  const childBounds = getEntityWorldBounds(
    scaledParent,
    assets,
    child.entityId,
  );
  // Parent at x=10 scaled 2x, child offset 1 in the parent's space => 10 + 2.
  assert(
    close(childBounds.world!.center[0], 12),
    `Child world center x was ${childBounds.world!.center[0]}`,
  );
  assert(
    close(childBounds.world!.size[0], 2),
    "The parent's scale should reach the child's extent",
  );

  const subtree = getEntityWorldBounds(scaledParent, assets, parent.entityId);
  assert(
    subtree.measured.length === 2,
    "A subtree query should measure the parent and the child",
  );
  // The scaled parent box spans 9..11 and the child box spans 11..13.
  assert(
    close(subtree.world!.min[0], 9) && close(subtree.world!.max[0], 13),
    `Subtree span was ${subtree.world!.min[0]}..${subtree.world!.max[0]}`,
  );

  const own = getEntityWorldBounds(scaledParent, assets, parent.entityId, {
    includeDescendants: false,
  });
  assert(
    own.measured.length === 1 && close(own.world!.max[0], 11),
    "includeDescendants false should stop at the Entity's own mesh",
  );
}

/** Terrain reports its authored footprint, so a caller can place things on it. */
function assertTerrainFootprint(): void {
  const { assets, scene: base } = project();
  const created = addTerrainEntity(
    base,
    assets,
    BUILTIN_ASSET_IDS.material.green,
    { width: 24, depth: 16, resolution: 17, position: [3, 0, -2] },
  );
  if (!created) throw new Error("Terrain could not be created");
  const bounds = getEntityWorldBounds(created.scene, assets, created.entityId);
  assert(
    close(bounds.world!.size[0], 24) && close(bounds.world!.size[2], 16),
    `Terrain footprint was ${bounds.world!.size.join(", ")}`,
  );
  assert(
    close(bounds.world!.center[0], 3) && close(bounds.world!.center[2], -2),
    "Terrain bounds should follow the Entity position",
  );
}

/** An Entity with no geometry reports nothing rather than a zero-size box. */
function assertMissingGeometryIsReported(): void {
  const { assets, scene } = project();
  const rootId = Object.values(scene.entities).find(
    (entity) => !entity.components.some((component) => component.type === "mesh"),
  )?.id;
  if (!rootId) return;
  const bounds = getEntityWorldBounds(scene, assets, rootId, {
    includeDescendants: false,
  });
  assert(
    bounds.world === null && bounds.local === null,
    "An Entity with no mesh should report null bounds, not an empty box",
  );
  const missing = getEntityWorldBounds(scene, assets, "entity-does-not-exist");
  assert(
    missing.world === null && missing.measured.length === 0,
    "An unknown Entity should report nothing rather than throw",
  );
}

export function runEntityBoundsFixtureAssertions(): void {
  assertUnitBox();
  assertTransformIsApplied();
  assertRotationWidensTheBox();
  assertParentChainIsWalked();
  assertTerrainFootprint();
  assertMissingGeometryIsReported();
}
