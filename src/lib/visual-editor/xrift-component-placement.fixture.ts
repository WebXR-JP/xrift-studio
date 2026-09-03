import { analyzeComponentCode } from "./component-code-import";
import {
  XRIFT_COMPONENT_SCHEMA_IDS,
  createXriftComponent,
} from "./component-registry";
import { createEmptyEntity } from "./editor-session";
import { createPrototypeProject } from "./prototype-project";
import {
  createBoxColliderComponent,
  getTransform,
  type SceneDocument,
  type Vec3,
  type XRiftComponent,
} from "./scene-document";
import {
  composeTransformWithPlacement,
  isIdentityPlacement,
  migrateXriftComponentPlacementIntoTransform,
  readXriftPlacementProperties,
} from "./xrift-component-placement";

/**
 * Assertions for the one origin an official Component is selected by.
 *
 * A Component that keeps its own position/rotation draws itself away from the
 * Entity the transform gizmo is attached to, so selecting a ScreenShareDisplay
 * put the gizmo somewhere else entirely and a rotation drag swung the screen
 * around an invisible pivot. The import path and the document loader both fold
 * that offset into the Entity Transform, and these cover the fold staying
 * exact and staying away from Entities where it would move other content.
 */
export function runXriftComponentPlacementFixtureAssertions(): void {
  assertPlacementReadsOnlyTransformShapedProps();
  assertComposeKeepsWorldPlacement();
  assertImportedScreenShareOwnsItsEntityOrigin();
  assertLoadFoldsPlacementIntoTransform();
  assertLoadLeavesPlacementThatWouldMoveOtherContent();
}

function assertPlacementReadsOnlyTransformShapedProps(): void {
  const screenShare = readXriftPlacementProperties(
    XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay,
    { position: [1, 2, 3], rotation: [0, Math.PI / 2, 0] },
  );
  assert(
    screenShare !== null &&
      vecEquals(screenShare.position, [1, 2, 3]) &&
      vecEquals(screenShare.rotation, [0, Math.PI / 2, 0]) &&
      vecEquals(screenShare.scale, [1, 1, 1]),
    "ScreenShareDisplay's own position and rotation must read as its placement",
  );
  assert(
    screenShare !== null && !isIdentityPlacement(screenShare),
    "A non-zero offset must not read as identity",
  );

  // VideoScreen's `scale` is the screen's width and height, not a transform
  // scale: folding it would resize the screen instead of moving the Entity.
  const videoScreen = readXriftPlacementProperties(
    XRIFT_COMPONENT_SCHEMA_IDS.videoScreen,
    { scale: [5.33, 3] },
  );
  assert(
    videoScreen !== null &&
      !videoScreen.propertyNames.includes("scale") &&
      isIdentityPlacement(videoScreen),
    "VideoScreen's vec2 scale must stay a screen size, not a placement",
  );

  const billboard = readXriftPlacementProperties(
    XRIFT_COMPONENT_SCHEMA_IDS.billboardY,
    { scale: 2 },
  );
  assert(
    billboard !== null && vecEquals(billboard.scale, [2, 2, 2]),
    "BillboardY's group-compatible scale must read as a uniform placement scale",
  );

  assert(
    readXriftPlacementProperties(XRIFT_COMPONENT_SCHEMA_IDS.skybox, {}) === null,
    "A Component drawn at its own origin must report no placement",
  );
}

function assertComposeKeepsWorldPlacement(): void {
  const quarter = Math.PI / 4;
  const folded = composeTransformWithPlacement(
    { position: [0, 1, 0], rotation: [0, quarter, 0], scale: [1, 1, 1] },
    {
      position: [2, 0, 0],
      rotation: [0, quarter, 0],
      scale: [1, 1, 1],
      propertyNames: ["position", "rotation"],
    },
  );
  // The Entity turns the offset an eighth of a turn before it is added.
  const diagonal = 2 * Math.SQRT1_2;
  assert(
    vecEquals(folded.position, [diagonal, 1, -diagonal], 1e-5),
    "Folding must place the Entity where the Component was drawn",
  );
  assert(
    vecEquals(folded.rotation, [0, Math.PI / 2, 0], 1e-5),
    "Folding must add the Component's own rotation to the Entity's",
  );
  assert(
    vecEquals(folded.scale, [1, 1, 1], 1e-5),
    "Folding a placement without scale must leave the Entity's scale alone",
  );
}

