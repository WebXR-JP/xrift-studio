import { Clone } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Box3, Group, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { StableModelClone } from "../../packages/xrift-studio-runtime/src/stable-model-clone";

export type CitizenCloneControl = {
  rerender: () => void;
  snapshot?: { tick: number; detachedBones: number; skins: number; vertices: number[][] };
};

// Optional local real-asset check. Asset bytes are supplied by the test and are
// never committed, modified, or uploaded.
export async function mountCitizenClone(base64: string, legacy: boolean) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer, "");
  const bounds = new Box3().setFromObject(scene);
  const center = bounds.getCenter(new Vector3());
  const control: CitizenCloneControl = { rerender: () => {} };
  function Citizen() {
    const root = useRef<Group>(null);
    const [tick, setTick] = useState(0);
    control.rerender = () => setTick(value => value + 1);
    useFrame(() => {
      if (!root.current) return;
      root.current.updateMatrixWorld(true);
      const tree = new Set();
      root.current.traverse(object => tree.add(object));
      let detachedBones = 0, skins = 0;
      const vertices: number[][] = [];
      root.current.traverse(object => {
        if (!(object as SkinnedMesh).isSkinnedMesh) return;
        const mesh = object as SkinnedMesh;
        skins++;
        detachedBones += mesh.skeleton.bones.filter(bone => !tree.has(bone)).length;
        mesh.skeleton.update();
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          vertices.push(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
        }
      });
      control.snapshot = { tick, detachedBones, skins, vertices };
    });
    return <group ref={root} position={[-center.x + tick * .2, -center.y + tick * .1, -center.z]}>
      {legacy ? <Clone object={scene} /> : <StableModelClone object={scene} fallback={Clone} />}
    </group>;
  }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;z-index:99999;background:#b8c6d5";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<Canvas camera={{ position: [2, 1, 3.5], fov: 35 }} gl={{ preserveDrawingBuffer: true }}>
    <ambientLight intensity={2} /><directionalLight position={[2, 4, 3]} intensity={3} /><Citizen />
  </Canvas>);
  return { control, cleanup: () => { root.unmount(); host.remove(); } };
}
