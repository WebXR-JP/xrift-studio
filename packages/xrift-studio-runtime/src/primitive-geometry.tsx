import type {} from "@react-three/fiber";

export type XriftPrimitiveGeometryKind = "box" | "sphere" | "cylinder" | "cone" | "plane";

/** Authored primitive dimensions and topology, shared by Edit, Play and publication. */
export function XriftPrimitiveGeometry({ primitive }: { primitive: XriftPrimitiveGeometryKind }) {
  switch (primitive) {
    case "box":
      return <boxGeometry args={[1, 1, 1]} />;
    case "sphere":
      return <sphereGeometry args={[0.5, 32, 20]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case "cone":
      return <coneGeometry args={[0.5, 1, 32]} />;
    case "plane":
      return <planeGeometry args={[1, 1]} />;
  }
}
