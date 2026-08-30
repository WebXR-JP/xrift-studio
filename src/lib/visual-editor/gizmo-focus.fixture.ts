import {
  BoxGeometry,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Scene,
  Vector3,
} from "three";

import {
  EDITOR_HELPER_USER_DATA,
  computeEntityFocusBounds,
  resolveEntityWorldPosition,
  resolveFocusDistance,
} from "./gizmo-focus";
import type { SceneDocument } from "./scene-document";

/**
 * Focus and the transform gizmo have to agree on where an object is. These
 * assertions hold the three rules that keep them agreeing: the gizmo is only
 * correct at the Scene root, the frame is measured from what the author can
 * see, and an Entity's world position is composed through its ancestry.
 */
export function runGizmoFocusFixtureAssertions(): void {
  assertGizmoOnlyLandsOnTheObjectAtTheSceneRoot();
  assertFocusIgnoresEditorHelpers();
  assertFocusIgnoresHiddenSubtrees();
  assertFocusFallsBackWhenNothingIsMeasurable();
  assertFocusDistanceFitsTheRadius();
  assertWorldPositionComposesTheAncestry();
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`gizmo focus fixture: ${message}`);
}

function meshAt(position: [number, number, number], size = 1): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(size, size, size),
    new MeshBasicMaterial(),
  );
  mesh.position.set(...position);
  return mesh;
}

/**
 * The gizmo positions its handles in its own parent's space, so mounting it
 * inside the selected Entity's ancestors applies their transform a second
 * time. That is why SceneViewport portals the controls to the Scene root: a
 * child Entity's gizmo would otherwise draw away from the object it moves.
 *
 * The handle placement here is the one line that matters from
 * `TransformControlsGizmo.updateMatrixWorld`, which sets every handle to
 * `this.worldPosition` - the attached object's world position, written into
 * the controls' own local space.
 */
function assertGizmoOnlyLandsOnTheObjectAtTheSceneRoot(): void {
  const drawGizmoAt = (mountAtSceneRoot: boolean) => {
    const scene = new Scene();

    const parent = new Group();
    parent.position.set(5, 0, 0);
    parent.rotation.set(0, Math.PI / 2, 0);
    scene.add(parent);

    const child = new Group();
    child.position.set(1, 0, 0);
    parent.add(child);

    const controls = new Object3D();
    (mountAtSceneRoot ? scene : parent).add(controls);
    const handle = new Object3D();
    controls.add(handle);

    scene.updateMatrixWorld(true);
    const objectWorldPosition = child.getWorldPosition(new Vector3());
    handle.position.copy(objectWorldPosition);
    scene.updateMatrixWorld(true);

    return {
      handle: handle.getWorldPosition(new Vector3()),
      object: objectWorldPosition,
    };
  };

  const atSceneRoot = drawGizmoAt(true);
  assert(
    atSceneRoot.handle.distanceTo(atSceneRoot.object) < 1e-6,
    "a gizmo at the Scene root must draw on the object it is attached to",
  );

  const nested = drawGizmoAt(false);
  assert(
    nested.handle.distanceTo(nested.object) > 1,
    "mounting the gizmo inside the Entity's ancestors must be the drift this rule prevents",
  );
}

/**
 * The collider wireframe is drawn only while an Entity is selected, which is
 * exactly when focus runs, so measuring it would frame a box the author never
 * sees and leave the gizmo off centre.
 */
function assertFocusIgnoresEditorHelpers(): void {
  const root = new Group();
  root.add(meshAt([0, 0, 0]));

  const collider = meshAt([10, 0, 0], 4);
  collider.userData = { ...EDITOR_HELPER_USER_DATA };
  root.add(collider);

  const selectionOutline = new LineSegments(new BoxGeometry(6, 6, 6));
  selectionOutline.position.set(-10, 0, 0);
  root.add(selectionOutline);

  const bounds = computeEntityFocusBounds(root);
  assert(bounds !== null, "a mesh Entity must be measurable");
  assert(
    Math.abs(bounds!.center[0]) < 1e-6,
    `helpers must not move the focus centre (got ${bounds!.center[0]})`,
  );
  assert(
    bounds!.radius < 1.5,
    `helpers must not inflate the focus radius (got ${bounds!.radius})`,
  );
}

