import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  type Group,
} from "three";
import { useFrame } from "@react-three/fiber";

import {
  sampleTerrainHeight,
  type TerrainGeometry,
  type TerrainViewportBrushKind,
} from "../../lib/visual-editor";

/**
 * The brush footprint, drawn on the ground.
 *
 * Without it the only way to learn what a stroke covers is to make one and
 * undo it. The ring follows the height field rather than sitting on a flat
 * plane, because a flat disc over a hill reads as covering ground it does not
 * touch. The inner disc shades by falloff so the soft edge is visible too.
 */

const RING_SEGMENTS = 72;
/** Lifted off the surface so the ring never z-fights the ground it describes. */
const SURFACE_OFFSET = 0.04;

const BRUSH_COLORS: Record<string, string> = {
  raise: "#a78bfa",
  lower: "#f0abfc",
  flatten: "#7dd3fc",
  smooth: "#86efac",
  stamp: "#fcd34d",
  "hole-add": "#fca5a5",
  "hole-remove": "#93c5fd",
  "grass-paint": "#4ade80",
  "grass-erase": "#fdba74",
};

export function TerrainBrushCursor({
  terrain,
  kind,
  radius,
  falloff,
  center,
}: {
  terrain: TerrainGeometry;
  kind: TerrainViewportBrushKind;
  radius: number;
  falloff: number;
  /** Terrain-local X/Z, or null when the pointer is off the surface. */
  center: [number, number] | null;
}) {
  const groupRef = useRef<Group>(null);
  const innerRef = useRef<Mesh>(null);
  const innerMaterialRef = useRef<MeshBasicMaterial>(null);
  const color = useMemo(
    () => new Color(BRUSH_COLORS[kind] ?? "#a78bfa"),
    [kind],
  );

  // Two rings of vertices per band: the outline, and the soft-edge boundary.
  // Built imperatively: the intrinsic <line> element collides with SVG's line
  // in JSX typings, and a LineLoop has no intrinsic element at all.
  const outlineLine = useMemo(() => {
    const material = new LineBasicMaterial({
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    const loop = new LineLoop(new BufferGeometry(), material);
    loop.frustumCulled = false;
    loop.renderOrder = 999;
    return loop;
  }, []);

  const geometries = useMemo(() => {
    const outline = new BufferGeometry();
    const inner = new BufferGeometry();
    outline.setAttribute(
      "position",
      new BufferAttribute(new Float32Array((RING_SEGMENTS + 1) * 3), 3),
    );
    const innerCount = (RING_SEGMENTS + 1) * 2;
    inner.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(innerCount * 3), 3),
    );
    const indices: number[] = [];
    for (let segment = 0; segment < RING_SEGMENTS; segment += 1) {
      const a = segment * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    inner.setIndex(indices);
    return { outline, inner };
  }, []);

  useEffect(() => {
    outlineLine.geometry = geometries.outline;
  }, [geometries, outlineLine]);

  useEffect(() => {
    (outlineLine.material as LineBasicMaterial).color.copy(color);
  }, [color, outlineLine]);

  useEffect(
    () => () => {
      geometries.outline.dispose();
      geometries.inner.dispose();
      (outlineLine.material as LineBasicMaterial).dispose();
    },
    [geometries, outlineLine],
  );

  // Rebuilt per frame rather than on pointer events: the ring has to track the
  // cursor without waiting on React, and the vertex count is fixed so this is
  // a write into existing buffers.
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    if (!center) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const outlinePositions = geometries.outline.getAttribute("position");
    const innerPositions = geometries.inner.getAttribute("position");
    const softRadius = radius * Math.max(0, Math.min(falloff, 1));
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    for (let segment = 0; segment <= RING_SEGMENTS; segment += 1) {
      const angle = (segment / RING_SEGMENTS) * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);

      const outerX = center[0] + dirX * radius;
      const outerZ = center[1] + dirZ * radius;
      const outerHeight = sampleTerrainHeight(terrain, outerX, outerZ);
      if (outerHeight < minHeight) minHeight = outerHeight;
      if (outerHeight > maxHeight) maxHeight = outerHeight;
      outlinePositions.setXYZ(
        segment,
        outerX,
        outerHeight + SURFACE_OFFSET,
        outerZ,
      );

      const softX = center[0] + dirX * softRadius;
      const softZ = center[1] + dirZ * softRadius;
      innerPositions.setXYZ(
        segment * 2,
        softX,
        sampleTerrainHeight(terrain, softX, softZ) + SURFACE_OFFSET,
        softZ,
      );
      innerPositions.setXYZ(
        segment * 2 + 1,
        outerX,
        outerHeight + SURFACE_OFFSET,
        outerZ,
      );
    }
    outlinePositions.needsUpdate = true;
    innerPositions.needsUpdate = true;
    // On a cliff the two rings sit many metres apart in Y and the band between
    // them becomes a vertical curtain that hides the ground it is describing.
    // The outline alone still reads as the footprint, so the fill fades out as
    // the footprint stops being roughly flat.
    const fill = innerMaterialRef.current;
    if (fill) {
      const relief = (maxHeight - minHeight) / Math.max(radius, 0.001);
      fill.opacity = 0.18 * (1 - Math.min(relief / 1.5, 1));
    }
    if (import.meta.env.DEV) {
      // Verification hook: lets a debug session confirm the ring is live and
      // where it sits without reaching into the renderer's internals.
      (window as unknown as Record<string, unknown>).__xriftTerrainBrushCursor = {
        center,
        radius,
        kind,
        firstVertex: [
          outlinePositions.getX(0),
          outlinePositions.getY(0),
          outlinePositions.getZ(0),
        ],
      };
    }
    geometries.outline.computeBoundingSphere();
    geometries.inner.computeBoundingSphere();
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={outlineLine} />
      <mesh ref={innerRef} frustumCulled={false} renderOrder={998}>
        <primitive object={geometries.inner} attach="geometry" />
        <meshBasicMaterial
          ref={innerMaterialRef}
          color={color}
          transparent
          opacity={0.18}
          side={DoubleSide}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}
