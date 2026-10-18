import { useEffect, useMemo } from "react";
import type {} from "@react-three/fiber";
import { createXriftExtrudeGeometry } from "./extrude-geometry.js";

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

/** A 2D profile in local XY extruded along local +Z, shared by Edit, Play and publication. */
export function XriftExtrudeGeometry({
  points,
  depth,
}: {
  points: [number, number][];
  depth: number;
}) {
  const geometry = useMemo(() => createXriftExtrudeGeometry({ points, depth }), [points, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}