function assertFocusIgnoresHiddenSubtrees(): void {
  const root = new Group();
  root.add(meshAt([0, 0, 0]));

  const disabledChild = new Group();
  disabledChild.visible = false;
  disabledChild.position.set(40, 0, 0);
  disabledChild.add(meshAt([0, 0, 0]));
  root.add(disabledChild);

  const bounds = computeEntityFocusBounds(root);
  assert(bounds !== null, "a mesh Entity must be measurable");
  assert(
    bounds!.radius < 1.5,
    `a disabled child must not stretch the frame (got ${bounds!.radius})`,
  );

  // A disabled Entity is still findable: focus measures its own contents.
  root.visible = false;
  const hiddenRoot = computeEntityFocusBounds(root);
  assert(
    hiddenRoot !== null && hiddenRoot.radius < 1.5,
    "focusing a disabled Entity must still frame its own mesh",
  );
}

function assertFocusFallsBackWhenNothingIsMeasurable(): void {
  const root = new Group();
  root.add(new Group());
  assert(
    computeEntityFocusBounds(root) === null,
    "an Entity that draws nothing must fall back to its origin",
  );
}

function assertFocusDistanceFitsTheRadius(): void {
  const verticalFov = (50 * Math.PI) / 180;
  const near = resolveFocusDistance({
    radius: 0.5,
    currentDistance: 12,
    verticalFov,
    aspect: 16 / 9,
    minDistance: 2.5,
    maxDistance: 800,
  });
  const far = resolveFocusDistance({
    radius: 5,
    currentDistance: 12,
    verticalFov,
    aspect: 16 / 9,
    minDistance: 2.5,
    maxDistance: 800,
  });
  assert(far > near, "a larger object must be framed from further away");
  assert(
    near >= 2.5,
    `the minimum distance must hold for small objects (got ${near})`,
  );

  // A tall, narrow window limits on width, so the pull-back must be larger.
  const wide = resolveFocusDistance({
    radius: 5,
    currentDistance: 12,
    verticalFov,
    aspect: 2,
    minDistance: 2.5,
    maxDistance: 800,
  });
  const narrow = resolveFocusDistance({
    radius: 5,
    currentDistance: 12,
    verticalFov,
    aspect: 0.5,
    minDistance: 2.5,
    maxDistance: 800,
  });
  assert(narrow > wide, "a narrow viewport must pull the camera back further");

  const unmeasurable = resolveFocusDistance({
    radius: 0,
    currentDistance: 12,
    verticalFov,
    aspect: 16 / 9,
    minDistance: 2.5,
    maxDistance: 800,
  });
  assert(
    Math.abs(unmeasurable - 12) < 1e-6,
    `without a radius the current distance is kept (got ${unmeasurable})`,
  );

  const clamped = resolveFocusDistance({
    radius: 500,
    currentDistance: 12,
    verticalFov,
    aspect: 16 / 9,
    minDistance: 2.5,
    maxDistance: 40,
  });
  assert(
    Math.abs(clamped - 40) < 1e-6,
    `the far clamp must hold for huge objects (got ${clamped})`,
  );
}

function assertWorldPositionComposesTheAncestry(): void {
  const scene = documentWithRotatedParent();
  const world = resolveEntityWorldPosition(scene, "child");
  assert(world !== null, "a known Entity must resolve a world position");
  // The parent is rotated a quarter turn about Y, so the child's local +X
  // offset of 2 lands on -Z, not on +X.
  assert(
    Math.abs(world![0] - 5) < 1e-6 &&
      Math.abs(world![1] - 1) < 1e-6 &&
      Math.abs(world![2] + 2) < 1e-6,
    `the parent's rotation must be applied (got ${JSON.stringify(world)})`,
  );
  assert(
    resolveEntityWorldPosition(scene, "missing") === null,
    "an unknown Entity resolves nothing rather than the origin",
  );
}

function documentWithRotatedParent(): SceneDocument {
  const entity = (
    id: string,
    parentId: string | null,
    children: string[],
    position: [number, number, number],
    rotation: [number, number, number],
  ) => ({
    id,
    name: id,
    enabled: true,
    parentId,
    children,
    components: [
      {
        id: `${id}-transform`,
        type: "transform" as const,
        enabled: true,
        position,
        rotation,
        scale: [1, 1, 1] as [number, number, number],
      },
    ],
  });

  return {
    version: 1,
    rootEntityIds: ["parent"],
    entities: {
      parent: entity("parent", null, ["child"], [5, 1, 0], [0, Math.PI / 2, 0]),
      child: entity("child", "parent", [], [2, 0, 0], [0, 0, 0]),
    },
  } as unknown as SceneDocument;
}
