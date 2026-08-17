import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  Vector2,
} from "three";
import {
  TERRAIN_GRASS_FRAGMENT_SHADER,
  TERRAIN_GRASS_MAX_INSTANCES,
  TERRAIN_GRASS_VERTEX_SHADER,
  createTerrainGrassBladeBuffers,
  generateTerrainGrassInstances,
  getTerrainGrassType,
  type ResolvedWind,
  type TerrainGeometry,
  type TerrainGrassLayer,
} from "../../lib/visual-editor";

/**
 * Draws one grass layer as a single InstancedMesh.
 *
 * The blades are crossed cards rather than sprites, so a field reads as having
 * depth from any angle without an alpha-tested texture to bundle. Bending
 * happens in the vertex shader from the shared wind, anchored at the root: a
 * blade that slides sideways as a whole looks like a decal, not a plant.
 */
export function TerrainGrassVisual({
  terrain,
  layer,
  wind,
  maxInstances = TERRAIN_GRASS_MAX_INSTANCES,
}: {
  terrain: TerrainGeometry;
  layer: TerrainGrassLayer;
  wind: ResolvedWind;
  maxInstances?: number;
}) {
  const type = getTerrainGrassType(layer.typeId);
  const meshRef = useRef<InstancedMesh>(null);

  const placement = useMemo(
    () => generateTerrainGrassInstances(terrain, layer, maxInstances),
    [layer, maxInstances, terrain],
  );

  const geometry = useMemo(
    () => (type ? createBladeGeometry(type.cards) : new BufferGeometry()),
    [type],
  );

  const material = useMemo(() => {
    if (!type) return null;
    return new ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new Color(type.baseColor) },
        uTipColor: { value: new Color(type.tipColor) },
        uHeight: { value: type.height },
        uWidth: { value: type.width },
        uSway: { value: type.sway },
        uCurve: { value: type.curve },
        uCullDistance: { value: type.cullDistance },
        uWindDirection: { value: new Vector2(1, 0) },
        uWindSpeed: { value: 0 },
        uWindTurbulence: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: TERRAIN_GRASS_VERTEX_SHADER,
      fragmentShader: TERRAIN_GRASS_FRAGMENT_SHADER,
      side: DoubleSide,
    });
  }, [type]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material?.dispose(), [material]);

  useEffect(() => {
    if (!material) return;
    material.uniforms.uWindDirection.value.set(
      wind.direction[0],
      wind.direction[1],
    );
    material.uniforms.uWindSpeed.value = wind.speed;
    material.uniforms.uWindTurbulence.value = wind.turbulence;
  }, [material, wind]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    for (let index = 0; index < placement.placed; index += 1) {
      const scale = placement.scales[index];
      const rotation = placement.rotations[index];
      matrix.makeRotationY(rotation);
      matrix.scale({ x: scale, y: scale, z: scale } as never);
      matrix.setPosition(
        placement.positions[index * 3],
        placement.positions[index * 3 + 1],
        placement.positions[index * 3 + 2],
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.count = placement.placed;
    mesh.instanceMatrix.needsUpdate = true;
  }, [placement]);

  useFrame((state) => {
    if (material) material.uniforms.uTime.value = state.clock.getElapsedTime();
  });

  if (!type || !material || placement.placed === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, placement.placed]}
      frustumCulled={false}
      castShadow={false}
      receiveShadow={false}
    />
  );
}

/**
 * Crossed cards around the origin, each standing on the ground plane.
 *
 * The vertex shader needs to know how far up a blade a vertex sits to bend it,
 * so the height fraction rides in the UV rather than being recovered from the
 * position — the position is about to be moved.
 */
function createBladeGeometry(cards: number): BufferGeometry {
  const buffers = createTerrainGrassBladeBuffers(cards);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(buffers.positions), 3),
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array(buffers.uvs), 2),
  );
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Shaders live in the shared runtime module so the compiled world reads the
// same copy. Nothing below this line should redefine them.
