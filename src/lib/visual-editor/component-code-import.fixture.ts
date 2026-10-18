import { XriftThreeLoader } from "../../../packages/xrift-studio-runtime/src/three/index";
import { compileVisualProject } from "./compiler/compile";
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
export async function runComponentCodeImportFixtureAssertions(): Promise<void> {
  const definitions = listXriftComponentDefinitions("world");
  assert(definitions.length === 16, "The official world catalog must contain 16 scene components including Item");

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

  const mappedPlan = analyzeComponentCode(
    `const HOUSES = [
  { x: -9, color: "#b45309" },
  { x: -3, color: "#2563eb" },
  { x: 3, color: "#16a34a" },
  { x: 9, color: "#dc2626" },
];
export function Street() {
  return (
    <group>
      {HOUSES.map((house, index) => (
        <mesh key={house.x} name={"House " + index} position={[house.x, 1, 0]}>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color={house.color} />
        </mesh>
      ))}
    </group>
  );
}`,
    "world",
  );
  const mappedHouses = mappedPlan.nodes.filter(
    (node) => node.kind === "primitive",
  );
  assert(
    !mappedPlan.diagnostics.some((diagnostic) => diagnostic.severity === "error") &&
      mappedPlan.summary.entityCount === 5 &&
      mappedPlan.summary.primitiveCount === 4 &&
      mappedPlan.diagnostics.some(
        (diagnostic) => diagnostic.code === "static-map-expanded",
      ) &&
      mappedHouses.map((node) => node.name).join(",") ===
        "House 0,House 1,House 2,House 3" &&
      mappedHouses.map((node) => node.transform.position[0]).join(",") ===
        "-9,-3,3,9" &&
      mappedHouses.map((node) => node.material?.color).join(",") ===
        "#b45309,#2563eb,#16a34a,#dc2626",
    "A static .map() over a const array must expand into one Entity per item with substituted values",
  );

  const inlineMappedPlan = analyzeComponentCode(
    `export function Row() {
  return (
    <group>
      {Array.from({ length: 3 }, (_, i) => (
        <mesh key={i} position={[i * 4, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </group>
  );
}`,
    "world",
  );
  const inlineMapped = inlineMappedPlan.nodes.filter(
    (node) => node.kind === "primitive",
  );
  assert(
    inlineMappedPlan.summary.primitiveCount === 3 &&
      inlineMapped.map((node) => node.transform.position[0]).join(",") ===
        "0,4,8",
    "Array.from({ length }) with index arithmetic must expand into placed Entities",
  );

  const nestedMappedPlan = analyzeComponentCode(
    `const HOUSES = [
  { x: 0, windows: [-0.5, 0.5] },
  { x: 5, windows: [0] },
];
export function Street() {
  return (
    <group>
      {HOUSES.map((house) => (
        <group key={house.x} position={[house.x, 0, 0]}>
          {house.windows.map((offset) => (
            <mesh key={offset} position={[offset, 1, 0]}>
              <boxGeometry args={[0.4, 0.6, 0.1]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}`,
    "world",
  );
  const nestedWindows = nestedMappedPlan.nodes.filter(
    (node) => node.kind === "primitive",
  );
  assert(
    nestedMappedPlan.summary.primitiveCount === 3 &&
      nestedWindows.map((node) => node.transform.position[0]).join(",") ===
        "-0.5,0.5,0",
    "A nested .map() over an item member must expand after the outer expansion",
  );

  const dynamicMappedPlan = analyzeComponentCode(
    `export function Street(props: { xs: number[] }) {
  return (
    <group>
      {props.xs.map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </group>
  );
}`,
    "world",
  );
  assert(
    !dynamicMappedPlan.diagnostics.some(
      (diagnostic) => diagnostic.code === "static-map-expanded",
    ) && dynamicMappedPlan.summary.primitiveCount === 1,
    "A .map() over unknown data must stay a single unexpanded template node",
  );

  const extrudePlan = analyzeComponentCode(
    `import * as THREE from "three";
const roofShape = new THREE.Shape();
roofShape.moveTo(-2, 0);
roofShape.lineTo(2, 0);
roofShape.lineTo(0, 1.5);
roofShape.closePath();
export function House() {
  return (
    <group>
      <mesh name="Roof" position={[0, 2, 0]}>
        <extrudeGeometry args={[roofShape, { depth: 3, bevelEnabled: false }]} />
        <meshStandardMaterial color="#7f1d1d" />
      </mesh>
    </group>
  );
}`,
    "world",
  );
  const roofNode = extrudePlan.nodes.find((node) => node.name === "Roof");
  assert(
    !extrudePlan.diagnostics.some((diagnostic) => diagnostic.severity === "error") &&
      roofNode?.kind === "primitive" &&
      roofNode.extrude?.depth === 3 &&
      JSON.stringify(roofNode.extrude?.points) === "[[-2,0],[2,0],[0,1.5]]" &&
      roofNode.material?.color === "#7f1d1d" &&
      extrudePlan.diagnostics.some(
        (diagnostic) => diagnostic.code === "extrude-geometry-converted",
      ),
    "A static THREE.Shape extrude must convert into an authored extrude node",
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

  const extrudeApplied = applyComponentCodeImportPlan({
    scene: project.scene,
    assets: project.assets,
    projectKind: "world",
    plan: extrudePlan,
  });
  const roofEntity = extrudeApplied.entityIds
    .map((entityId) => extrudeApplied.scene.entities[entityId])
    .find((entity) => entity.name === "Roof");
  const roofMesh = roofEntity?.components.find(
    (component) => component.type === "mesh",
  );
  assert(
    roofMesh?.type === "mesh" &&
      roofMesh.geometry?.kind === "extrude" &&
      roofMesh.geometry.extrude.depth === 3 &&
      JSON.stringify(roofMesh.geometry.extrude.points) ===
        "[[-2,0],[2,0],[0,1.5]]" &&
      roofMesh.materialBindings[0]?.materialAssetId !== undefined,
    "Applying an extrude plan must create an extrude Mesh component with its material",
  );

  const extrudeCompilation = compileVisualProject({
    project: project.project,
    scenes: { [extrudeApplied.scene.sceneId]: extrudeApplied.scene },
    assets: extrudeApplied.assets,
    prefabs: project.prefabs,
  });
  const extrudeRuntimeCompilation = compileVisualProject(
    {
      project: project.project,
      scenes: { [extrudeApplied.scene.sceneId]: extrudeApplied.scene },
      assets: extrudeApplied.assets,
      prefabs: project.prefabs,
    },
    { outputMode: "classic-runtime" },
  );
  const extrudeWorldSource =
    extrudeCompilation.overlayFiles.find(
      (file) => file.relativePath === "src/World.tsx",
    )?.content ?? "";
  assert(
    extrudeWorldSource.includes("<XriftExtrudeGeometry") &&
      extrudeWorldSource.includes("XRIFT_EXTRUDE_DATA"),
    "Publishing an extruded Mesh must emit the shared extrude renderer and its data",
  );
  const extrudeRuntimeFile = extrudeRuntimeCompilation.runtimeManifestFile;
  assert(extrudeRuntimeFile, "classic-runtime output must include the manifest");
  const extrudeRuntime = JSON.parse(extrudeRuntimeFile.content) as {
    scenes: Record<
      string,
      {
        entities: Record<
          string,
          {
            components: {
              type: string;
              geometry?: { kind: string; depth?: number; points?: unknown };
            }[];
          }
        >;
      }
    >;
  };
  const runtimeRoofGeometry = Object.values(extrudeRuntime.scenes)
    .flatMap((scene) => Object.values(scene.entities))
    .flatMap((entity) => entity.components)
    .find((component) => component.geometry?.kind === "extrude")?.geometry;
  assert(
    runtimeRoofGeometry?.depth === 3 &&
      JSON.stringify(runtimeRoofGeometry.points) === "[[-2,0],[2,0],[0,1.5]]",
    "The Runtime manifest must carry the same extrude profile as the Scene",
  );
  const loadedExtrude = await new XriftThreeLoader().parse(extrudeRuntime);
  const loadedGeometries: string[] = [];
  for (const object of loadedExtrude.entities.values()) {
    object.traverse((child) => {
      const geometry = (child as { geometry?: { type?: string } }).geometry;
      if (geometry?.type) loadedGeometries.push(geometry.type);
    });
  }
  assert(
    loadedGeometries.includes("ExtrudeGeometry"),
    "The Runtime loader must build a real ExtrudeGeometry from the manifest",
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
    officialPlan.summary.entityCount === 17 &&
      officialPlan.summary.primitiveCount === 6 &&
      officialPlan.summary.lightCount === 2 &&
      officialPlan.summary.textCount === 0 &&
      officialPlan.summary.rigidBodyCount === 5 &&
      officialPlan.summary.colliderCount === 0 &&
      officialPlan.summary.modelAssetCount === 0 &&
      officialPlan.summary.textureAssetCount === 1 &&
      officialPlan.summary.unsupportedAssetCount === 0 &&
      officialPlan.summary.xriftComponentCount === 1 &&
      officialPlan.summary.moduleCount === 2 &&
      officialPlan.summary.localComponentCount === 1,
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
      "public/tokyo-station.jpg" &&
      !officialPlan.nodes.some((node) => node.kind === "model" || node.kind === "text"),
    "The official starter must retain the panorama and omit removed showcase assets",
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
    ).length === 2,
    "R3F lights were not materialized as Visual Light components",
  );
  assert(
    officialEntities.filter((entity) =>
      entity.components.some((component) => component.type === "rigid-body"),
    ).length === 5,
    "Rapier bodies were not materialized as parent Rigid Body components",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
