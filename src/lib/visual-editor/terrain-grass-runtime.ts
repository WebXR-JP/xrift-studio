/**
 * Grass rendering and placement assets shared between the editor viewport and
 * the compiled world.
 *
 * The published world regenerates every blade from the stored rules, so its
 * placement code must agree with `generateTerrainGrassInstances` exactly — a
 * divergence would move the grass between Play and the published world. The
 * shaders and blade buffers live here so both sides read one copy, and the
 * placement algorithm is kept as an embeddable source template whose evaluated
 * output the fixture holds bit-identical to the TypeScript implementation.
 */

/**
 * Blade card buffers. The height fraction rides in the UV because the vertex
 * stage is about to move the position; a blade built from one quad could only
 * ever be a spike, so each card is segmented and tapered.
 */
export function createTerrainGrassBladeBuffers(cards: number): {
  positions: number[];
  uvs: number[];
  indices: number[];
} {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 4;
  const cardCount = Math.max(Math.floor(cards), 1);
  for (let card = 0; card < cardCount; card += 1) {
    const angle = (Math.PI * card) / cardCount;
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const cardBase = card * (segments + 1) * 2;
    for (let step = 0; step <= segments; step += 1) {
      const t = step / segments;
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
  return { positions, uvs, indices };
}

/** Grass blade shaders shared by the editor viewport and the compiled world. */
export const TERRAIN_GRASS_VERTEX_SHADER = `uniform float uHeight;
uniform float uWidth;
uniform float uSway;
uniform float uCurve;
uniform float uCullDistance;
uniform vec2 uWindDirection;
uniform float uWindSpeed;
uniform float uWindTurbulence;
uniform float uTime;
uniform vec3 uSunDirection;
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
  vShade = 0.65 + 0.35 * clamp(dot(faceNormal, normalize(uSunDirection)), 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

export const TERRAIN_GRASS_FRAGMENT_SHADER = `uniform vec3 uBaseColor;
uniform vec3 uTipColor;
varying float vHeightFraction;
varying float vShade;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;

void main() {
  vec3 color = mix(uBaseColor, uTipColor, vHeightFraction * vHeightFraction);
  vec3 light =
    uAmbientColor * uAmbientIntensity + uSunColor * uSunIntensity;
  gl_FragColor = vec4(color * vShade * light, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The placement algorithm as embeddable source.
 *
 * One template produces both the typed form the generated World compiles under
 * strict TypeScript and the untyped form the fixture evaluates as JavaScript.
 * Injecting the annotations is what keeps this a single copy: hand-maintaining
 * a typed and an untyped variant is exactly the divergence this guards against.
 */
export function terrainGrassRuntimeSource(options: { typed: boolean }): string {
  const typed = options.typed;
  const num = typed ? ": number" : "";
  const returnsNumber = typed ? ": number" : "";
  const numberArray = typed ? ": number[]" : "";
  const terrainType = typed ? ": XriftTerrainGeometryData" : "";
  const layerType = typed ? ": XriftTerrainGrassLayerData" : "";
  return [
    `function xriftTerrainGrassHash(seed${num}, index${num}, salt${num})${returnsNumber} {`,
    `  let value = (seed | 0) ^ Math.imul(index | 0, 0x9e3779b1);`,
    `  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);`,
    `  value ^= Math.imul(salt | 0, 0xc2b2ae35);`,
    `  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);`,
    `  value ^= value >>> 16;`,
    `  return (value >>> 0) / 4294967296;`,
    `}`,
    ``,
    `function xriftTerrainGrassHeight(terrain${terrainType}, localX${num}, localZ${num})${returnsNumber} {`,
    `  const cells = terrain.resolution - 1;`,
    `  const u = ((localX + terrain.width / 2) / terrain.width) * cells;`,
    `  const v = ((localZ + terrain.depth / 2) / terrain.depth) * cells;`,
    `  const x0 = Math.min(Math.max(Math.floor(u), 0), cells);`,
    `  const z0 = Math.min(Math.max(Math.floor(v), 0), cells);`,
    `  const x1 = Math.min(x0 + 1, cells);`,
    `  const z1 = Math.min(z0 + 1, cells);`,
    `  const fx = Math.min(Math.max(u - x0, 0), 1);`,
    `  const fz = Math.min(Math.max(v - z0, 0), 1);`,
    `  const h00 = terrain.heights[z0 * terrain.resolution + x0] ?? 0;`,
    `  const h10 = terrain.heights[z0 * terrain.resolution + x1] ?? 0;`,
    `  const h01 = terrain.heights[z1 * terrain.resolution + x0] ?? 0;`,
    `  const h11 = terrain.heights[z1 * terrain.resolution + x1] ?? 0;`,
    `  return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;`,
    `}`,
    ``,
    `function xriftTerrainGrassSlope(terrain${terrainType}, localX${num}, localZ${num})${returnsNumber} {`,
    `  const stepX = terrain.width / Math.max(terrain.resolution - 1, 1);`,
    `  const stepZ = terrain.depth / Math.max(terrain.resolution - 1, 1);`,
    `  const dx =`,
    `    (xriftTerrainGrassHeight(terrain, localX + stepX, localZ) -`,
    `      xriftTerrainGrassHeight(terrain, localX - stepX, localZ)) /`,
    `    (2 * stepX);`,
    `  const dz =`,
    `    (xriftTerrainGrassHeight(terrain, localX, localZ + stepZ) -`,
    `      xriftTerrainGrassHeight(terrain, localX, localZ - stepZ)) /`,
    `    (2 * stepZ);`,
    `  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;`,
    `}`,
    ``,
    `function xriftTerrainGrassMaskAt(terrain${terrainType}, layer${layerType}, localX${num}, localZ${num})${returnsNumber} {`,
    `  const mask = layer.mask;`,
    `  if (!mask) return 1;`,
    `  if (mask.length !== terrain.resolution * terrain.resolution) return 1;`,
    `  const cells = terrain.resolution - 1;`,
    `  const u = ((localX + terrain.width / 2) / terrain.width) * cells;`,
    `  const v = ((localZ + terrain.depth / 2) / terrain.depth) * cells;`,
    `  const x0 = Math.min(Math.max(Math.floor(u), 0), cells);`,
    `  const z0 = Math.min(Math.max(Math.floor(v), 0), cells);`,
    `  const x1 = Math.min(x0 + 1, cells);`,
    `  const z1 = Math.min(z0 + 1, cells);`,
    `  const fx = Math.min(Math.max(u - x0, 0), 1);`,
    `  const fz = Math.min(Math.max(v - z0, 0), 1);`,
    `  const m00 = mask[z0 * terrain.resolution + x0] ?? 1;`,
    `  const m10 = mask[z0 * terrain.resolution + x1] ?? 1;`,
    `  const m01 = mask[z1 * terrain.resolution + x0] ?? 1;`,
    `  const m11 = mask[z1 * terrain.resolution + x1] ?? 1;`,
    `  return m00 * (1 - fx) * (1 - fz) + m10 * fx * (1 - fz) + m01 * (1 - fx) * fz + m11 * fx * fz;`,
    `}`,
    ``,
    `function xriftTerrainGrassPlace(terrain${terrainType}, layer${layerType}, maxInstances${num}) {`,
    `  const requested = Math.max(`,
    `    0,`,
    `    Math.floor(Math.max(terrain.width, 0) * Math.max(terrain.depth, 0) * Math.max(layer.density, 0)),`,
    `  );`,
    `  const limit = Math.max(0, Math.floor(maxInstances));`,
    `  const positions${numberArray} = [];`,
    `  const rotations${numberArray} = [];`,
    `  const scales${numberArray} = [];`,
    `  const low = Math.min(layer.heightRange[0] ?? 0, layer.heightRange[1] ?? 0);`,
    `  const high = Math.max(layer.heightRange[0] ?? 0, layer.heightRange[1] ?? 0);`,
    `  const slopeLimit = Math.max(layer.slopeLimitDegrees, 0);`,
    `  const cells = terrain.resolution - 1;`,
    `  for (let index = 0; index < requested; index += 1) {`,
    `    if (positions.length / 3 >= limit) break;`,
    `    const localX = (xriftTerrainGrassHash(layer.seed, index, 1) - 0.5) * terrain.width;`,
    `    const localZ = (xriftTerrainGrassHash(layer.seed, index, 2) - 0.5) * terrain.depth;`,
    `    const cellX = Math.min(`,
    `      Math.max(Math.floor(((localX + terrain.width / 2) / terrain.width) * cells), 0),`,
    `      cells - 1,`,
    `    );`,
    `    const cellZ = Math.min(`,
    `      Math.max(Math.floor(((localZ + terrain.depth / 2) / terrain.depth) * cells), 0),`,
    `      cells - 1,`,
    `    );`,
    `    if (terrain.holes?.[cellZ * cells + cellX] === true) continue;`,
    `    const height = xriftTerrainGrassHeight(terrain, localX, localZ);`,
    `    if (height < low || height > high) continue;`,
    `    if (xriftTerrainGrassSlope(terrain, localX, localZ) > slopeLimit) continue;`,
    `    if (`,
    `      xriftTerrainGrassHash(layer.seed, index, 5) >=`,
    `      xriftTerrainGrassMaskAt(terrain, layer, localX, localZ)`,
    `    ) {`,
    `      continue;`,
    `    }`,
    `    positions.push(localX, height, localZ);`,
    `    rotations.push(xriftTerrainGrassHash(layer.seed, index, 3) * Math.PI * 2);`,
    `    scales.push(0.75 + xriftTerrainGrassHash(layer.seed, index, 4) * 0.5);`,
    `  }`,
    `  return {`,
    `    positions: new Float32Array(positions),`,
    `    rotations: new Float32Array(rotations),`,
    `    scales: new Float32Array(scales),`,
    `    placed: scales.length,`,
    `  };`,
    `}`,
    ``,
    `function xriftTerrainGrassBladeBuffers(cards${num}) {`,
    `  const positions${numberArray} = [];`,
    `  const uvs${numberArray} = [];`,
    `  const indices${numberArray} = [];`,
    `  const segments = 4;`,
    `  const cardCount = Math.max(Math.floor(cards), 1);`,
    `  for (let card = 0; card < cardCount; card += 1) {`,
    `    const angle = (Math.PI * card) / cardCount;`,
    `    const dirX = Math.cos(angle);`,
    `    const dirZ = Math.sin(angle);`,
    `    const cardBase = card * (segments + 1) * 2;`,
    `    for (let step = 0; step <= segments; step += 1) {`,
    `      const t = step / segments;`,
    `      const halfWidth = 0.5 * (1 - t) * (1 - t * 0.45);`,
    `      positions.push(-dirX * halfWidth, t, -dirZ * halfWidth);`,
    `      positions.push(dirX * halfWidth, t, dirZ * halfWidth);`,
    `      uvs.push(0, t, 1, t);`,
    `    }`,
    `    for (let step = 0; step < segments; step += 1) {`,
    `      const a = cardBase + step * 2;`,
    `      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);`,
    `    }`,
    `  }`,
    `  return { positions, uvs, indices };`,
    `}`,
  ].join("\n");
}
