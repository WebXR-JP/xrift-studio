import type { ClassicR3fMaterialShader } from "./custom-shader-contract";
import { WIND_CONTRACT_GLSL_UNIFORMS } from "./wind-contract";

/**
 * Studio's official Water presets.
 *
 * Same shape as the Sky catalog: the GLSL lives here and the author edits
 * uniform values, so an installed preset is an ordinary Material Asset that
 * the Inspector can retune and the compiler emits through the existing
 * Custom Shader path.
 *
 * Water is not a scene slot. It is assigned to a mesh like any other Material,
 * so a pond and an ocean are the same preset on differently sized planes.
 *
 * Waves are driven by the shared wind contract rather than a per-material
 * speed, so water and foliage in one scene always move with the same air.
 */
export type WaterShaderCatalogCategory = "lake" | "ocean" | "stylized";

export type WaterShaderParameter = {
  uniform: string;
  label: string;
  hint: string;
} & (
  | { kind: "number"; min: number; max: number; step: number }
  | { kind: "color" }
);

export type WaterShaderCatalogEntry = {
  id: string;
  label: string;
  category: WaterShaderCatalogCategory;
  description: string;
  parameters: readonly WaterShaderParameter[];
  shader: ClassicR3fMaterialShader;
};

export const WATER_SHADER_CATALOG_REVISION = "xrift-studio-water-shaders@1";
export const WATER_SHADER_CATALOG_SOURCE_URL =
  "https://github.com/WebXR-JP/xrift-studio";
export const WATER_SHADER_CATALOG_AUTHOR = "XRift Studio contributors";

/**
 * The mesh is not subdivided — a built-in plane is a single quad — so the
 * waves live entirely in the normal. The vertex stage only forwards what the
 * fragment stage needs to rebuild them.
 */
const WATER_VERTEX_SHADER = `varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`;

/**
 * Gerstner waves and the shared surface math.
 *
 * `xriftWaterGerstner` is adapted from Mochie's Unity Shaders
 * (MIT, Copyright (c) 2020 MochiesCode,
 * https://github.com/MochiesCode/Mochies-Unity-Shaders),
 * translated from HLSL to GLSL with the Unity-specific plumbing removed. The
 * dispersion relation, the amplitude/steepness relation and the analytic
 * tangent and binormal derivatives are the parts that carry over unchanged;
 * everything Unity supplied around them — tessellation, GrabPass refraction,
 * reflection probes, depth-buffer foam — has no counterpart here.
 */
