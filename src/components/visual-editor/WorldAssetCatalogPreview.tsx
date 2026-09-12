import { Canvas } from "@react-three/fiber";
import { VEHICLE_BODY, SEAT_BODY, type WorldAssetPart } from "../../lib/visual-editor/scripting/world-asset-models";
function Parts({ parts }: { parts: WorldAssetPart[] }) {
  return <>{parts.map((p, i) => <mesh key={i} position={p.position} rotation={p.rotation}>
    {p.shape === "box" ? <boxGeometry args={p.size} /> : <cylinderGeometry args={[...p.size, 20]} />}
    <meshStandardMaterial color={p.color} roughness={0.65} metalness={p.metalness ?? 0.15} />
  </mesh>)}</>;
}
export function WorldAssetCatalogPreview({ kind, className }: { kind: "vehicle" | "seat"; className: string }) {
  return <div className={className}><Canvas key={kind} dpr={1} frameloop="demand" camera={{ position: kind === "vehicle" ? [3.3, 2.6, -4.2] : [1.7, 1.3, -2.3], fov: 38 }}>
    <color attach="background" args={["#e8edf0"]} />
    <ambientLight intensity={1.5} /><directionalLight position={[3, 5, -3]} intensity={2.5} />
    <group position={[0, -0.55, 0]}>
      {kind === "vehicle" ? <><Parts parts={VEHICLE_BODY} /><group position={[-0.4, 0.85, 0.05]}><Parts parts={SEAT_BODY} /></group><group position={[0.4, 0.85, 0.05]}><Parts parts={SEAT_BODY} /></group></> : <group position={[0, 0.5, 0]}><Parts parts={SEAT_BODY} /></group>}
    </group>
  </Canvas></div>;
}
