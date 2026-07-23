import { LiveVideoPlayer, Mirror, Portal, ScreenShareDisplay, SpawnPoint, VideoPlayer } from '@xrift/world-components'
import { RigidBody } from '@react-three/rapier'
import { useRef } from 'react'
import { Mesh } from 'three'
import { DracoSample } from './components/DracoSample'
import { Duck } from './components/Duck'
import { InteractableButton } from './components/InteractableButton'
import { RemoteUserHUDs } from './components/RemoteUserHUDs'
import { RotatingObject } from './components/RotatingObject'
import { SecretRoom } from './components/SecretRoom'
import { Skybox } from './components/Skybox'
import { TeleportPortal } from './components/TeleportPortal'
import { COLORS, WORLD_CONFIG } from './constants'

export interface WorldProps {
  position?: [number, number, number]
  scale?: number
}

export const World: React.FC<WorldProps> = ({ position = [0, 0, 0], scale = 1 }) => {
  const groundRef = useRef<Mesh>(null)
  const worldSize = WORLD_CONFIG.size * scale
  const wallHeight = WORLD_CONFIG.wallHeight * scale
  const wallThickness = WORLD_CONFIG.wallThickness * scale

  return (
    <group position={position} scale={scale}>

      {/* ========== 環境・照明 ========== */}
      <Skybox radius={500} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh ref={groundRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[worldSize, worldSize]} />
          <meshLambertMaterial color={COLORS.ground} />
        </mesh>
      </RigidBody>

      {/* ========== 壁 ========== */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[worldSize / 2, wallHeight / 2, 0]} castShadow>
          <boxGeometry args={[wallThickness, wallHeight, worldSize]} />
          <meshLambertMaterial color={COLORS.wall} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[-worldSize / 2, wallHeight / 2, 0]} castShadow>
          <boxGeometry args={[wallThickness, wallHeight, worldSize]} />
          <meshLambertMaterial color={COLORS.wall} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[0, wallHeight / 2, worldSize / 2]} castShadow>
          <boxGeometry args={[worldSize, wallHeight, wallThickness]} />
          <meshLambertMaterial color={COLORS.wall} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[0, wallHeight / 2, -worldSize / 2]} castShadow>
          <boxGeometry args={[worldSize, wallHeight, wallThickness]} />
          <meshLambertMaterial color={COLORS.wall} />
        </mesh>
      </RigidBody>

      {/* ========== 壁面メディア ========== */}
      <Mirror
        position={[0, 2.5 * scale, -19.5]}
        size={[4 * scale, 3 * scale]}
      />
      <VideoPlayer
        id='sample-video'
        position={[19.72, 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={4}
        url='https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
        playing
        volume={0}
      />
      <LiveVideoPlayer
        id='sample-live'
        position={[0, 2, 19.72]}
        rotation={[0, Math.PI, 0]}
        width={4}
        url='https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8'
        volume={0}
      />
      <ScreenShareDisplay
        id='screen-share-1'
        position={[-19.72, 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* ========== 装飾オブジェクト (中央エリア) ========== */}
      <RigidBody type="fixed" colliders="hull" restitution={0} friction={0}>
        <mesh position={[3 * scale, 1 * scale, 0]} castShadow>
          <boxGeometry args={[2 * scale, 2 * scale, 2 * scale]} />
          <meshLambertMaterial color={COLORS.decorations.box} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="hull" restitution={0} friction={0}>
        <mesh position={[-3 * scale, 0.5 * scale, 0]} castShadow>
          <cylinderGeometry args={[1 * scale, 1 * scale, 1 * scale]} />
          <meshLambertMaterial color={COLORS.decorations.cylinder} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="ball" restitution={0} friction={0}>

      </RigidBody>

      {/* ========== 段差・地形テスト (左奥エリア: x=-12, z=-8~-14) ========== */}
      {/* 0.1m */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[-12 * scale, 0.05 * scale, -8 * scale]} castShadow>
          <boxGeometry args={[2 * scale, 0.1 * scale, 1 * scale]} />
          <meshLambertMaterial color="#00FF00" />
        </mesh>
      </RigidBody>
      {/* 0.2m（設定上限） */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[-12 * scale, 0.1 * scale, -10 * scale]} castShadow>
          <boxGeometry args={[2 * scale, 0.2 * scale, 1 * scale]} />
          <meshLambertMaterial color="#FFFF00" />
        </mesh>
      </RigidBody>
      {/* 0.3m */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[-12 * scale, 0.15 * scale, -12 * scale]} castShadow>
          <boxGeometry args={[2 * scale, 0.3 * scale, 1 * scale]} />
          <meshLambertMaterial color="#FF8800" />
        </mesh>
      </RigidBody>
      {/* 0.5m */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>
        <mesh position={[-12 * scale, 0.25 * scale, -14 * scale]} castShadow>
          <boxGeometry args={[2 * scale, 0.5 * scale, 1 * scale]} />
          <meshLambertMaterial color="#FF0000" />
        </mesh>
      </RigidBody>
      {/* 階段 */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>

      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>

      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>

      </RigidBody>
      {/* 狭い隙間 */}
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>

      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid" restitution={0} friction={0}>

      </RigidBody>

      {/* ========== 3Dモデル・アニメーション (右奥エリア: x=10, z=-8) ========== */}
      <group position={[10, 0, -8]}>
        <RotatingObject
          radius={4}
          speed={1}
          height={2}
          scale={scale}
        />
      </group>
      <RigidBody type="dynamic" colliders="cuboid" restitution={0} friction={0}>
        <Duck position={[8, 0.5, -6]} scale={1} />
      </RigidBody>
      <RigidBody type="dynamic" colliders="cuboid" restitution={0} friction={0}>
        <DracoSample position={[12, 0.5, -6]} scale={10} />
      </RigidBody>

      {/* ========== インタラクション (左手前エリア: x=-8, z=-3) ========== */}
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

      {/* ========== ナビゲーション (手前中央エリア: z=6~8) ========== */}
      <group position={[0, 0, 8]}>
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

      {/* ========== ユーザー情報 ========== */}
      <RemoteUserHUDs />

      {/* ========== 隠し部屋 ========== */}
      <SecretRoom />
    </group>
  )
}