const WATER_COMMON_GLSL = `const float XRIFT_WATER_TAU = 6.28318530718;
const float XRIFT_WATER_GRAVITY = 9.8;

vec2 xriftWaterRotate(vec2 direction, float radiansAngle) {
  float c = cos(radiansAngle);
  float s = sin(radiansAngle);
  return vec2(c * direction.x - s * direction.y, s * direction.x + c * direction.y);
}

/**
 * One Gerstner wave. Returns the displacement and accumulates the analytic
 * derivatives, so the surface normal never needs finite differences.
 */
vec3 xriftWaterGerstner(
  vec2 waveDirection,
  float steepness,
  float wavelength,
  float phase,
  vec3 point,
  inout vec3 tangent,
  inout vec3 binormal
) {
  float k = XRIFT_WATER_TAU / max(wavelength, 0.001);
  float c = sqrt(XRIFT_WATER_GRAVITY / k);
  vec2 d = normalize(waveDirection);
  float f = k * (dot(d, point.xz) - c * phase);
  // Steepness above one folds the wave through itself, so it is clamped
  // rather than left to the author to discover as a rendering artifact.
  float s = clamp(steepness, 0.0, 1.0);
  float a = s / k;
  float sinF = sin(f);
  float cosF = cos(f);
  tangent += vec3(
    -d.x * d.x * (s * sinF),
    d.x * (s * cosF),
    -d.x * d.y * (s * sinF)
  );
  binormal += vec3(
    -d.x * d.y * (s * sinF),
    d.y * (s * cosF),
    -d.y * d.y * (s * sinF)
  );
  return vec3(d.x * a * cosF, a * sinF, d.y * a * cosF);
}

float xriftWaterHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}

float xriftWaterNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(xriftWaterHash(cell), xriftWaterHash(cell + vec2(1.0, 0.0)), f.x),
    mix(xriftWaterHash(cell + vec2(0.0, 1.0)), xriftWaterHash(cell + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

/**
 * Tiled high-frequency ripples on top of the Gerstner swell.
 *
 * The Gerstner layers alone give a large, smooth surface: correct in shape but
 * empty between the crests, which is what makes a big water plane read as
 * plastic. This is the detail a tiling normal map would normally supply, done
 * procedurally so a preset needs no bundled texture.
 *
 * Tiling is in world units rather than UV, so scaling the mesh changes how
 * much water there is instead of stretching the ripples across it. Two octaves
 * drift at different rates, so the repeat never reads as a stamped tile.
 */
vec3 xriftWaterDetailNormal(
  vec2 worldXZ,
  float scale,
  float strength,
  vec2 windDirection,
  float time
) {
  if (strength <= 0.0) {
    return vec3(0.0, 1.0, 0.0);
  }
  vec2 uv = worldXZ * max(scale, 0.0001);
  vec2 drift = windDirection * time * 0.35;
  vec2 a = uv + drift;
  vec2 b = uv * 1.93 - drift * 0.61;
  float epsilon = 0.35;
  float height = xriftWaterNoise(a) + xriftWaterNoise(b) * 0.5;
  float alongX =
    xriftWaterNoise(a + vec2(epsilon, 0.0)) + xriftWaterNoise(b + vec2(epsilon, 0.0)) * 0.5;
  float alongZ =
    xriftWaterNoise(a + vec2(0.0, epsilon)) + xriftWaterNoise(b + vec2(0.0, epsilon)) * 0.5;
  return normalize(
    vec3(-(alongX - height) * strength, 1.0, -(alongZ - height) * strength)
  );
}

/** Approximated sky reflection. No render pass — the author matches the Sky. */
vec3 xriftWaterSkyReflection(vec3 reflectDirection, vec3 zenith, vec3 horizon) {
  float up = clamp(reflectDirection.y * 0.5 + 0.5, 0.0, 1.0);
  return mix(horizon, zenith, pow(up, 1.3));
}

vec3 xriftWaterSunDirection(float azimuthDegrees, float elevationDegrees) {
  float azimuth = radians(azimuthDegrees);
  float elevation = radians(elevationDegrees);
  float horizontal = cos(elevation);
  return vec3(horizontal * cos(azimuth), sin(elevation), horizontal * sin(azimuth));
}`;

/**
 * Layer seeds. Raising the layer count adds waves without moving the ones
 * already on screen, the same rule the Sky's star layers follow.
 */
