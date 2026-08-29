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
  Vector3,
} from "three";
import {
  TERRAIN_GRASS_FRAGMENT_SHADER,
  TERRAIN_GRASS_MAX_INSTANCES,
  TERRAIN_GRASS_VERTEX_SHADER,
  createTerrainGrassBladeBuffers,
  generateTerrainGrassInstances,
  getTerrainGrassType,
  resolveTerrainGrassAppearance,
  type ResolvedSceneLighting,
  type ResolvedWind,
  type TerrainGeometry,
  type TerrainGrassLayer,
} from "../../lib/visual-editor";

/**
 * Draws one grass layer as a single InstancedMesh.
 *
 * A blade is one tapered card that turns toward the eye as it goes edge-on,
 * rather than a fixed set of crossed cards: it costs a third of the crossed
 * set, reads the same from any angle, and the triangles that buys go into
 * blade count instead, which is what closes the gaps in a wide field. Bending
 * happens in the vertex shader from the shared wind, anchored at the root: a
 * blade that slides sideways as a whole looks like a decal, not a plant.
 *
 * Colour, size and the sky bounce come from the layer's own appearance when it
 * has one and from the type otherwise, so an author who tunes a field in the
 * Inspector is tuning the same numbers the published world will use.
 */
export function TerrainGrassVisual({
  terrain,
  layer,
  wind,
  lighting,
  maxInstances = TERRAIN_GRASS_MAX_INSTANCES,
}: {
  terrain: TerrainGeometry;
  layer: TerrainGrassLayer;
  wind: ResolvedWind;
  /** The Scene's key light, so grass shades with the ground it stands on. */
  lighting: ResolvedSceneLighting;
  maxInstances?: number;
}) {
  const type = getTerrainGrassType(layer.typeId);
  const meshRef = useRef<InstancedMesh>(null);

  const placement = useMemo(
    () => generateTerrainGrassInstances(terrain, layer, maxInstances),
    [layer, maxInstances, terrain],
  );

  const geometry = useMemo(
    () =>
      type ? createBladeGeometry(type.cards, type.segments) : new BufferGeometry(),
    [type],
  );

  const appearance = useMemo(
    () => (type ? resolveTerrainGrassAppearance(type, layer.appearance) : null),
    [layer.appearance, type],
  );

  // The material is built once per type and then written to. Rebuilding it for
  // a colour or a light would recompile the shader on every drag of a swatch,
  // and baking the light into it at build time was worse still: the scene's
  // light changes far more often than the type does, so the blades kept the
  // one they were born with — which is how a field ended up black under a lit
  // sky and stayed there.
  const material = useMemo(() => {
    if (!type) return null;
    return new ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new Color(type.baseColor) },
        uTipColor: { value: new Color(type.tipColor) },
        uSunDirection: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color(1, 1, 1) },
        uSunIntensity: { value: 0 },
        uAmbientColor: { value: new Color(1, 1, 1) },
        uAmbientIntensity: { value: 0 },
        uHeight: { value: type.height },
        uWidth: { value: type.width },
        uSway: { value: type.sway },
        uCurve: { value: type.curve },
        uCullDistance: { value: type.cullDistance },
        uTranslucency: { value: type.translucency },
        uColorVariation: { value: type.colorVariation },
        uFill: { value: 0 },
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
    if (!material) return;
    material.uniforms.uSunDirection.value.set(...lighting.sunDirection);
    material.uniforms.uSunColor.value.setRGB(...lighting.sunColor);
    material.uniforms.uSunIntensity.value = lighting.sunIntensity;
    material.uniforms.uAmbientColor.value.setRGB(...lighting.ambientColor);
    material.uniforms.uAmbientIntensity.value = lighting.ambientIntensity;
  }, [lighting, material]);

  useEffect(() => {
    if (!material || !appearance) return;
    material.uniforms.uBaseColor.value.set(appearance.baseColor);
    material.uniforms.uTipColor.value.set(appearance.tipColor);
    material.uniforms.uColorVariation.value = appearance.colorVariation;
    material.uniforms.uHeight.value = appearance.height;
    material.uniforms.uWidth.value = appearance.width;
    material.uniforms.uFill.value = appearance.fill;
  }, [appearance, material]);

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
 * One blade's cards, standing on the ground plane at the origin.
 *
 * The vertex shader needs to know how far up a blade a vertex sits to bend it,
 * so the height fraction rides in the UV rather than being recovered from the
 * position — the position is about to be moved.
 */
function createBladeGeometry(cards: number, segments: number): BufferGeometry {
  const buffers = createTerrainGrassBladeBuffers(cards, segments);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(buffers.positions), 3),
  );
  // The card's own facing, not a computed one: a strip that lies flat in its
  // own space has no surface to derive a normal from, and the shader needs the
  // facing anyway to decide how far to turn the blade toward the eye.
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array(buffers.normals), 3),
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array(buffers.uvs), 2),
  );
  geometry.setIndex(buffers.indices);
  return geometry;
}

// Shaders live in the shared runtime module so the compiled world reads the
// same copy. Nothing below this line should redefine them.
