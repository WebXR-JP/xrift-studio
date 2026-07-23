import { listXriftComponentDefinitions } from "./component-registry";
import {
  DREI_R3F_IMPORT_SAMPLE,
  analyzeComponentCode,
  analyzeComponentProject,
  applyComponentCodeImportPlan,
  createOfficialXriftComponentSample,
} from "./component-code-import";
import { createPrototypeProject } from "./prototype-project";
import { analyzeOfficialXriftWorldTemplate } from "./official-world-template-import";

/** Pure assertions for official XRift samples and the safe Drei/R3F adapter. */
export function runComponentCodeImportFixtureAssertions(): void {
  const definitions = listXriftComponentDefinitions("world");
  assert(definitions.length === 15, "The official world catalog must contain 15 scene components");

  for (const definition of definitions) {
    const plan = analyzeComponentCode(
      createOfficialXriftComponentSample(definition.importName),
      "world",
    );
    assert(
      !plan.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      `${definition.importName} sample must be importable`,
    );
    assert(
      plan.summary.entityCount >= 1 &&
        plan.summary.xriftComponentCount === 1 &&
        plan.nodes.some(
          (node) =>
            node.xriftComponents[0]?.schemaId === definition.schemaId,
        ),
      `${definition.importName} sample must preserve its official schema`,
    );
    const componentNode = plan.nodes.find(
      (node) => node.xriftComponents[0]?.schemaId === definition.schemaId,
    );
    if (definition.attachBehavior.kind === "wrapper") {
      assert(
        componentNode !== undefined &&
          plan.nodes.some(
            (node) => node.parentPlanNodeId === componentNode.planNodeId,
          ),
        `${definition.importName} wrapper must remain the parent of its JSX child`,
      );
    }
  }

  const dreiPlan = analyzeComponentCode(DREI_R3F_IMPORT_SAMPLE, "world");
  assert(
    !dreiPlan.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    "The bundled Drei/R3F sample must convert without errors",
  );
  assert(
    dreiPlan.summary.entityCount === 5 &&
      dreiPlan.summary.primitiveCount === 1 &&
      dreiPlan.summary.xriftComponentCount === 3,
    "Drei root group, Sky, Billboard/Box, and Reflector must map to the expected scene nodes",
  );
  const billboardNode = dreiPlan.nodes.find((node) => node.name === "BillboardY");
  const billboardBoxNode = dreiPlan.nodes.find((node) => node.kind === "primitive");
  assert(
    billboardNode !== undefined &&
      billboardBoxNode?.parentPlanNodeId === billboardNode.planNodeId,
    "Drei wrapper hierarchy must be represented in the import plan",
  );

  const modulePlan = analyzeComponentProject({
    entryFile: "src/World.tsx",
    projectKind: "world",
    modules: [
      {
        path: "src/World.tsx",
        source: `import { Room } from './components/Room'
import Decor from './components/Decor'
export function World() {
  return <group name="World"><Room position={[2, 0, 0]} /><Decor /></group>
}`,
      },
      {
        path: "src/components/Room.tsx",
        source: `import { Interactable } from '@xrift/world-components'
export const Room = () => {
  return (
    <group name="Room Group">
      <Interactable id="room-button" interactionText="押す">
        <mesh name="Button"><boxGeometry args={[1, 0.25, 0.5]} /></mesh>
      </Interactable>
    </group>
  )
}`,
      },
      {
        path: "src/components/Decor/index.tsx",
        source: `export default function Decor() {
  return <mesh name="Decor Mesh"><sphereGeometry args={[0.5, 16, 8]} /></mesh>
}`,
      },
    ],
  });
  const roomBoundary = modulePlan.nodes.find(
    (node) => node.localComponent && node.name === "Room",
  );
  const roomGroup = modulePlan.nodes.find((node) => node.name === "Room Group");
  const interactable = modulePlan.nodes.find(
    (node) => node.xriftComponents[0]?.sourceName === "Interactable",
  );
  const roomButton = modulePlan.nodes.find((node) => node.name === "Button");
  const decorBoundary = modulePlan.nodes.find(
    (node) => node.localComponent && node.name === "Decor",
  );
  const decorMesh = modulePlan.nodes.find((node) => node.name === "Decor Mesh");
  assert(
    modulePlan.summary.moduleCount === 3 &&
      modulePlan.summary.localComponentCount === 2 &&
      roomBoundary !== undefined &&
      roomGroup?.parentPlanNodeId === roomBoundary.planNodeId &&
      interactable?.parentPlanNodeId === roomGroup.planNodeId &&
      roomButton?.parentPlanNodeId === interactable.planNodeId &&
      roomButton?.sourcePath === "src/components/Room.tsx" &&
      decorBoundary !== undefined &&
      decorMesh?.parentPlanNodeId === decorBoundary.planNodeId,
    "Named and default local TSX modules must expand beneath their invocation boundary without flattening",
  );

  const rigidBodyPlan = analyzeComponentCode(
    `import { RigidBody } from '@react-three/rapier'
export function PhysicsTree() {
  return (
    <RigidBody name="Physics Root" type="dynamic" colliders={false} ccd>
      <group name="Collider Offset" position={[2, 0, 0]}>
        <mesh name="Visible Box"><boxGeometry args={[1, 2, 3]} /></mesh>
      </group>
    </RigidBody>
  )
}`,
    "world",
  );
  const rigidBodyNode = rigidBodyPlan.nodes.find(
    (node) => node.name === "Physics Root",
  );
  assert(
    rigidBodyPlan.summary.rigidBodyCount === 1 &&
      rigidBodyPlan.summary.colliderCount === 0 &&
      rigidBodyNode?.rigidBody?.sourceBodyType === "dynamic" &&
      rigidBodyNode.rigidBody.autoColliders === "none" &&
      rigidBodyNode.rigidBody.ccd &&
      rigidBodyPlan.nodes.some(
        (node) =>
          node.name === "Collider Offset" &&
          node.parentPlanNodeId === rigidBodyNode.planNodeId,
      ),
    "RigidBody must remain a parent component and preserve its descendant transform hierarchy",
  );

  const project = createPrototypeProject("world", "component-import-fixture");
  const entityCountBefore = Object.keys(project.scene.entities).length;
  const applied = applyComponentCodeImportPlan({
    scene: project.scene,
    assets: project.assets,
    projectKind: "world",
    plan: dreiPlan,
  });
  assert(
    applied.entityIds.length === 5 &&
      Object.keys(applied.scene.entities).length === entityCountBefore + 5,
    "Applying a valid plan must create every converted entity atomically",
  );
  const appliedBillboard = applied.entityIds
    .map((entityId) => applied.scene.entities[entityId])
    .find((entity) => entity.name === "BillboardY");
  assert(
    appliedBillboard !== undefined &&
      appliedBillboard.children.some(
        (childId) => applied.scene.entities[childId]?.components.some(
          (component) => component.type === "mesh",
        ),
      ),
    "Applying a plan must preserve wrapper-child Scene hierarchy",
  );
  assert(
    !applied.diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    "Applying the bundled conversion must not produce errors",
  );

  const appliedRigidBody = applyComponentCodeImportPlan({
    scene: project.scene,
    assets: project.assets,
    projectKind: "world",
    plan: rigidBodyPlan,
  });
  const appliedBodyEntity = appliedRigidBody.entityIds
    .map((entityId) => appliedRigidBody.scene.entities[entityId])
    .find((entity) => entity.name === "Physics Root");
  assert(
    appliedBodyEntity?.components.some(
      (component) =>
        component.type === "rigid-body" &&
        component.bodyType === "dynamic" &&
        component.autoColliders === "none",
    ) &&
      !appliedBodyEntity.components.some(
        (component) => component.type === "collider",
      ),
    "Applying a RigidBody import must not synthesize an origin Box Collider",
  );

  const rejected = applyComponentCodeImportPlan({
    scene: project.scene,
    assets: project.assets,
    projectKind: "world",
    plan: {
      ...dreiPlan,
      diagnostics: [
        ...dreiPlan.diagnostics,
        {
          severity: "error",
          code: "fixture-error",
          message: "fixture rejection",
        },
      ],
    },
  });
  assert(
    rejected.scene === project.scene &&
      rejected.assets === project.assets &&
      rejected.entityIds.length === 0,
    "A plan with errors must leave the scene and asset manifest unchanged",
  );

  const officialPlan = analyzeOfficialXriftWorldTemplate();
  assert(
    !officialPlan.diagnostics.some(
      (diagnostic) => diagnostic.severity === "error",
    ),
    "The official XRift World snapshot must convert without errors",
  );
  assert(
    officialPlan.summary.entityCount === 97 &&
      officialPlan.summary.primitiveCount === 26 &&
      officialPlan.summary.lightCount === 5 &&
      officialPlan.summary.textCount === 6 &&
      officialPlan.summary.rigidBodyCount === 23 &&
      officialPlan.summary.colliderCount === 0 &&
      officialPlan.summary.modelAssetCount === 2 &&
      officialPlan.summary.textureAssetCount === 1 &&
      officialPlan.summary.unsupportedAssetCount === 0 &&
      officialPlan.summary.xriftComponentCount === 9 &&
      officialPlan.summary.moduleCount === 9 &&
      officialPlan.summary.localComponentCount === 10,
    `The official World conversion coverage changed unexpectedly: ${JSON.stringify(officialPlan.summary)}`,
  );
  const officialRoot = officialPlan.nodes.find(
    (node) => node.parentPlanNodeId === null,
  );
  assert(
    officialRoot?.name === "World" &&
      officialPlan.nodes
        .filter((node) => node !== officialRoot)
        .every((node) => node.parentPlanNodeId !== null),
    "The official World plan must retain its JSX root and nested hierarchy",
  );
  assert(
    officialPlan.assetDependencies.map((dependency) => dependency.sourcePath).join(",") ===
      "public/bunny.drc,public/duck.glb,public/tokyo-station.jpg" &&
      officialPlan.nodes.some(
        (node) => node.kind === "model" && node.model?.sourcePath === "public/duck.glb",
      ) &&
      officialPlan.nodes.filter((node) => node.kind === "text").every(
        (node) => node.text?.text.trim(),
      ),
    "Multi-module official Model, panorama, Draco, and Text dependencies must remain attached to their Scene nodes",
  );
  const officialApplied = applyComponentCodeImportPlan({
    scene: project.scene,
    assets: project.assets,
    projectKind: "world",
    plan: officialPlan,
  });
  const officialEntities = officialApplied.entityIds.map(
    (entityId) => officialApplied.scene.entities[entityId],
  );
  assert(
    officialEntities.filter((entity) =>
      entity.components.some((component) => component.type === "light"),
    ).length === 5,
    "R3F lights were not materialized as Visual Light components",
  );
  assert(
    officialEntities.filter((entity) =>
      entity.components.some((component) => component.type === "rigid-body"),
    ).length === 23,
    "Rapier bodies were not materialized as parent Rigid Body components",
  );
  assert(
    officialEntities.filter((entity) =>
      entity.components.some(
        (component) =>
          component.type === "rigid-body" && component.bodyType === "dynamic",
      ),
    ).length >= 2,
    "Dynamic Rapier body types were not retained by the Visual conversion",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
