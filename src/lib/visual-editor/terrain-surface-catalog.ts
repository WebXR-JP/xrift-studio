import type { ClassicR3fMaterialShader } from "./custom-shader-contract";

/**
 * Studio's official Terrain surface presets.
 *
 * A Terrain painted in one flat colour reads as a shape, not as ground. What
 * makes it ground is that the material changes with the form: rock where it is
 * steep, snow where it is high, sand where it meets water. These presets blend
 * by height and slope, both of which the surface already knows from its own
 * geometry — so nothing has to be painted by hand to get a first result.
 *
 * Same shape as the Sky and Water catalogs: the GLSL lives here, the author
 * edits uniform values, and an installed preset is an ordinary Material Asset
 * that the compiler emits through the existing Custom Shader path.
 */
export type TerrainSurfaceCategory = "grassland" | "arid" | "alpine";

export type TerrainSurfaceParameter = {
  uniform: string;
  label: string;
  hint: string;
} & (
  | { kind: "number"; min: number; max: number; step: number }
  | { kind: "color" }
);

export type TerrainSurfaceCatalogEntry = {
  id: string;
  label: string;
  category: TerrainSurfaceCategory;
  description: string;
  parameters: readonly TerrainSurfaceParameter[];
  shader: ClassicR3fMaterialShader;
};

export const TERRAIN_SURFACE_CATALOG_REVISION =
  "xrift-studio-terrain-surfaces@1";
export const TERRAIN_SURFACE_CATALOG_SOURCE_URL =
  "https://github.com/WebXR-JP/xrift-studio";
export const TERRAIN_SURFACE_CATALOG_AUTHOR = "XRift Studio contributors";

/**
 * World position and the geometric normal are all the blend needs: height is
 * the Y of the former, slope is the Y of the latter. Both are carried to the
 * fragment stage so the bands follow the surface rather than the mesh's UVs,
 * which a height-field Terrain does not meaningfully have.
 */
const TERRAIN_SURFACE_VERTEX_SHADER = `varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocalPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vLocalPosition = position;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

/**
 * Shared fragment helpers.
 *
 * The detail noise exists because a blend of three flat colours still reads as
 * plastic at close range. It is value noise at two scales — enough to break up
 * a surface, cheap enough to run over a whole Terrain, and tied to world
 * position so neighbouring Terrains agree along their seam.
 */
const TERRAIN_SURFACE_COMMON_GLSL = `varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vLocalPosition;

uniform vec3 uLowColor;
uniform vec3 uMidColor;
uniform vec3 uHighColor;
uniform vec3 uSlopeColor;
uniform float uLowHeight;
uniform float uHighHeight;
uniform float uBlendSoftness;
uniform float uSlopeStart;
uniform float uSlopeBlend;
uniform float uDetailScale;
uniform float uDetailStrength;
uniform float uAmbient;

float xriftHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float xriftValueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  // Smoothstep weights: linear interpolation between cells leaves visible
  // creases along the lattice.
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = xriftHash(cell);
  float b = xriftHash(cell + vec2(1.0, 0.0));
  float c = xriftHash(cell + vec2(0.0, 1.0));
  float d = xriftHash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

/** Two octaves is the least that stops reading as a single repeating blob. */
float xriftDetail(vec2 p) {
  return xriftValueNoise(p) * 0.65 + xriftValueNoise(p * 2.7) * 0.35;
}

/**
 * The band edges are pushed apart by the softness so that a softness of zero
 * gives a hard line and larger values widen the crossfade symmetrically. A
 * reversed-edge smoothstep is undefined in GLSL ES, so the edges are ordered
 * before use.
 */
float xriftBand(float value, float edge, float softness) {
  // Not named "half": that is a reserved word in GLSL and some drivers reject
  // it even where the spec would allow it.
  float reach = max(softness, 0.0001) * 0.5;
  return smoothstep(edge - reach, edge + reach, value);
}