const WATER_WAVE_ACCUMULATION_GLSL = `  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  vec3 displacement = vec3(0.0);
  float amplitudeSum = 0.0;
  vec2 windDirection = length(uWindDirection) > 0.0001
    ? normalize(uWindDirection)
    : vec2(1.0, 0.0);
  float phase = uTime * uWindSpeed;
  float baseWavelength = 12.0 / max(uWaveScale, 0.05);
  float steepness = clamp(uWaveHeight, 0.0, 1.0);
  float layers = clamp(uWaveLayers, 1.0, 4.0);
  float gust = 1.0 + uWindTurbulence * 0.6 * sin(phase * 0.37);

  displacement += xriftWaterGerstner(
    windDirection, steepness, baseWavelength, phase, vWorldPosition, tangent, binormal
  );
  amplitudeSum += steepness * baseWavelength / XRIFT_WATER_TAU;
  if (layers >= 2.0) {
    displacement += xriftWaterGerstner(
      xriftWaterRotate(windDirection, 0.6458), steepness * 0.72, baseWavelength * 0.53,
      phase * 1.31 * gust, vWorldPosition, tangent, binormal
    );
    amplitudeSum += steepness * 0.72 * baseWavelength * 0.53 / XRIFT_WATER_TAU;
  }
  if (layers >= 3.0) {
    displacement += xriftWaterGerstner(
      xriftWaterRotate(windDirection, -1.0123), steepness * 0.48, baseWavelength * 0.27,
      phase * 1.73 * gust, vWorldPosition, tangent, binormal
    );
    amplitudeSum += steepness * 0.48 * baseWavelength * 0.27 / XRIFT_WATER_TAU;
  }
  if (layers >= 4.0) {
    displacement += xriftWaterGerstner(
      xriftWaterRotate(windDirection, 1.9548), steepness * 0.31, baseWavelength * 0.13,
      phase * 2.15 * gust, vWorldPosition, tangent, binormal
    );
    amplitudeSum += steepness * 0.31 * baseWavelength * 0.13 / XRIFT_WATER_TAU;
  }

  vec3 detailNormal = xriftWaterDetailNormal(
    vWorldPosition.xz, uDetailScale, uDetailStrength, windDirection, phase
  );
  vec3 waveNormal = normalize(
    cross(binormal, tangent) + vec3(detailNormal.x, 0.0, detailNormal.z)
  );
  // A wall assigned this Material keeps its own facing; only a surface that
  // actually points up gets the full wave normal.
  vec3 normal = normalize(mix(vWorldNormal, waveNormal, clamp(abs(vWorldNormal.y), 0.0, 1.0)));
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float ndv = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, max(uFresnelPower, 0.1));
  vec3 skyColor = xriftWaterSkyReflection(
    reflect(-viewDirection, normal), uZenithColor, uHorizonColor
  );
  vec3 sunDirection = xriftWaterSunDirection(uSunAzimuth, uSunElevation);
  vec3 halfVector = normalize(sunDirection + viewDirection);
  float glint = pow(clamp(dot(normal, halfVector), 0.0, 1.0), mix(400.0, 48.0, steepness));
  float crest = clamp(displacement.y / max(amplitudeSum, 0.0001), -1.0, 1.0);`;

const WATER_UNIFORM_BLOCK = `uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform float uOpacity;
uniform float uWaveHeight;
uniform float uWaveScale;
uniform float uWaveLayers;
uniform float uFresnelPower;
uniform float uReflectivity;
uniform float uDetailScale;
uniform float uDetailStrength;
uniform float uGlintStrength;
uniform float uSunAzimuth;
uniform float uSunElevation;
uniform float uTime;
${WIND_CONTRACT_GLSL_UNIFORMS}
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;`;

const CALM_FRAGMENT_SHADER = `${WATER_UNIFORM_BLOCK}

${WATER_COMMON_GLSL}

void main() {
${WATER_WAVE_ACCUMULATION_GLSL}

  vec3 body = mix(uShallowColor, uDeepColor, pow(ndv, 0.7));
  vec3 color = mix(body, skyColor, clamp(fresnel * uReflectivity, 0.0, 1.0));
  color += uSunColor * glint * uGlintStrength;

  gl_FragColor = vec4(color, clamp(uOpacity, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const OCEAN_FRAGMENT_SHADER = `${WATER_UNIFORM_BLOCK}
uniform vec3 uFoamColor;
uniform float uFoamAmount;
uniform float uFoamSharpness;

${WATER_COMMON_GLSL}

