import { Clone, useAnimations } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { StrictMode, Suspense, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { StableModelClone } from "../../packages/xrift-studio-runtime/src/stable-model-clone";
import { XriftMToonMaterial } from "../../packages/xrift-studio-runtime/src/mtoon-material";
import { MTOON_DEFAULTS } from "../../packages/xrift-studio-runtime/src/mtoon-contract";

// Self-contained skin fixture: no production assets, World, or user data.
function makeModel() {
  const model = new THREE.Group();
  const rig = new THREE.Group(); rig.name = "LegRig"; model.add(rig);
  const hip = new THREE.Bone(); hip.name = "Hip"; rig.add(hip);
  const knee = new THREE.Bone(); knee.name = "Knee"; knee.position.y = 0.5; hip.add(knee);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-.3, 0, 0, .3, 0, 0, 0, .8, 0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0,0,0,0, 0,0,0,0, 1,0,0,0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0], 4));
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0,0,0, 0,0,0, .2,0,0], 3)];
  geometry.morphTargetsRelative = true; geometry.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ color: "#7890a0" }));
  mesh.name = "BodyMesh"; mesh.morphTargetDictionary = { Gesture: 0 }; mesh.morphTargetInfluences = [0]; model.add(mesh);
  model.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton([hip, knee]));
  // Match compiler pose overrides: apply them after establishing the bind pose.
  hip.rotation.z = .25; mesh.morphTargetInfluences[0] = .25;
  const clip = new THREE.AnimationClip("Gesture", 2, [new THREE.NumberKeyframeTrack("BodyMesh.morphTargetInfluences[0]", [0, 2], [0, 1])]);
  return { model, clip };
}
const materialProperties = {
  pbrMetallicRoughness: { baseColorFactor: [.4,.6,.7,1] as [number,number,number,number] },
  emissiveFactor: [0,0,0] as [number,number,number], alphaMode: "OPAQUE" as const,
  alphaCutoff: .5, doubleSided: true,
  extensions: { VRMC_materials_mtoon: { ...MTOON_DEFAULTS, outlineWidthMode: "worldCoordinates" as const, outlineWidthFactor: .01 } },
};
const inject = (object: THREE.Object3D) => (object as THREE.Mesh).isMesh
  ? <XriftMToonMaterial key="material" properties={materialProperties} /> : null;

type ActorSnapshot = { tick: number; modelRevision: number; rigCount: number; hipParent: string | null; hipAngle: number; bones: THREE.Bone[]; skeleton: THREE.Skeleton;
  morph: number; morphArray: number[]; mtoon: boolean; outline: boolean; outlineShared: boolean; castShadow: boolean; receiveShadow: boolean; mesh: THREE.SkinnedMesh; root: THREE.Group };
export type StableCloneFixtureControl = { tick: () => void; pause: (id: number) => void; removeFirst: () => void; swapFirst: () => void; actors: Record<number, ActorSnapshot>; mixers: Record<number, THREE.AnimationMixer>; fallbackMounts: number; staticFound: boolean; unmountedActors: number[]; previousBones?: THREE.Bone[]; previousSkeleton?: THREE.Skeleton; otherSkeleton?: THREE.Skeleton };
type Control = StableCloneFixtureControl;
declare global { interface Window { __STABLE_CLONE_FIXTURE__?: Control } }