vec3 xriftTerrainSurfaceColor() {
  float height = vWorldPosition.y;
  vec3 normal = normalize(vWorldNormal);
  // The geometric normal's Y is the cosine of the slope, so 1 is flat and 0 is
  // a cliff. Using it directly avoids an acos per fragment.
  float flatness = clamp(normal.y, 0.0, 1.0);
  float slope = 1.0 - flatness;

  vec2 detailUv = vWorldPosition.xz * max(uDetailScale, 0.0001);
  float detail = (xriftDetail(detailUv) - 0.5) * uDetailStrength;

  // The detail perturbs the height the bands are measured against rather than
  // the final colour, so the boundaries themselves break up instead of staying
  // as clean arcs with noise laid over them.
  float bandedHeight = height + detail * max(uHighHeight - uLowHeight, 0.001);

  float lowEdge = min(uLowHeight, uHighHeight);
  float highEdge = max(uLowHeight, uHighHeight);
  vec3 color = mix(
    uLowColor,
    uMidColor,
    xriftBand(bandedHeight, lowEdge, uBlendSoftness)
  );
  color = mix(color, uHighColor, xriftBand(bandedHeight, highEdge, uBlendSoftness));

  float slopeMask = xriftBand(slope + detail * 0.35, uSlopeStart, uSlopeBlend);
  color = mix(color, uSlopeColor, slopeMask);

  // Unlit, so a fixed key direction stands in for the scene's light. Without
  // it the bands are visible but the form is not.
  float key = clamp(dot(normal, normalize(vec3(0.35, 0.9, 0.25))), 0.0, 1.0);
  return color * (uAmbient + (1.0 - uAmbient) * key);
}`;

const TERRAIN_SURFACE_FRAGMENT_SHADER = `${TERRAIN_SURFACE_COMMON_GLSL}

