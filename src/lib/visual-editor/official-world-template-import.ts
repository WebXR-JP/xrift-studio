import {
  analyzeComponentProject,
  type ComponentCodeImportPlan,
  type ComponentCodeImportSourceModule,
} from "./component-code-import";

/** Pinned public template; numeric constants are inlined for the static importer. */
export const OFFICIAL_XRIFT_WORLD_TEMPLATE_COMMIT =
  "05abcf6a11844f9108363dc6823a1908569452ac";
export const OFFICIAL_XRIFT_WORLD_TEMPLATE_SOURCE_URL =
  `https://github.com/WebXR-JP/xrift-world-template/blob/${OFFICIAL_XRIFT_WORLD_TEMPLATE_COMMIT}/src/World.tsx`;
export const OFFICIAL_XRIFT_WORLD_TEMPLATE_IMPORT_SOURCE = `import { SpawnPoint } from '@xrift/world-components'
import { RigidBody } from '@react-three/rapier'
import { Skybox } from './components/Skybox'

export function World() {
  return (
    <group name="World">
      <Skybox radius={500} />
      <ambientLight name="Environment Light" intensity={0.3} />
      <directionalLight
        name="Main Light"
        position={[5, 10, 5]}
        intensity={1.5}
        castShadow
      />
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="Ground" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshLambertMaterial color="#90EE90" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="East Wall" position={[20, 2.5, 0]} castShadow>
          <boxGeometry args={[0.5, 5, 40]} />
          <meshLambertMaterial color="#8B4513" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="West Wall" position={[-20, 2.5, 0]} castShadow>
          <boxGeometry args={[0.5, 5, 40]} />
          <meshLambertMaterial color="#8B4513" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="South Wall" position={[0, 2.5, 20]} castShadow>
          <boxGeometry args={[40, 5, 0.5]} />
          <meshLambertMaterial color="#8B4513" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="North Wall" position={[0, 2.5, -20]} castShadow>
          <boxGeometry args={[40, 5, 0.5]} />
          <meshLambertMaterial color="#8B4513" />
        </mesh>
      </RigidBody>
      <group name="Spawn Area" position={[0, 0, 8]}>
        <SpawnPoint />
      </group>
    </group>
  )
}`;

export const OFFICIAL_XRIFT_WORLD_TEMPLATE_MODULES: readonly ComponentCodeImportSourceModule[] = [
  {
    path: "src/World.tsx",
    source: OFFICIAL_XRIFT_WORLD_TEMPLATE_IMPORT_SOURCE,
  },
  {
    path: "src/components/Skybox/index.tsx",
    source: `export function Skybox() {
  return (
    <mesh name="Tokyo Station Skybox">
      <sphereGeometry args={[500, 60, 40]} />
      <meshBasicMaterial color="#ffffff" map="tokyo-station.jpg" />
    </mesh>
  )
}`,
  },
];

export function analyzeOfficialXriftWorldTemplate(): ComponentCodeImportPlan {
  return analyzeComponentProject({
    entryFile: "src/World.tsx",
    modules: [...OFFICIAL_XRIFT_WORLD_TEMPLATE_MODULES],
    projectKind: "world",
  });
}