function Actor({ model, clip, index, tick, controls, animate = true, modelRevision = 0, legacy = false }: { model: THREE.Group; clip: THREE.AnimationClip; index: number; tick: number; controls: Control; animate?: boolean; modelRevision?: number; legacy?: boolean }) {
  const group = useRef<THREE.Group>(null), { mixer, actions } = useAnimations([clip], group);
  controls.mixers[index] = mixer;
  useEffect(() => { const action = actions.Gesture; if (animate) action?.play(); return () => { action?.stop(); }; }, [actions, animate]);
  useEffect(() => () => { controls.unmountedActors.push(index); }, [controls, index]);
  useFrame(() => {
    const root = group.current, rig = root?.getObjectByName("LegRig"), mesh = root?.getObjectByName("BodyMesh") as THREE.SkinnedMesh | undefined;
    if (!root || !rig || !mesh?.skeleton || !mesh.morphTargetInfluences) return;
    const bones: THREE.Bone[] = []; root.traverse(object => { if ((object as THREE.Bone).isBone) bones.push(object as THREE.Bone); });
    const outline = mesh.children.find(child => child.userData.xriftMToonOutline) as THREE.SkinnedMesh | undefined;
    controls.actors[index] = { tick, modelRevision, rigCount: rig.children.length, hipParent: mesh.skeleton.bones[0]?.parent?.name ?? null, hipAngle: mesh.skeleton.bones[0]?.rotation.z ?? NaN,
      bones, skeleton: mesh.skeleton, morph: mesh.morphTargetInfluences[0] ?? 0, morphArray: mesh.morphTargetInfluences,
      mtoon: Boolean((mesh.material as { isMToonMaterial?: boolean }).isMToonMaterial), outline: !!outline,
      outlineShared: !!outline && outline.skeleton === mesh.skeleton, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, mesh, root };
  });
  return <group ref={group} position={[index === 0 ? -.6 : index === 1 ? .6 : 1.8,0,0]}>{legacy
    ? <Clone object={model} inject={inject} castShadow receiveShadow />
    : <StableModelClone object={model} fallback={Clone} inject={inject} castShadow receiveShadow />}</group>;
}
function CountingFallback(props: ComponentProps<typeof Clone>) {
  useEffect(() => { window.__STABLE_CLONE_FIXTURE__!.fallbackMounts++; }, []);
  return <Clone {...props} />;
}
function StaticActor({ controls }: { controls: Control }) {
  const group = useRef<THREE.Group>(null);
  const object = useMemo(() => {
    const root = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1), new THREE.MeshStandardMaterial());
    mesh.name = "StaticMesh"; root.add(mesh); return root;
  }, []);
  useFrame(() => { controls.staticFound = Boolean(group.current?.getObjectByName("StaticMesh")); });
  return <group ref={group}><StableModelClone object={object} fallback={CountingFallback} /></group>;
}
function Fixture({ controls, legacy }: { controls: Control; legacy: boolean }) {
  const [tick, setTick] = useState(0), [showFirst, setShowFirst] = useState(true), [swapped, setSwapped] = useState(false), source = useMemo(makeModel, []), alternate = useMemo(makeModel, []);
  controls.tick = () => setTick(value => value + 1); controls.pause = id => { controls.mixers[id]!.timeScale = 0; };
  controls.removeFirst = () => setShowFirst(false);
  controls.swapFirst = () => { controls.previousBones = [...controls.actors[0].bones]; controls.previousSkeleton = controls.actors[0].skeleton; controls.otherSkeleton = controls.actors[1].skeleton; setSwapped(true); };
  return <Canvas gl={{ preserveDrawingBuffer: true }} camera={{ position: [0, .5, 4], fov: 35 }}>
    <ambientLight intensity={2} /><Suspense fallback={null}>{showFirst && <Actor model={swapped ? alternate.model : source.model} clip={swapped ? alternate.clip : source.clip} index={0} tick={tick} controls={controls} modelRevision={swapped ? 1 : 0} legacy={legacy} />}<Actor model={source.model} clip={source.clip} index={1} tick={tick} controls={controls} legacy={legacy} /><Actor model={source.model} clip={source.clip} index={2} tick={tick} controls={controls} animate={false} legacy={legacy} /><StaticActor controls={controls} /></Suspense>
  </Canvas>;
}
export function mountStableCloneFixture(strict = false, legacy = false): () => void {
  const div = document.createElement("div"); div.style.cssText = "position:fixed;inset:0;z-index:99999;background:#fff"; document.body.appendChild(div);
  const controls: Control = { tick: () => {}, pause: () => {}, removeFirst: () => {}, swapFirst: () => {}, actors: {}, mixers: {}, fallbackMounts: 0, staticFound: false, unmountedActors: [] };
  window.__STABLE_CLONE_FIXTURE__ = controls;
  const root: Root = createRoot(div);
  root.render(strict ? <StrictMode><Fixture controls={controls} legacy={legacy} /></StrictMode> : <Fixture controls={controls} legacy={legacy} />);
  return () => { root.unmount(); div.remove(); delete window.__STABLE_CLONE_FIXTURE__; };
}