void main() {
${WATER_WAVE_ACCUMULATION_GLSL}

  vec3 body = mix(uShallowColor, uDeepColor, pow(ndv, 0.7));
  vec3 color = mix(body, skyColor, clamp(fresnel * uReflectivity, 0.0, 1.0));
  color += uSunColor * glint * uGlintStrength;

  // Without a depth buffer there is no shoreline to read, so the foam comes
  // from the wave crests themselves. It is honest about what it can see.
  float threshold = 1.0 - clamp(uFoamAmount, 0.0, 1.0) * 2.0;
  float foam = smoothstep(threshold, threshold + max(uFoamSharpness, 0.01), crest);
  color = mix(color, uFoamColor, clamp(foam, 0.0, 1.0));

  gl_FragColor = vec4(color, clamp(uOpacity, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const TOON_FRAGMENT_SHADER = `${WATER_UNIFORM_BLOCK}
uniform vec3 uFoamColor;
uniform float uBandCount;
uniform float uFoamAmount;

${WATER_COMMON_GLSL}

void main() {
${WATER_WAVE_ACCUMULATION_GLSL}

  float bands = max(uBandCount, 2.0);
  // Quantize the shading terms, not the final colour, so the bands land on
  // the wave shape rather than on the lighting that happens to be there.
  float shade = floor(clamp(ndv, 0.0, 1.0) * bands) / bands;
  float bandedFresnel = floor(clamp(fresnel, 0.0, 1.0) * bands) / bands;
  vec3 body = mix(uShallowColor, uDeepColor, shade);
  vec3 color = mix(body, skyColor, clamp(bandedFresnel * uReflectivity, 0.0, 1.0));

  // Quantized shading swallows a smooth ripple: a small normal change rarely
  // crosses a band edge, so the tiling detail has to enter through the crest
  // term, where it becomes banded ripple shapes instead of disappearing.
  float ripple = (detailNormal.x + detailNormal.z) * 0.5;
  float bandedCrest =
    floor(clamp(crest * 0.5 + 0.5 + ripple * 0.75, 0.0, 1.0) * bands) / bands;
  float foam = step(1.0 - clamp(uFoamAmount, 0.0, 1.0), bandedCrest);
  color = mix(color, uFoamColor, foam);

  gl_FragColor = vec4(color, clamp(uOpacity, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function waterVariants(): ClassicR3fMaterialShader["variants"] {
  return [
    {
      name: "water",
      defines: {},
      // Double sided so a camera under the surface still sees it, and no depth
      // write so the scene behind stays visible through the transparency.
      side: "double",
      transparent: true,
      depthWrite: false,
    },
  ];
}

/** Uniforms every preset shares, including the wind contract's inputs. */
function waterBaseUniforms(): ClassicR3fMaterialShader["uniforms"] {
  return {
    uTime: { kind: "number", value: 0 },
    uWindDirection: { kind: "vector", value: [1, 0] },
    uWindSpeed: { kind: "number", value: 0 },
    uWindTurbulence: { kind: "number", value: 0 },
    uSunAzimuth: { kind: "number", value: 128 },
    uSunElevation: { kind: "number", value: 42 },
    uSunColor: { kind: "color", value: "#fff4dc" },
  };
}

const WAVE_PARAMETERS: readonly WaterShaderParameter[] = [
  {
    uniform: "uWaveLayers",
    label: "波の重ね数",
    hint: "重ねるGerstner波の数です。増やすほど細かい波が乗り、負荷も上がります。",
    kind: "number",
    min: 1,
    max: 4,
    step: 1,
  },
  {
    uniform: "uWaveHeight",
    label: "波の高さ",
    hint: "波の急峻さです。1に近づくほど尖ります。",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    uniform: "uWaveScale",
    label: "波の細かさ",
    hint: "大きいほど波長が短く、細かい波になります。",
    kind: "number",
    min: 0.05,
    max: 6,
    step: 0.05,
  },
];

/**
 * The tiling detail. Kept next to the wave controls because it is the second
 * half of the surface: the Gerstner layers give the swell, these give the
 * texture between the crests.
 */
const DETAIL_PARAMETERS: readonly WaterShaderParameter[] = [
  {
    uniform: "uDetailScale",
    label: "さざ波のタイリング",
    hint: "1ワールド単位あたりの細かいさざ波の density です。ワールド座標なので、メッシュを大きくしても伸びません。",
    kind: "number",
    min: 0.01,
    max: 3,
    step: 0.01,
  },
  {
    uniform: "uDetailStrength",
    label: "さざ波の強さ",
    hint: "細かいさざ波の凹凸です。0で大きなうねりだけになります。",
    kind: "number",
    min: 0,
    max: 3,
    step: 0.05,
  },
];

const SURFACE_PARAMETERS: readonly WaterShaderParameter[] = [
  {
    uniform: "uReflectivity",
    label: "反射の強さ",
    hint: "空の色をどれだけ映すかです。実反射ではなく空色の近似です。",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    uniform: "uFresnelPower",
    label: "縁の反射",
    hint: "浅い角度で反射が強まる度合いです。",
    kind: "number",
    min: 0.5,
    max: 8,
    step: 0.1,
  },
  {
    uniform: "uOpacity",
    label: "不透明度",
    hint: "水面の不透明度です。",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    uniform: "uGlintStrength",
    label: "太陽のきらめき",
    hint: "水面に走る太陽の反射の強さです。",
    kind: "number",
    min: 0,
    max: 4,
    step: 0.05,
  },
];

const COLOR_PARAMETERS: readonly WaterShaderParameter[] = [
  {
    uniform: "uShallowColor",
    label: "浅い部分の色",
    hint: "浅い角度から見たときの水の色です。",
    kind: "color",
  },
  {
    uniform: "uDeepColor",
    label: "深い部分の色",
    hint: "真上から見下ろしたときの水の色です。",
    kind: "color",
  },
  {
    uniform: "uZenithColor",
    label: "映り込む天頂の色",
    hint: "反射に使う空の色です。Sceneの空Shaderに合わせてください。",
    kind: "color",
  },
  {
    uniform: "uHorizonColor",
    label: "映り込む地平線の色",
    hint: "反射に使う地平線の色です。",
    kind: "color",
  },
];

export const WATER_SHADER_CATALOG: readonly WaterShaderCatalogEntry[] = [
  {
    id: "calm-lake",
    label: "Calm Lake",
    category: "lake",
    description:
      "静かな湖面です。波は小さく反射は控えめ。風の向きと速さはScene設定のWindから受け取るので、草と同じ風で動きます。",
    parameters: [
      ...WAVE_PARAMETERS,
      ...DETAIL_PARAMETERS,
      ...SURFACE_PARAMETERS,
      ...COLOR_PARAMETERS,
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://water-shader/calm-lake",
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: CALM_FRAGMENT_SHADER,
      uniforms: {
        ...waterBaseUniforms(),
        uShallowColor: { kind: "color", value: "#5d9bb0" },
        uDeepColor: { kind: "color", value: "#123a4d" },
        uZenithColor: { kind: "color", value: "#2c6fd1" },
        uHorizonColor: { kind: "color", value: "#bcd9f2" },
        uOpacity: { kind: "number", value: 0.94 },
        uWaveHeight: { kind: "number", value: 0.16 },
        uWaveScale: { kind: "number", value: 1.4 },
        uWaveLayers: { kind: "number", value: 2 },
        uFresnelPower: { kind: "number", value: 4 },
        uReflectivity: { kind: "number", value: 0.55 },
        uDetailScale: { kind: "number", value: 0.55 },
        uDetailStrength: { kind: "number", value: 0.9 },
        uGlintStrength: { kind: "number", value: 0.8 },
      },
      variants: waterVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "ocean-waves",
    label: "Ocean Waves",
    category: "ocean",
    description:
      "うねりと白波のある海です。白波は深度バッファではなく波の峰から出しているので、岸際ではなく波頭に乗ります。重ね数を上げるほど細かい波が増えます。",
    parameters: [
      ...WAVE_PARAMETERS,
      ...DETAIL_PARAMETERS,
      {
        uniform: "uFoamAmount",
        label: "白波の量",
        hint: "波頭に乗る白波の量です。0で消えます。",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.02,
      },
      {
        uniform: "uFoamSharpness",
        label: "白波の輪郭",
        hint: "小さいほど白波の縁がはっきりします。",
        kind: "number",
        min: 0.01,
        max: 1,
        step: 0.01,
      },
      ...SURFACE_PARAMETERS,
      ...COLOR_PARAMETERS,
      {
        uniform: "uFoamColor",
        label: "白波の色",
        hint: "白波の色です。",
        kind: "color",
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://water-shader/ocean-waves",
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: OCEAN_FRAGMENT_SHADER,
      uniforms: {
        ...waterBaseUniforms(),
        uShallowColor: { kind: "color", value: "#2f8fa8" },
        uDeepColor: { kind: "color", value: "#0a2740" },
        uZenithColor: { kind: "color", value: "#2560c4" },
        uHorizonColor: { kind: "color", value: "#a8c8e8" },
        uFoamColor: { kind: "color", value: "#f2f7fb" },
        uOpacity: { kind: "number", value: 0.97 },
        uWaveHeight: { kind: "number", value: 0.42 },
        uWaveScale: { kind: "number", value: 0.9 },
        uWaveLayers: { kind: "number", value: 3 },
        uFresnelPower: { kind: "number", value: 3.4 },
        uReflectivity: { kind: "number", value: 0.68 },
        uDetailScale: { kind: "number", value: 0.32 },
        uDetailStrength: { kind: "number", value: 1.3 },
        uGlintStrength: { kind: "number", value: 1.4 },
        uFoamAmount: { kind: "number", value: 0.34 },
        uFoamSharpness: { kind: "number", value: 0.22 },
      },
      variants: waterVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "stylized-toon",
    label: "Stylized Toon",
    category: "stylized",
    description:
      "セルルックの水面です。陰影と反射を段階に量子化し、波頭を面で白く抜きます。段数を下げるほど絵画的になります。",
    parameters: [
      {
        uniform: "uBandCount",
        label: "色の段数",
        hint: "陰影を何段に分けるかです。少ないほどはっきりした絵になります。",
        kind: "number",
        min: 2,
        max: 8,
        step: 1,
      },
      ...WAVE_PARAMETERS,
      ...DETAIL_PARAMETERS,
      {
        uniform: "uFoamAmount",
        label: "白い波頭の量",
        hint: "白く抜く波頭の量です。0で消えます。",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.02,
      },
      ...SURFACE_PARAMETERS,
      ...COLOR_PARAMETERS,
      {
        uniform: "uFoamColor",
        label: "波頭の色",
        hint: "白く抜く部分の色です。",
        kind: "color",
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://water-shader/stylized-toon",
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: TOON_FRAGMENT_SHADER,
      uniforms: {
        ...waterBaseUniforms(),
        uShallowColor: { kind: "color", value: "#7fd4e8" },
        uDeepColor: { kind: "color", value: "#1c5f8f" },
        uZenithColor: { kind: "color", value: "#4a97e0" },
        uHorizonColor: { kind: "color", value: "#cfe9f7" },
        uFoamColor: { kind: "color", value: "#ffffff" },
        uOpacity: { kind: "number", value: 1 },
        uWaveHeight: { kind: "number", value: 0.3 },
        uWaveScale: { kind: "number", value: 1.1 },
        uWaveLayers: { kind: "number", value: 2 },
        uFresnelPower: { kind: "number", value: 3 },
        uReflectivity: { kind: "number", value: 0.4 },
        uDetailScale: { kind: "number", value: 0.4 },
        uDetailStrength: { kind: "number", value: 0.9 },
        uGlintStrength: { kind: "number", value: 0 },
        uBandCount: { kind: "number", value: 4 },
        uFoamAmount: { kind: "number", value: 0.3 },
      },
      variants: waterVariants(),
      animatedTimeUniform: "uTime",
    },
  },
];

export const WATER_SHADER_CATEGORIES = [
  "lake",
  "ocean",
  "stylized",
] as const satisfies readonly WaterShaderCatalogCategory[];

export function waterShaderCategoryLabel(
  category: WaterShaderCatalogCategory,
): string {
  if (category === "lake") return "湖";
  if (category === "ocean") return "海";
  return "セルルック";
}

export function getWaterShaderCatalogEntry(
  entryId: string,
): WaterShaderCatalogEntry | undefined {
  return WATER_SHADER_CATALOG.find((entry) => entry.id === entryId);
}

/** Applies store-side edits. Unknown names and kind mismatches are dropped. */
export function applyWaterShaderParameters(
  entry: WaterShaderCatalogEntry,
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

export function defaultWaterShaderParameterValues(
  entry: WaterShaderCatalogEntry,
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
