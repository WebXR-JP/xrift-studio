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
 * Blade card buffers.
 *
 * A card is a strip standing on the ground plane: `position.x` carries the
 * blade's half-width profile, `position.y` the fraction of the way up, and the
 * card's facing goes in `normal`. The shader needs the facing as a vector
 * because it turns the card toward the eye, and it needs the profile as a
 * scalar because it widens the blade with distance — neither survives being
 * baked into an xz offset, which is what the old buffers did.
 *
 * The profile itself is the difference between a blade and a hair. A card that
 * thins linearly from its base is a needle, and a field of needles is a head of
 * hair; a real blade keeps most of its width for most of its length and gives
 * it up near the tip, which is what `pow` pair below draws.
 */
export function createTerrainGrassBladeBuffers(
  cards: number,
  segments: number,
): {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = Math.max(Math.floor(segments), 2);
  const cardCount = Math.max(Math.floor(cards), 1);
  for (let card = 0; card < cardCount; card += 1) {
    const angle = (Math.PI * card) / cardCount;
    const normalX = -Math.sin(angle);
    const normalZ = Math.cos(angle);
    const cardBase = card * (rows + 1) * 2;
    for (let step = 0; step <= rows; step += 1) {
      const t = step / rows;
      const halfWidth = 0.5 * Math.pow(1 - Math.pow(t, 2.2), 0.55);
      positions.push(-halfWidth, t, 0);
      positions.push(halfWidth, t, 0);
      normals.push(normalX, 0, normalZ, normalX, 0, normalZ);
      uvs.push(0, t, 1, t);
    }
    for (let step = 0; step < rows; step += 1) {
      const a = cardBase + step * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  return { positions, normals, uvs, indices };
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
varying float vHeightFraction;
varying float vTint;
varying vec3 vNormal;
varying vec3 vView;

// One random per blade, from where the blade stands. Nothing per-instance has
// to be uploaded for it, so variation costs a buffer of zero bytes.
float xriftGrassRandom(vec2 seed) {
  return fract(sin(dot(seed, vec2(41.7318, 289.4213))) * 43758.5453123);
}

void main() {
  float t = uv.y;
  vHeightFraction = t;
  vec4 anchor = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vTint = xriftGrassRandom(anchor.xz + vec2(11.7, 3.1));

  // Distance thinning. A blade thinner than a pixel cannot be drawn, only
  // aliased, and a whole field of them turns the ground into moire rings.
  // Blades leave one at a time rather than all shrinking together: a field
  // losing height as one is a bald ring on the ground, a field losing members
  // is grass getting sparser. The survivors take the missing blades' width, so
  // the far cover stays as solid as it looked while costing a fraction of it.
  float distanceToCamera = distance(cameraPosition, anchor.xyz);
  float coverage =
    1.0 - smoothstep(uCullDistance * 0.45, uCullDistance, distanceToCamera);
  if (xriftGrassRandom(anchor.xz) > coverage) {
    // Outside the clip volume, so the blade costs nothing beyond this vertex.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float widthGain = clamp(inversesqrt(max(coverage, 0.14)), 1.0, 2.6);

  // The blade's own axes in world space. Everything below is decided in world
  // space and brought back, so a Terrain that is rotated or scaled by its
  // Entity still grows grass that stands up and leans downwind.
  mat3 basis = mat3(modelMatrix) * mat3(instanceMatrix);
  vec3 axisX = normalize(basis[0]);
  vec3 axisY = normalize(basis[1]);
  vec3 axisZ = normalize(basis[2]);

  // A single card is a third of the cost of the crossed set it replaced, and
  // this is what buys that back: as the card turns edge-on it swings toward
  // the eye instead of collapsing to a line. Facing the eye already, it does
  // not move at all, so a blade never spins under a walking camera.
  vec3 cardNormal = normalize(basis * normal);
  vec3 toCamera = normalize(cameraPosition - anchor.xyz);
  vec3 cardSide = cross(axisY, cardNormal);
  vec3 viewSide = cross(axisY, toCamera);
  float cardSideLength = length(cardSide);
  float viewSideLength = length(viewSide);
  cardSide = cardSideLength > 0.001 ? cardSide / cardSideLength : axisX;
  viewSide = viewSideLength > 0.001 ? viewSide / viewSideLength : cardSide;
  // A side that flips as the camera crosses the blade would make the field
  // shimmer, so the view side is taken along the card's own sense.
  viewSide *= sign(dot(viewSide, cardSide) + 0.0001);
  float facing = abs(dot(cardNormal, toCamera));
  vec3 side = normalize(mix(cardSide, viewSide, 1.0 - facing));

  vec3 local = vec3(
    dot(side, axisX),
    dot(side, axisY),
    dot(side, axisZ)
  ) * (position.x * uWidth * widthGain);

  // The arc. A blade that stands straight is a spike, and one that keeps its
  // full length while arcing over is a stretched spike, so the lean takes its
  // height back as it goes.
  float arc = uCurve * t * t;
  local.x += arc * uHeight * 0.5;
  local.y += position.y * uHeight * (1.0 - 0.18 * arc);

  vec4 rooted = instanceMatrix * vec4(local, 1.0);
  // The instance's world position is the phase, so neighbouring blades lean at
  // slightly different moments. One phase for the whole field would make it
  // pulse like a single sheet.
  float phase = uTime * uWindSpeed + anchor.x * 0.35 + anchor.z * 0.27;
  float gust = 1.0 + uWindTurbulence * 0.5 * sin(phase * 0.31);
  float bend = uSway * uWindSpeed * 0.09 * gust * sin(phase) * t * t;
  rooted.xz += uWindDirection * bend * uHeight;

  vec4 worldPosition = modelMatrix * rooted;
  // The drawn card faces across its own width, and the higher up the blade the
  // more of the sky it answers to — an arcing blade turns its face upward.
  vec3 face = normalize(cross(side, axisY));
  vNormal = normalize(mix(face, axisY, 0.32 * t));
  vView = cameraPosition - worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

export const TERRAIN_GRASS_FRAGMENT_SHADER = `uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
uniform float uTranslucency;
uniform float uColorVariation;
uniform float uFill;
varying float vHeightFraction;
varying float vTint;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  float t = vHeightFraction;
  vec3 color = mix(uBaseColor, uTipColor, t * t);

  // No two blades in a field are the same green, and one random per blade is
  // what keeps a dense patch from reading as a repeated stamp. The warm half
  // of the spread also dries the blade slightly, which is what a real field
  // does with the ones that catch the most sun.
  float tint = vTint * 2.0 - 1.0;
  color *= 1.0 + tint * uColorVariation * 0.4;
  color = mix(color, color * vec3(1.08, 0.97, 0.78), max(tint, 0.0) * uColorVariation);

  vec3 view = normalize(vView);
  vec3 normal = normalize(vNormal);
  // Both faces of a blade are the same leaf, so the back of one must not go
  // black just because its card was built facing the other way.
  if (dot(normal, view) < 0.0) normal = -normal;
  vec3 sun = normalize(uSunDirection);

  // Wrapped diffuse. A leaf is thin enough that its terminator is soft, and a
  // hard Lambert edge across a blade a centimetre wide is only a black band.
  float wrap = dot(normal, sun) * 0.5 + 0.5;
  // Occlusion down at the root, where a blade meets the ground and its
  // neighbours. Without it a field reads as cut-outs standing on a plane.
  float rootShade = mix(0.5, 1.0, t);
  // Sun coming through the blade from the far side. A leaf glowing when it
  // stands between the eye and the light is most of what says "plant" rather
  // than "painted card".
  float through =
    pow(clamp(dot(-sun, view), 0.0, 1.0), 3.0) * uTranslucency * mix(0.3, 1.0, t);

  vec3 sunLight = uSunColor * uSunIntensity;
  // Foliage under an open sky is never unlit. A Scene lit only through its
  // skybox hands this shader no sun and no ambient at all, and grass that
  // answered only to those came out as black strands over lit ground.
  vec3 skyLight =
    uAmbientColor * uAmbientIntensity + mix(vec3(1.0), uSunColor, 0.6) * uFill;
  vec3 light =
    skyLight * mix(0.62, 1.0, normal.y * 0.5 + 0.5) * rootShade +
    sunLight * wrap * rootShade +
    sunLight * through;

  gl_FragColor = vec4(color * light, 1.0);
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
    `function xriftTerrainGrassPlace(terrain${terrainType}, layer${layerType}, maxInstances${num}, clumpSize${num}, clumpRadius${num}) {`,
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
    `  const tuftSize = Math.max(Math.floor(clumpSize), 1);`,
    `  const tuftRadius = Math.max(clumpRadius, 0);`,
    `  const halfWidth = terrain.width / 2;`,
    `  const halfDepth = terrain.depth / 2;`,
    `  for (let index = 0; index < requested; index += 1) {`,
    `    if (positions.length / 3 >= limit) break;`,
    `    const tuft = Math.floor(index / tuftSize);`,
    `    const tuftX = (xriftTerrainGrassHash(layer.seed, tuft, 6) - 0.5) * terrain.width;`,
    `    const tuftZ = (xriftTerrainGrassHash(layer.seed, tuft, 7) - 0.5) * terrain.depth;`,
    `    const spreadAngle = xriftTerrainGrassHash(layer.seed, index, 1) * Math.PI * 2;`,
    `    const spreadRadius = Math.sqrt(xriftTerrainGrassHash(layer.seed, index, 2)) * tuftRadius;`,
    `    const localX = Math.min(`,
    `      Math.max(tuftX + Math.cos(spreadAngle) * spreadRadius, -halfWidth),`,
    `      halfWidth,`,
    `    );`,
    `    const localZ = Math.min(`,
    `      Math.max(tuftZ + Math.sin(spreadAngle) * spreadRadius, -halfDepth),`,
    `      halfDepth,`,
    `    );`,
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
    `    scales.push(0.7 + xriftTerrainGrassHash(layer.seed, index, 4) * 0.6);`,
    `  }`,
    `  return {`,
    `    positions: new Float32Array(positions),`,
    `    rotations: new Float32Array(rotations),`,
    `    scales: new Float32Array(scales),`,
    `    placed: scales.length,`,
    `  };`,
    `}`,
    ``,
    `function xriftTerrainGrassBladeBuffers(cards${num}, segments${num}) {`,
    `  const positions${numberArray} = [];`,
    `  const normals${numberArray} = [];`,
    `  const uvs${numberArray} = [];`,
    `  const indices${numberArray} = [];`,
    `  const rows = Math.max(Math.floor(segments), 2);`,
    `  const cardCount = Math.max(Math.floor(cards), 1);`,
    `  for (let card = 0; card < cardCount; card += 1) {`,
    `    const angle = (Math.PI * card) / cardCount;`,
    `    const normalX = -Math.sin(angle);`,
    `    const normalZ = Math.cos(angle);`,
    `    const cardBase = card * (rows + 1) * 2;`,
    `    for (let step = 0; step <= rows; step += 1) {`,
    `      const t = step / rows;`,
    `      const halfWidth = 0.5 * Math.pow(1 - Math.pow(t, 2.2), 0.55);`,
    `      positions.push(-halfWidth, t, 0);`,
    `      positions.push(halfWidth, t, 0);`,
    `      normals.push(normalX, 0, normalZ, normalX, 0, normalZ);`,
    `      uvs.push(0, t, 1, t);`,
    `    }`,
    `    for (let step = 0; step < rows; step += 1) {`,
    `      const a = cardBase + step * 2;`,
    `      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);`,
    `    }`,
    `  }`,
    `  return { positions, normals, uvs, indices };`,
    `}`,
  ].join("\n");
}
