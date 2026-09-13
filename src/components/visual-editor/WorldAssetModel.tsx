import { VEHICLE_WHEEL_POSITIONS } from "../../lib/visual-editor/scripting/vehicle-effects-scripts";
import { Suspense, type ReactNode } from "react";
import { Clone, useGLTF } from "@react-three/drei";
import { catalogPublicAssetUrl } from "../../lib/visual-editor/catalog-public-url";
import models from "../../lib/visual-editor/scripting/world-asset-model-definitions.json";
type WorldAssetPreview = { kind: "vehicle" | "seat" };

function CatalogModel({ kind }: { kind: WorldAssetPreview["kind"] | "wheel" }) {
  const { scene } = useGLTF(catalogPublicAssetUrl(models[kind].publicPath));
  return <Clone object={scene} />;
}

/** Catalog and editor share the seat origins; the editor supplies project Model Assets. */
export function WorldAssetModel({ kind, height = 0.5, body, seat }: {
  kind: WorldAssetPreview["kind"];
  height?: number;
  body?: ReactNode;
  seat?: ReactNode;
}) {
  const seatModel = seat === undefined ? <CatalogModel kind="seat" /> : seat;
  return <Suspense fallback={null}>
    {kind === "vehicle" ? <>
      {body === undefined ? <CatalogModel kind="vehicle" /> : body}
      {VEHICLE_WHEEL_POSITIONS.map((position, index) => <group key={index} position={[...position]}><CatalogModel kind="wheel" /></group>)}
      <group position={[-0.4, 0.85, 0.05]}>{seatModel}</group>
      <group position={[0.4, 0.85, 0.05]}>{seatModel}</group>
    </> : <group position={[0, height, 0]}>{seatModel}</group>}
  </Suspense>;
}
