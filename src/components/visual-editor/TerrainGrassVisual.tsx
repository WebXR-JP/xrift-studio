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
        uCurve: { value: type.curve },
        uCullDistance: { value: type.cullDistance },
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
  // Segments along the height, so the vertex stage can arc the blade. A blade
  // built from one quad can only ever be a straight spike.
  const segments = 4;
  for (let card = 0; card < cards; card += 1) {
    const angle = (Math.PI * card) / Math.max(cards, 1);
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const cardBase = card * (segments + 1) * 2;
    for (let step = 0; step <= segments; step += 1) {
      const t = step / segments;
      // Taper to a point, biased so the blade keeps its width low down and
      // narrows quickly near the tip the way a real one does.
      const halfWidth = 0.5 * (1 - t) * (1 - t * 0.45);
      positions.push(-dirX * halfWidth, t, -dirZ * halfWidth);
      positions.push(dirX * halfWidth, t, dirZ * halfWidth);
      uvs.push(0, t, 1, t);
    }
    for (let step = 0; step < segments; step += 1) {
      const a = cardBase + step * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
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
uniform float uCurve;
uniform float uCullDistance;
uniform vec2 uWindDirection;
uniform float uWindSpeed;
uniform float uWindTurbulence;
uniform float uTime;
varying float vHeightFraction;
varying float vShade;

void main() {
  vHeightFraction = uv.y;
  vec4 anchor = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  // Distance culling. A blade thinner than a pixel cannot be drawn, only
  // aliased, and a whole field of them turns the ground into moire rings.
  // Shrinking them out before that point removes the artefact without paying
  // for transparency or sorting.
  float distanceToCamera = distance(cameraPosition, anchor.xyz);
  float visibility =
    1.0 - smoothstep(uCullDistance * 0.65, uCullDistance, distanceToCamera);
  if (visibility <= 0.001) {
    // Outside the clip volume, so the blade costs nothing beyond this vertex.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float t = uv.y;
  vec3 local = vec3(
    position.x * uWidth,
    position.y * uHeight * visibility,
    position.z * uWidth
  );

  // Each blade leans on its own axis and arcs over rather than standing
  // straight, which is most of what separates grass from a field of spikes.
  float lean = uCurve * t * t * uHeight * 0.5;
  local.x += lean;

  vec4 rooted = instanceMatrix * vec4(local, 1.0);
  // The instance's world position is the phase, so neighbouring blades lean at
  // slightly different moments. One phase for the whole field would make it
  // pulse like a single sheet.
  float phase = uTime * uWindSpeed + anchor.x * 0.35 + anchor.z * 0.27;
  float gust = 1.0 + uWindTurbulence * 0.5 * sin(phase * 0.31);
  float bend = uSway * uWindSpeed * 0.09 * gust * sin(phase) * t * t;
  rooted.xz += uWindDirection * bend * uHeight;

  vec4 worldPosition = modelMatrix * rooted;
  // A cheap wrap-around shade so a dense field still has form. Blades are
  // unlit otherwise and would read as flat cut-outs.
  vec3 faceNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(position.x, 0.35, position.z));
  vShade = 0.65 + 0.35 * clamp(dot(faceNormal, normalize(vec3(0.4, 0.8, 0.3))), 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

const GRASS_FRAGMENT_SHADER = `uniform vec3 uBaseColor;
uniform vec3 uTipColor;
varying float vHeightFraction;
varying float vShade;

void main() {
  vec3 color = mix(uBaseColor, uTipColor, vHeightFraction * vHeightFraction);
  gl_FragColor = vec4(color * vShade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
