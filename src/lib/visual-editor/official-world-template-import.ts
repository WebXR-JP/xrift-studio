import {
  analyzeComponentProject,
  type ComponentCodeImportPlan,
  type ComponentCodeImportSourceModule,
} from "./component-code-import";

/**
 * Source snapshot used to keep the Visual starter tied to the public XRift
 * Classic template instead of maintaining an unrelated hand-authored sample.
 */
export const OFFICIAL_XRIFT_WORLD_TEMPLATE_COMMIT =
  "abbce026ea1f1066726f385089d5f28b2ef5a890";
export const OFFICIAL_XRIFT_WORLD_TEMPLATE_SOURCE_URL =
  `https://github.com/WebXR-JP/xrift-world-template/blob/${OFFICIAL_XRIFT_WORLD_TEMPLATE_COMMIT}/src/World.tsx`;
export const OFFICIAL_XRIFT_WORLD_TEMPLATE_THUMBNAIL =
  "/visual-editor/starter-assets/xrift-world-template-thumbnail.png";

/**
 * The static, supported portion of the official source graph at the commit above.
 * Values derived from the component's default `scale=1` and WORLD_CONFIG are
 * resolved to literals. The converter never evaluates the pasted program.
 */
export const OFFICIAL_XRIFT_WORLD_TEMPLATE_IMPORT_SOURCE = `import {
  LiveVideoPlayer,
  Mirror,
  Portal,
  ScreenShareDisplay,
  SpawnPoint,
  VideoPlayer,
} from '@xrift/world-components'
import { RigidBody } from '@react-three/rapier'
import { DracoSample } from './components/DracoSample'
import { Duck } from './components/Duck'
import { InteractableButton } from './components/InteractableButton'
import { RemoteUserHUDs } from './components/RemoteUserHUDs'
import { RotatingObject } from './components/RotatingObject'
import { SecretRoom } from './components/SecretRoom'
import { Skybox } from './components/Skybox'
import { TeleportPortal } from './components/TeleportPortal'

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

      <Mirror position={[0, 2.5, -19.5]} size={[4, 3]} />
      <VideoPlayer
        id="sample-video"
        position={[19.72, 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={4}
        url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
        playing
        volume={0}
      />
      <LiveVideoPlayer
        id="sample-live"
        position={[0, 2, 19.72]}
        rotation={[0, Math.PI, 0]}
        width={4}
        url="https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8"
        volume={0}
      />
      <ScreenShareDisplay
        id="screen-share-1"
        position={[-19.72, 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />

      <RigidBody type="fixed" colliders="hull" restitution={0} friction={0}>
        <mesh name="Yellow Box" position={[3, 1, 0]} castShadow>
          <boxGeometry args={[2, 2, 2]} />
          <meshLambertMaterial color="#FFFF00" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="hull" restitution={0} friction={0}>
        <mesh name="Blue Cylinder" position={[-3, 0.5, 0]} castShadow>
          <cylinderGeometry args={[1, 1, 1]} />
          <meshLambertMaterial color="#4169E1" />
        </mesh>
      </RigidBody>

      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="Step 0.1m" position={[-12, 0.05, -8]} castShadow>
          <boxGeometry args={[2, 0.1, 1]} />
          <meshLambertMaterial color="#00FF00" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="Step 0.2m" position={[-12, 0.1, -10]} castShadow>
          <boxGeometry args={[2, 0.2, 1]} />
          <meshLambertMaterial color="#FFFF00" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="Step 0.3m" position={[-12, 0.15, -12]} castShadow>
          <boxGeometry args={[2, 0.3, 1]} />
          <meshLambertMaterial color="#FF8800" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh name="Step 0.5m" position={[-12, 0.25, -14]} castShadow>
          <boxGeometry args={[2, 0.5, 1]} />
          <meshLambertMaterial color="#FF0000" />
        </mesh>
      </RigidBody>

      <group name="Rotating Object Area" position={[10, 0, -8]}>
        <RotatingObject radius={4} speed={1} height={2} scale={1} />
      </group>
      <RigidBody name="Duck RigidBody" type="dynamic" colliders="cuboid" restitution={0} friction={0}>
        <Duck position={[8, 0.5, -6]} scale={1} />
      </RigidBody>
      <RigidBody name="Draco RigidBody" type="dynamic" colliders="cuboid" restitution={0} friction={0}>
        <DracoSample position={[12, 0.5, -6]} scale={10} />
      </RigidBody>

      <InteractableButton
        position={[-8, 1, -3]}
        id="sample-button-1"
        label="ローカル"
        interactionText="ボタンをクリック"
        useGlobalState={false}
      />
      <InteractableButton
        position={[-5.5, 1, -3]}
        id="sample-button-2"
        label="グローバル"
        interactionText="カウントアップ"
        useGlobalState={true}
      />

      <group name="Spawn Area" position={[0, 0, 8]}>
        <SpawnPoint />
      </group>
      <TeleportPortal
        position={[3, 0, 6]}
        destination={[0, 0.5, 52]}
        yaw={0}
        label="隠し部屋へ"
        color="#8B5CF6"
      />
      <Portal
        instanceId="e1f2ba87-fb50-406e-9527-2334cf75cd4c"
        position={[-3, 0, 6]}
      />
      <RemoteUserHUDs />
      <SecretRoom />
    </group>
  )
}`;

