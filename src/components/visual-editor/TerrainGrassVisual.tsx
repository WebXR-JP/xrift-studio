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
  TERRAIN_GRASS_MAX_INSTANCES,
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
        uWindDirection: { value: new Vector2(1, 0) },
        uWindSpeed: { value: 0 },
        uWindTurbulence: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: GRASS_VERTEX_SHADER,
      fragmentShader: GRASS_FRAGMENT_SHADER,
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
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let card = 0; card < cards; card += 1) {
    const angle = (Math.PI * card) / Math.max(cards, 1);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const base = card * 4;
    // A tapered blade: full width at the root, a point at the tip.
    positions.push(-dirX * 0.5, 0, -dirZ * 0.5);
    positions.push(dirX * 0.5, 0, dirZ * 0.5);
    positions.push(dirX * 0.12, 1, dirZ * 0.12);
    positions.push(-dirX * 0.12, 1, -dirZ * 0.12);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const GRASS_VERTEX_SHADER = `uniform float uHeight;
uniform float uWidth;
uniform float uSway;
uniform vec2 uWindDirection;
uniform float uWindSpeed;
uniform float uWindTurbulence;
uniform float uTime;
varying float vHeightFraction;

void main() {
  vHeightFraction = uv.y;
  vec3 local = vec3(position.x * uWidth, position.y * uHeight, position.z * uWidth);

  // The instance's world position is the phase, so neighbouring blades lean at
  // slightly different moments. One phase for the whole field would make it
  // pulse like a single sheet.
  vec4 rooted = instanceMatrix * vec4(local, 1.0);
  vec4 anchor = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float phase = uTime * uWindSpeed + anchor.x * 0.35 + anchor.z * 0.27;
  float gust = 1.0 + uWindTurbulence * 0.5 * sin(phase * 0.31);
  // Bending grows with the square of the height fraction, so the root stays
  // planted and only the tip travels.
  float bend = uSway * uWindSpeed * 0.12 * gust * sin(phase) * uv.y * uv.y;
  rooted.xz += uWindDirection * bend * uHeight;

  vec4 worldPosition = modelMatrix * rooted;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

const GRASS_FRAGMENT_SHADER = `uniform vec3 uBaseColor;
uniform vec3 uTipColor;
varying float vHeightFraction;

void main() {
  vec3 color = mix(uBaseColor, uTipColor, vHeightFraction * vHeightFraction);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