function assertImportedScreenShareOwnsItsEntityOrigin(): void {
  const plan = analyzeComponentCode(
    [
      'import { ScreenShareDisplay } from "@xrift/world-components";',
      "",
      "export default function World() {",
      "  return (",
      "    <ScreenShareDisplay",
      '      id="screen-share"',
      "      position={[-19.72, 2, 0]}",
      "      rotation={[0, Math.PI / 2, 0]}",
      "      width={8}",
      "    />",
      "  );",
      "}",
    ].join("\n"),
    "world",
  );
  const node = plan.nodes.find(
    (candidate) =>
      candidate.xriftComponents[0]?.schemaId ===
      XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay,
  );
  assert(node !== undefined, "The imported ScreenShareDisplay must reach the plan");
  assert(
    vecEquals(node.transform.position, [-19.72, 2, 0], 1e-5) &&
      Math.abs(node.transform.rotation[1] - Math.PI / 2) < 1e-5,
    "The Component's own placement must become the Entity's Transform",
  );
  const properties = node.xriftComponents[0]?.properties ?? {};
  assert(
    properties.position === undefined &&
      properties.rotation === undefined &&
      properties.width === 8,
    "Only the placement props move; the Component's own settings stay",
  );
}

function assertLoadFoldsPlacementIntoTransform(): void {
  const { scene, component } = sceneWithOffsetScreenShare();
  const migrated = migrateXriftComponentPlacementIntoTransform(scene);
  const entityId = entityIdHolding(migrated, component.id);
  const transform = getTransform(migrated.entities[entityId]);
  assert(
    transform !== undefined && vecEquals(transform.position, [3, 1, -2], 1e-5),
    "Opening a project must move the Entity origin onto the drawn screen",
  );
  const migratedComponent = migrated.entities[entityId].components.find(
    (candidate): candidate is XRiftComponent => candidate.id === component.id,
  );
  assert(
    migratedComponent !== undefined &&
      migratedComponent.properties.position === undefined &&
      migratedComponent.properties.rotation === undefined &&
      migratedComponent.properties.id === "screen-share",
    "The folded Component must keep its settings and lose only the offset",
  );
  assert(
    migrateXriftComponentPlacementIntoTransform(migrated) === migrated,
    "A scene with nothing to fold must be returned unchanged",
  );
}

function assertLoadLeavesPlacementThatWouldMoveOtherContent(): void {
  const { scene, component } = sceneWithOffsetScreenShare();
  const entityId = entityIdHolding(scene, component.id);
  const collider = createBoxColliderComponent("component-fixture-collider");
  const withCollider: SceneDocument = {
    ...scene,
    entities: {
      ...scene.entities,
      [entityId]: {
        ...scene.entities[entityId],
        components: [...scene.entities[entityId].components, collider],
      },
    },
  };
  assert(
    migrateXriftComponentPlacementIntoTransform(withCollider) === withCollider,
    "An Entity with a Collider on its origin must keep its Component offset",
  );
}

function sceneWithOffsetScreenShare(): {
  scene: SceneDocument;
  component: XRiftComponent;
} {
  const project = createPrototypeProject("world");
  const scene = project.scene;
  const created = createEmptyEntity(scene, null, "Screen");
  assert(created !== null, "The fixture Entity could not be created");
  const component = createXriftComponent(
    XRIFT_COMPONENT_SCHEMA_IDS.screenShareDisplay,
    {
      componentId: "component-fixture-screen-share",
      properties: {
        id: "screen-share",
        position: [3, 1, -2],
        rotation: [0, Math.PI / 2, 0],
      },
    },
  );
  assert(component !== null, "The fixture Component could not be created");
  const entity = created.scene.entities[created.entityId];
  return {
    scene: {
      ...created.scene,
      entities: {
        ...created.scene.entities,
        [created.entityId]: {
          ...entity,
          components: [...entity.components, component],
        },
      },
    },
    component,
  };
}

function entityIdHolding(scene: SceneDocument, componentId: string): string {
  const entry = Object.entries(scene.entities).find(([, entity]) =>
    entity.components.some((component) => component.id === componentId),
  );
  assert(entry !== undefined, `No Entity holds component ${componentId}`);
  return entry[0];
}

function vecEquals(left: Vec3, right: Vec3, tolerance = 1e-9): boolean {
  return left.every((entry, index) => Math.abs(entry - right[index]) <= tolerance);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`xrift component placement fixture: ${message}`);
}