/**
 * Static module snapshots keep the same import graph and component boundaries
 * as the official template. Runtime hooks, remote-user collections and binary
 * model/texture loading is represented by static source references so Studio
 * can import the bytes separately without executing Classic application code.
 */
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
  {
    path: "src/components/RotatingObject/index.tsx",
    source: `export function RotatingObject() {
  return (
    <group name="Rotating Object Orbit">
      <group name="Rotating Object Position" position={[4, 2, 0]}>
        <mesh name="Rotating Octahedron" castShadow>
          <octahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#00ffff" emissive="#00ffff" metalness={0.8} roughness={0.2} />
        </mesh>
        <pointLight name="Rotating Object Light" color="#00ffff" intensity={2} distance={10} decay={2} />
      </group>
    </group>
  )
}`,
  },
  {
    path: "src/components/Duck/index.tsx",
    source: `import { Gltf } from '@react-three/drei'
export function Duck() {
  return <Gltf name="Duck Model" src="duck.glb" castShadow receiveShadow />
}`,
  },
  {
    path: "src/components/DracoSample/index.tsx",
    source: `export function DracoSample() {
  return (
    <mesh name="Draco Sample" castShadow receiveShadow>
      <primitive name="Draco Geometry" object="bunny.drc" attach="geometry" />
      <meshStandardMaterial color="#c084fc" roughness={0.4} metalness={0.2} />
    </mesh>
  )
}`,
  },
  {
    path: "src/components/InteractableButton/index.tsx",
    source: `import { RigidBody } from '@react-three/rapier'
import { Interactable } from '@xrift/world-components'
import { Text } from '@react-three/drei'
export function InteractableButton() {
  return (
    <group name="Interactable Button">
      <Interactable interactionText="ボタンを押す">
        <RigidBody type="fixed" colliders="cuboid">
          <mesh name="Button Mesh" castShadow>
            <boxGeometry args={[1, 0.3, 1]} />
            <meshStandardMaterial color="#4a9eff" roughness={0.3} metalness={0.5} />
          </mesh>
        </RigidBody>
      </Interactable>
      <Text name="Click Count" position={[0, 0.5, 0]} fontSize={0.12} color="#ffeb3b">0回クリック</Text>
      <Text name="Button Label" position={[0, 0, 0.51]} fontSize={0.15} color="#ffffff">ボタン</Text>
    </group>
  )
}`,
  },
  {
    path: "src/components/TeleportPortal/index.tsx",
    source: `import { RigidBody } from '@react-three/rapier'
import { Text } from '@react-three/drei'
export function TeleportPortal() {
  return (
    <group name="Teleport Portal">
      <RigidBody name="Teleport Sensor" type="fixed" sensor>
        <mesh name="Teleport Sensor Mesh" position={[0, 0.5, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 1, 32]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </RigidBody>
      <mesh name="Portal Disc" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.2, 32]} />
        <meshStandardMaterial color="#8B5CF6" transparent opacity={0.7} />
      </mesh>
      <mesh name="Portal Ring" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <torusGeometry args={[1.1, 0.06, 8, 32]} />
        <meshStandardMaterial color="#8B5CF6" />
      </mesh>
      <Text name="Portal Label" position={[0, 1.2, 0]} fontSize={0.3} color="#ffffff" outlineWidth={0.02} outlineColor="#000000">テレポート</Text>
    </group>
  )
}`,
  },
  {
    path: "src/components/RemoteUserHUDs/index.tsx",
    source: `import { Billboard } from '@react-three/drei'
export function RemoteUserHUDs() {
  return (
    <group name="Remote User HUDs (runtime collection)">
      <Billboard name="HP Bar Preview">
        <mesh name="HP Bar Border" position={[0, 0, -0.01]}>
          <planeGeometry args={[0.62, 0.1]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        <mesh name="HP Bar Background">
          <planeGeometry args={[0.6, 0.08]} />
          <meshBasicMaterial color="#333333" />
        </mesh>
        <mesh name="HP Bar Value" position={[0, 0, 0.01]}>
          <planeGeometry args={[0.6, 0.08]} />
          <meshBasicMaterial color="#00ff00" />
        </mesh>
      </Billboard>
    </group>
  )
}`,
  },
  {
    path: "src/components/SecretRoom/index.tsx",
    source: `import { RigidBody } from '@react-three/rapier'
import { TeleportPortal } from '../TeleportPortal'
export function SecretRoom() {
  return (
    <group name="Secret Room">
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="Secret Room Floor" position={[0, 0, 50]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 16]} /><meshLambertMaterial color="#16213e" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="Secret Room Ceiling" position={[0, 5, 50]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[20, 16]} /><meshLambertMaterial color="#1a1a2e" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="Secret Room Back Wall" position={[0, 2.5, 42]}><boxGeometry args={[20, 5, 0.3]} /><meshLambertMaterial color="#1a1a2e" /></mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="Secret Room Front Wall" position={[0, 2.5, 58]}><boxGeometry args={[20, 5, 0.3]} /><meshLambertMaterial color="#1a1a2e" /></mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="Secret Room Left Wall" position={[-10, 2.5, 50]}><boxGeometry args={[0.3, 5, 16]} /><meshLambertMaterial color="#1a1a2e" /></mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="Secret Room Right Wall" position={[10, 2.5, 50]}><boxGeometry args={[0.3, 5, 16]} /><meshLambertMaterial color="#1a1a2e" /></mesh>
      </RigidBody>
      <pointLight name="Secret Room Accent Light" position={[0, 4.5, 50]} intensity={15} color="#e94560" distance={24} />
      <pointLight name="Secret Room Fill Light" position={[0, 1, 50]} intensity={8} color="#ffffff" distance={16} />
      <mesh name="Secret Room Cube" position={[0, 2, 50]} castShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} /><meshStandardMaterial color="#e94560" metalness={0.8} roughness={0.2} />
      </mesh>
      <TeleportPortal name="Return Portal" position={[0, 0, 47.5]} />
    </group>
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