void main() {
  gl_FragColor = vec4(xriftTerrainSurfaceColor(), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SHARED_PARAMETERS: readonly TerrainSurfaceParameter[] = [
  {
    uniform: "uLowColor",
    kind: "color",
    label: "低い所の色",
    hint: "谷や水際になる高さの色",
  },
  {
    uniform: "uMidColor",
    kind: "color",
    label: "中間の色",
    hint: "地形の大半を占める高さの色",
  },
  {
    uniform: "uHighColor",
    kind: "color",
    label: "高い所の色",
    hint: "尾根や山頂の色",
  },
  {
    uniform: "uSlopeColor",
    kind: "color",
    label: "急斜面の色",
    hint: "傾斜が上限を超えた面に出る色。岩肌になる",
  },
  {
    uniform: "uLowHeight",
    kind: "number",
    min: -128,
    max: 128,
    step: 0.5,
    label: "低い所の境界 (m)",
    hint: "この高さで低い色から中間の色へ移る",
  },
  {
    uniform: "uHighHeight",
    kind: "number",
    min: -128,
    max: 256,
    step: 0.5,
    label: "高い所の境界 (m)",
    hint: "この高さで中間の色から高い色へ移る",
  },
  {
    uniform: "uBlendSoftness",
    kind: "number",
    min: 0,
    max: 40,
    step: 0.5,
    label: "境界のぼかし (m)",
    hint: "0で硬い線、大きいほど広く混ざる",
  },
  {
    uniform: "uSlopeStart",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.02,
    label: "急斜面の始まり",
    hint: "0で平らな面にも出る。大きいほど切り立った面だけになる",
  },
  {
    uniform: "uSlopeBlend",
    kind: "number",
    min: 0.01,
    max: 1,
    step: 0.02,
    label: "急斜面のぼかし",
    hint: "岩肌と地面の境界の広さ",
  },
  {
    uniform: "uDetailScale",
    kind: "number",
    min: 0.005,
    max: 1,
    step: 0.005,
    label: "模様の細かさ",
    hint: "大きいほど細かい斑になる",
  },
  {
    uniform: "uDetailStrength",
    kind: "number",
    min: 0,
    max: 1.5,
    step: 0.05,
    label: "模様の強さ",
    hint: "境界の崩れ方。0で境界がきれいな曲線になる",
  },
  {
    uniform: "uAmbient",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    label: "陰の明るさ",
    hint: "光の当たらない面の明るさ",
  },
];

function surfaceShader(uniforms: {
  id: string;
  uLowColor: string;
  uMidColor: string;
  uHighColor: string;
  uSlopeColor: string;
  uLowHeight: number;
  uHighHeight: number;
  uBlendSoftness: number;
  uSlopeStart: number;
  uSlopeBlend: number;
  uDetailScale: number;
  uDetailStrength: number;
  uAmbient: number;
}): ClassicR3fMaterialShader {
  return {
    kind: "classic-r3f",
    sourceModulePath: `studio://terrain-surface/${uniforms.id}`,
    variants: [
      {
        name: "terrain-surface",
        defines: {},
        // Ground is opaque and single sided: the underside of a height field
        // is never meant to be seen, and drawing it would double the cost.
        side: "front",
        transparent: false,
        depthWrite: true,
      },
    ],
    vertexShader: TERRAIN_SURFACE_VERTEX_SHADER,
    fragmentShader: TERRAIN_SURFACE_FRAGMENT_SHADER,
    uniforms: {
      uLowColor: { kind: "color", value: uniforms.uLowColor },
      uMidColor: { kind: "color", value: uniforms.uMidColor },
      uHighColor: { kind: "color", value: uniforms.uHighColor },
      uSlopeColor: { kind: "color", value: uniforms.uSlopeColor },
      uLowHeight: { kind: "number", value: uniforms.uLowHeight },
      uHighHeight: { kind: "number", value: uniforms.uHighHeight },
      uBlendSoftness: { kind: "number", value: uniforms.uBlendSoftness },
      uSlopeStart: { kind: "number", value: uniforms.uSlopeStart },
      uSlopeBlend: { kind: "number", value: uniforms.uSlopeBlend },
      uDetailScale: { kind: "number", value: uniforms.uDetailScale },
      uDetailStrength: { kind: "number", value: uniforms.uDetailStrength },
      uAmbient: { kind: "number", value: uniforms.uAmbient },
    },
  };
}

export const TERRAIN_SURFACE_CATALOG: readonly TerrainSurfaceCatalogEntry[] = [
  {
    id: "meadow-slopes",
    label: "草地と土",
    category: "grassland",
    description:
      "低地は湿った土、中腹は草、尾根は乾いた草。急斜面には土が出る。起伏のある草原にそのまま使える。",
    parameters: SHARED_PARAMETERS,
    shader: surfaceShader({
      id: "meadow-slopes",
      uLowColor: "#4a5c34",
      uMidColor: "#6b8a3f",
      uHighColor: "#8fa657",
      uSlopeColor: "#6b5b43",
      uLowHeight: 1,
      uHighHeight: 9,
      uBlendSoftness: 4,
      uSlopeStart: 0.42,
      uSlopeBlend: 0.28,
      uDetailScale: 0.08,
      uDetailStrength: 0.5,
      uAmbient: 0.55,
    }),
  },
  {
    id: "desert-dunes",
    label: "砂と岩",
    category: "arid",
    description:
      "低地は明るい砂、高い所ほど赤みが増す。急斜面は露出した岩。砂丘や乾いた台地向け。",
    parameters: SHARED_PARAMETERS,
    shader: surfaceShader({
      id: "desert-dunes",
      uLowColor: "#d9c18f",
      uMidColor: "#c2a06a",
      uHighColor: "#a8794f",
      uSlopeColor: "#7d5c42",
      uLowHeight: 0.5,
      uHighHeight: 12,
      uBlendSoftness: 6,
      uSlopeStart: 0.5,
      uSlopeBlend: 0.22,
      uDetailScale: 0.12,
      uDetailStrength: 0.4,
      uAmbient: 0.62,
    }),
  },
  {
    id: "alpine-snow",
    label: "高山と雪",
    category: "alpine",
    description:
      "低地は針葉樹の色、中腹は岩、稜線から上は雪。急斜面には雪が乗らず岩が出る。山岳地形向け。",
    parameters: SHARED_PARAMETERS,
    shader: surfaceShader({
      id: "alpine-snow",
      uLowColor: "#37452f",
      uMidColor: "#6a6a63",
      uHighColor: "#eef2f6",
      uSlopeColor: "#585c62",
      uLowHeight: 4,
      uHighHeight: 18,
      uBlendSoftness: 5,
      uSlopeStart: 0.46,
      uSlopeBlend: 0.2,
      uDetailScale: 0.07,
      uDetailStrength: 0.55,
      uAmbient: 0.58,
    }),
  },
];

export function getTerrainSurfacePreset(
  id: string,
): TerrainSurfaceCatalogEntry | undefined {
  return TERRAIN_SURFACE_CATALOG.find((entry) => entry.id === id);
}

export function applyTerrainSurfaceParameters(
  entry: TerrainSurfaceCatalogEntry,
  values: Readonly<Record<string, number | string>>,
): ClassicR3fMaterialShader {
  const uniforms = { ...entry.shader.uniforms };
  for (const parameter of entry.parameters) {
    const value = values[parameter.uniform];
    if (value === undefined) continue;
    const current = uniforms[parameter.uniform];
    if (parameter.kind === "number") {
      if (current?.kind !== "number") continue;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      uniforms[parameter.uniform] = {
        kind: "number",
        value: Math.min(Math.max(value, parameter.min), parameter.max),
      };
      continue;
    }
    if (current?.kind !== "color") continue;
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) continue;
    uniforms[parameter.uniform] = { kind: "color", value: value.toLowerCase() };
  }
  return { ...entry.shader, uniforms };
}

export function defaultTerrainSurfaceParameterValues(
  entry: TerrainSurfaceCatalogEntry,
): Record<string, number | string> {
  const values: Record<string, number | string> = {};
  for (const parameter of entry.parameters) {
    const uniform = entry.shader.uniforms[parameter.uniform];
    if (parameter.kind === "number" && uniform?.kind === "number") {
      values[parameter.uniform] = uniform.value;
    } else if (parameter.kind === "color" && uniform?.kind === "color") {
      values[parameter.uniform] = uniform.value;
    }
  }
  return values;
}

/**
 * Fits a preset's height bands to a Terrain's actual elevation range.
 *
 * A preset ships with absolute metres, but a Terrain may span two metres or
 * eighty. Applied unchanged, every band edge would sit outside the range and
 * the surface would come out one flat colour — the failure looks like the
 * shader is broken rather than mistuned. Rescaling by the observed range makes
 * the first application land in a usable place on any Terrain.
 */
export function fitTerrainSurfaceToRange(
  entry: TerrainSurfaceCatalogEntry,
  range: { min: number; max: number },
): Record<string, number | string> {
  const values = defaultTerrainSurfaceParameterValues(entry);
  const span = range.max - range.min;
  if (!Number.isFinite(span) || span <= 0.001) return values;
  const low = entry.shader.uniforms.uLowHeight;
  const high = entry.shader.uniforms.uHighHeight;
  if (low?.kind !== "number" || high?.kind !== "number") return values;
  const presetSpan = high.value - low.value;
  if (presetSpan <= 0.001) return values;

  // Keep the preset's proportions, but express them in this Terrain's range.
  const lowFraction = 0.25;
  const highFraction = 0.72;
  values.uLowHeight = Number((range.min + span * lowFraction).toFixed(3));
  values.uHighHeight = Number((range.min + span * highFraction).toFixed(3));

  // The softness must stay well inside the gap between the two edges. Scaling
  // it by the range alone lets it grow wider than that gap on a tall Terrain,
  // and then both bands are part-open everywhere: the middle colour never
  // reaches full strength and the whole surface washes out to one blend. Half
  // the gap keeps each band fully closed before the next one starts to open.
  const softness = entry.shader.uniforms.uBlendSoftness;
  if (softness?.kind === "number") {
    const gap = span * (highFraction - lowFraction);
    const scaled = (softness.value / presetSpan) * span;
    values.uBlendSoftness = Number(
      Math.min(Math.max(scaled, 0.05), gap * 0.5).toFixed(3),
    );
  }
  return values;
}
