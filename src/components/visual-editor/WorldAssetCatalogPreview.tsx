import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { WorldAssetModel } from "./WorldAssetModel";
export function WorldAssetCatalogPreview({ kind, className }: { kind: "vehicle" | "seat"; className: string }) {
  return <div className={className}><Canvas key={kind} dpr={1} frameloop="demand" camera={{ position: kind === "vehicle" ? [3.3, 2.6, -4.2] : [1.7, 1.3, -2.3], fov: 38 }}>
    <OrbitControls enablePan={false} enableZoom={false} />
    <color attach="background" args={["#e8edf0"]} />
    <ambientLight intensity={1.5} /><directionalLight position={[3, 5, -3]} intensity={2.5} />
    <group position={[0, -0.55, 0]}>
      <WorldAssetModel kind={kind} />
    </group>
  </Canvas></div>;
}
