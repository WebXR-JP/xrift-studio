import type { ClassicR3fMaterialShader } from "./custom-shader-contract";

/**
 * Studio's official Sky Shader presets.
 *
 * Every entry is a plain Classic R3F Custom Shader, so an installed preset is
 * an ordinary Material Asset: the Inspector edits its GLSL and its uniform
 * values, and the compiler emits it through the same path as any other custom
 * shader. Nothing here is a preset-only feature the author cannot reach later.
 *
 * The star count is an actual count rather than a density: each layer converts
 * it against its own cell budget (4pi * scale^2 cells over the sphere), so the
 * value an author types is roughly the number of stars the sky draws.
 *
 * Presets that share a look share a program. The four scenery presets are one
 * fragment shader with different uniform defaults, so a daylight sky and a
 * sunset are the same authored surface rather than four near-copies of GLSL.
 */
export type SkyShaderCatalogCategory =
  | "day"
  | "dusk"
  | "dawn"
  | "night"
  | "aurora"
  | "space";

export type SkyShaderParameter = {
  /** Uniform this control writes. Must exist in the entry's shader. */
  uniform: string;
  label: string;
  hint: string;
} & (
  | { kind: "number"; min: number; max: number; step: number }
  | { kind: "color" }
);

export type SkyShaderCatalogEntry = {
  id: string;
  label: string;
  category: SkyShaderCatalogCategory;
  description: string;
  /** Controls surfaced in the store. The Inspector still shows every uniform. */
  parameters: readonly SkyShaderParameter[];
  shader: ClassicR3fMaterialShader;
};

export const SKY_SHADER_CATALOG_REVISION = "xrift-studio-sky-shaders@2";
export const SKY_SHADER_CATALOG_SOURCE_URL =
  "https://github.com/WebXR-JP/xrift-studio";
export const SKY_SHADER_CATALOG_AUTHOR = "XRift Studio contributors";

/**
 * Direction from the capture center, matching the built-in sky. `uCenter` lets
 * the Box and Dome projections keep their tripod origin.
 */
const SKY_VERTEX_SHADER = `uniform vec3 uCenter;
varying vec3 vDirection;

void main() {
  vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 worldCenter = (modelMatrix * vec4(uCenter, 1.0)).xyz;
  vDirection = worldPosition - worldCenter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Hashes, value noise, star cells and the Y rotation shared by every preset. */
const SKY_COMMON_GLSL = `const float XRIFT_SKY_TAU = 6.28318530718;
const float XRIFT_SKY_SPHERE_CELLS = 12.56637061;

float xriftSkyHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 xriftSkyHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float xriftSkyNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = xriftSkyHash13(cell);
  float n100 = xriftSkyHash13(cell + vec3(1.0, 0.0, 0.0));
  float n010 = xriftSkyHash13(cell + vec3(0.0, 1.0, 0.0));
  float n110 = xriftSkyHash13(cell + vec3(1.0, 1.0, 0.0));
  float n001 = xriftSkyHash13(cell + vec3(0.0, 0.0, 1.0));
  float n101 = xriftSkyHash13(cell + vec3(1.0, 0.0, 1.0));
  float n011 = xriftSkyHash13(cell + vec3(0.0, 1.0, 1.0));
  float n111 = xriftSkyHash13(cell + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float xriftSkyFbm(vec3 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int index = 0; index < 3; index += 1) {
    total += xriftSkyNoise(p) * amplitude;
    p *= 2.03;
    amplitude *= 0.5;
  }
  return total;
}

vec3 xriftSkyRotateY(vec3 direction, float radiansAngle) {
  float c = cos(radiansAngle);
  float s = sin(radiansAngle);
  return vec3(
    c * direction.x - s * direction.z,
    direction.y,
    s * direction.x + c * direction.z
  );
}

/** Direction of a sun or moon placed by compass azimuth and elevation. */
vec3 xriftSkyBodyDirection(float azimuthDegrees, float elevationDegrees) {
  float azimuth = radians(azimuthDegrees);
  float elevation = radians(elevationDegrees);
  float horizontal = cos(elevation);
  return vec3(horizontal * cos(azimuth), sin(elevation), horizontal * sin(azimuth));
}

/**
 * One star per cell of a direction-space grid. \`count\` is the number of stars
 * wanted over the whole sphere; it becomes the probability that a given cell
 * holds one, so raising it adds stars without moving the existing ones.
 */
float xriftSkyStarLayer(
  vec3 direction,
  float scale,
  float count,
  float size,
  float time,
  float twinkleSpeed
) {
  vec3 p = direction * scale;
  // Screen-space derivatives are read before the per-cell branch below, where
  // control flow stops being uniform. They set the floor on a star's radius so
  // one never falls below a pixel and disappears in a small preview.
  float pixelRadius = length(fwidth(p)) * 0.45;
  float density = clamp(
    count / max(XRIFT_SKY_SPHERE_CELLS * scale * scale, 1.0),
    0.0,
    1.0
  );
  if (density <= 0.0) {
    return 0.0;
  }
  vec3 cell = floor(p);
  vec3 rnd = xriftSkyHash33(cell);
  if (rnd.x > density) {
    return 0.0;
  }
  vec3 local = fract(p) - 0.5;
  vec3 jitter = (xriftSkyHash33(cell + 19.19) - 0.5) * 0.5;
  float brightness = 0.25 + 0.75 * rnd.y;
  float radius = max(size * (0.45 + 0.55 * rnd.z), pixelRadius);
  float dist = length(local - jitter);
  // A star smaller than a pixel disappears entirely at preview sizes, so the
  // core carries a soft halo several radii wide that survives downsampling.
  float core = 1.0 - smoothstep(0.0, radius, dist);
  float squaredRadius = radius * radius;
  float halo = squaredRadius / (squaredRadius + dist * dist);
  float twinkle =
    0.62 + 0.38 * sin(time * twinkleSpeed * (0.5 + rnd.z * 1.8) + rnd.y * XRIFT_SKY_TAU);
  return (core * core * 0.85 + halo * halo * 0.55) * brightness * twinkle;
}

/** Sums the three star layers so a preset only spends one call on them. */
float xriftSkyStarField(
  vec3 direction,
  float count,
  float size,
  float time,
  float twinkleSpeed
) {
  return xriftSkyStarLayer(direction, 42.0, count * 0.5, size, time, twinkleSpeed)
    + xriftSkyStarLayer(direction, 78.0, count * 0.32, size * 0.8, time, twinkleSpeed * 1.4) * 0.7
    + xriftSkyStarLayer(direction, 134.0, count * 0.18, size * 0.62, time, twinkleSpeed * 0.8) * 0.45;
}

/**
 * Distant ridgeline. Returns 1 below the silhouette and 0 above it. The noise
 * is sampled around a circle, so the ridge closes on itself without a seam
 * where the first and last degree of azimuth meet.
 */
float xriftSkyRidgeMask(vec3 direction, float height, float roughness, float seed) {
  float azimuth = atan(direction.z, direction.x);
  vec3 ring = vec3(cos(azimuth), sin(azimuth), seed) * max(roughness, 0.05);
  float ridge = xriftSkyFbm(ring * 2.6) * 0.72 + xriftSkyFbm(ring * 6.1) * 0.28;
  float silhouette = height * (0.25 + ridge * 1.35);
  return 1.0 - smoothstep(silhouette - 0.006, silhouette + 0.006, direction.y);
}

/** Disc coverage in x and the surrounding glow in y, for a sun or a moon. */
vec2 xriftSkyCelestial(
  vec3 direction,
  vec3 bodyDirection,
  float angularRadius,
  float glowFalloff
) {
  float angle = acos(clamp(dot(direction, bodyDirection), -1.0, 1.0));
  float radius = max(angularRadius, 0.002);
  float disc = 1.0 - smoothstep(radius * 0.86, radius, angle);
  float glow = exp(-angle / max(glowFalloff, 0.002));
  return vec2(disc, glow);
}

/**
 * Moon disc shading: the phase terminator plus surface mottling. \`phase\` runs
 * 0 (new) to 1 (full); the terminator is the standard ellipse, so a half moon
 * is a straight edge and a crescent bows the way the real one does.
 */
float xriftSkyMoonShade(
  vec3 direction,
  vec3 moonDirection,
  float angularRadius,
  float phase
) {
  vec3 reference = abs(moonDirection.y) > 0.99
    ? vec3(0.0, 0.0, 1.0)
    : vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(reference, moonDirection));
  vec3 up = cross(moonDirection, right);
  float radius = max(angularRadius, 0.002);
  float u = dot(direction, right) / radius;
  float v = dot(direction, up) / radius;
  float terminator =
    (1.0 - 2.0 * clamp(phase, 0.0, 1.0)) * sqrt(max(1.0 - v * v, 0.0));
  float lit = smoothstep(terminator - 0.09, terminator + 0.09, u);
  float mottle = xriftSkyFbm(vec3(u, v, 3.0) * 2.4);
  // Earthshine keeps the unlit limb faintly readable instead of pure black.
  return mix(0.07, 1.0, lit) * (0.78 + 0.34 * mottle);
}

/** Cloud cover on a flat plane above the viewer, drifting with time. */
float xriftSkyClouds(
  vec3 direction,
  float coverage,
  float scale,
  float time,
  float speed
) {
  if (direction.y <= 0.008) {
    return 0.0;
  }
  vec2 plane = direction.xz / (direction.y + 0.14);
  vec3 p = vec3(plane.x, plane.y, 0.0) * max(scale, 0.05);
  p.x += time * speed * 0.03;
  float density = xriftSkyFbm(p) + xriftSkyFbm(p * 2.7 + 5.0) * 0.4;
  float cover = clamp(coverage, 0.0, 1.0);
  float mask = smoothstep(1.05 - cover, 1.35 - cover, density);
  return mask * smoothstep(0.0, 0.16, direction.y);
}`;

/** Uniform block shared by every preset that draws a distant ridgeline. */
const SKY_RIDGE_UNIFORMS = `uniform vec3 uRidgeColor;
uniform vec3 uRidgeFarColor;
uniform float uRidgeHeight;
uniform float uRidgeRoughness;
uniform float uRidgeHaze;
uniform float uRidgeStrength;`;

/**
 * Applied last so the ridge occludes stars, the moon and the sun, the way real
 * distant terrain does. The far layer is hazed toward the sky for depth.
 */
const SKY_RIDGE_APPLY = `  if (uRidgeStrength > 0.0) {
    float farRidge = xriftSkyRidgeMask(direction, uRidgeHeight * 0.62, uRidgeRoughness * 0.8, 3.1);
    float nearRidge = xriftSkyRidgeMask(direction, uRidgeHeight, uRidgeRoughness, 11.7);
    vec3 haze = mix(uHorizonColor, color, 0.35);
    color = mix(color, mix(uRidgeFarColor, haze, clamp(uRidgeHaze, 0.0, 1.0)), farRidge * uRidgeStrength);
    color = mix(color, uRidgeColor, nearRidge * uRidgeStrength);
  }`;

const STARFIELD_FRAGMENT_SHADER = `uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uStarColor;
uniform vec3 uMilkyWayColor;
uniform float uStarCount;
uniform float uStarBrightness;
uniform float uStarSize;
uniform float uTwinkleSpeed;
uniform float uMilkyWayStrength;
uniform float uHorizonFade;
uniform float uExposure;
uniform float uRotation;
uniform float uTime;
${SKY_RIDGE_UNIFORMS}
varying vec3 vDirection;

${SKY_COMMON_GLSL}

void main() {
  vec3 direction = xriftSkyRotateY(normalize(vDirection), uRotation);
  float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uHorizonColor, uZenithColor, pow(height, 1.4));
  float above = smoothstep(-0.05, max(uHorizonFade, 0.001), direction.y);

  vec3 milkyWayAxis = normalize(vec3(0.42, 0.58, -0.7));
  float band = pow(clamp(1.0 - abs(dot(direction, milkyWayAxis)), 0.0, 1.0), 7.0);
  float clouds = xriftSkyFbm(direction * 4.2 + 7.3);
  color += uMilkyWayColor * band * (0.3 + 0.9 * clouds) * uMilkyWayStrength * above;

  float stars = xriftSkyStarField(direction, uStarCount, uStarSize, uTime, uTwinkleSpeed);
  color += uStarColor * stars * above * uStarBrightness * (0.75 + 0.5 * band);

${SKY_RIDGE_APPLY}

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const AURORA_FRAGMENT_SHADER = `uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uStarColor;
uniform vec3 uAuroraColor;
uniform vec3 uAuroraAccentColor;
uniform float uStarCount;
uniform float uStarBrightness;
uniform float uStarSize;
uniform float uTwinkleSpeed;
uniform float uAuroraStrength;
uniform float uAuroraSpeed;
uniform float uAuroraHeight;
uniform float uHorizonFade;
uniform float uExposure;
uniform float uRotation;
uniform float uTime;
${SKY_RIDGE_UNIFORMS}
varying vec3 vDirection;

${SKY_COMMON_GLSL}

/** Three offset curtains projected onto a plane above the viewer. */
float xriftSkyAurora(vec3 direction, float time, float speed, float height) {
  if (direction.y <= 0.01) {
    return 0.0;
  }
  vec2 plane = direction.xz / (direction.y + max(height, 0.05));
  float total = 0.0;
  float amplitude = 1.0;
  for (int index = 0; index < 3; index += 1) {
    float layer = float(index);
    float wave =
      sin(plane.x * (0.9 + layer * 0.6) + time * speed * (0.5 + layer * 0.25) + layer * 2.3) * 0.5;
    float dist = abs(plane.y - wave - layer * 0.55 + 0.4);
    total += amplitude * exp(-dist * (4.5 + layer * 1.5));
    amplitude *= 0.62;
  }
  float curtain = 0.55 + 0.45 * sin(plane.x * 11.0 + time * speed * 1.7);
  return total * curtain * smoothstep(0.0, 0.22, direction.y);
}

void main() {
  vec3 direction = xriftSkyRotateY(normalize(vDirection), uRotation);
  float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uHorizonColor, uZenithColor, pow(height, 1.5));
  float above = smoothstep(-0.05, max(uHorizonFade, 0.001), direction.y);

  float stars = xriftSkyStarField(direction, uStarCount, uStarSize, uTime, uTwinkleSpeed);
  color += uStarColor * stars * above * uStarBrightness;

  float aurora = xriftSkyAurora(direction, uTime, uAuroraSpeed, uAuroraHeight);
  float shimmer = xriftSkyFbm(direction * 6.5 + vec3(0.0, uTime * 0.05, 0.0));
  vec3 auroraColor = mix(uAuroraColor, uAuroraAccentColor, clamp(aurora * 0.9, 0.0, 1.0));
  color += auroraColor * aurora * (0.55 + 0.75 * shimmer) * uAuroraStrength;

${SKY_RIDGE_APPLY}

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const NEBULA_FRAGMENT_SHADER = `uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uStarColor;
uniform vec3 uNebulaColor;
uniform vec3 uNebulaAccentColor;
uniform float uStarCount;
uniform float uStarBrightness;
uniform float uStarSize;
uniform float uTwinkleSpeed;
uniform float uNebulaStrength;
uniform float uNebulaScale;
uniform float uDriftSpeed;
uniform float uExposure;
uniform float uRotation;
uniform float uTime;
varying vec3 vDirection;

${SKY_COMMON_GLSL}

void main() {
  vec3 direction = xriftSkyRotateY(normalize(vDirection), uRotation);
  float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uHorizonColor, uZenithColor, pow(height, 1.2));

  vec3 drift = vec3(0.0, 0.0, uTime * uDriftSpeed * 0.02);
  float scale = max(uNebulaScale, 0.1);
  float cloudA = xriftSkyFbm(direction * scale + drift);
  float cloudB = xriftSkyFbm(direction * scale * 1.9 + drift * 1.7 + 21.7);
  float nebula = pow(clamp(cloudA * 1.35 - cloudB * 0.45, 0.0, 1.0), 2.2) * uNebulaStrength;
  color += mix(uNebulaColor, uNebulaAccentColor, clamp(cloudB * 1.6, 0.0, 1.0)) * nebula;

  float stars = xriftSkyStarField(direction, uStarCount, uStarSize, uTime, uTwinkleSpeed);
  color += uStarColor * stars * uStarBrightness * (0.7 + 0.6 * nebula);

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * The scenery sky: gradient, sun, moon, clouds, stars and a distant ridgeline
 * in one program. Daylight, sunset, dawn and a moonlit night are the same
 * shader with different uniform values, so an author can move one preset all
 * the way to another instead of picking a fixed look.
 *
 * Every element is switched off by its own strength uniform, and each block is
 * guarded, so a preset only pays for the parts it actually draws.
 */
const SCENERY_FRAGMENT_SHADER = `uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uSkyExponent;
uniform vec3 uSunColor;
uniform vec3 uSunGlowColor;
uniform float uSunAzimuth;
uniform float uSunElevation;
uniform float uSunSize;
uniform float uSunGlow;
uniform float uSunStrength;
uniform vec3 uMoonColor;
uniform float uMoonAzimuth;
uniform float uMoonElevation;
uniform float uMoonSize;
uniform float uMoonGlow;
uniform float uMoonPhase;
uniform float uMoonStrength;
uniform vec3 uCloudColor;
uniform float uCloudCoverage;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform float uCloudStrength;
uniform vec3 uStarColor;
uniform float uStarCount;
uniform float uStarBrightness;
uniform float uStarSize;
uniform float uTwinkleSpeed;
uniform float uExposure;
uniform float uRotation;
uniform float uTime;
${SKY_RIDGE_UNIFORMS}
varying vec3 vDirection;

${SKY_COMMON_GLSL}

void main() {
  vec3 direction = xriftSkyRotateY(normalize(vDirection), uRotation);
  float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uHorizonColor, uZenithColor, pow(height, max(uSkyExponent, 0.05)));

  vec3 sunDirection = xriftSkyBodyDirection(uSunAzimuth, uSunElevation);
  vec2 sun = xriftSkyCelestial(
    direction,
    sunDirection,
    radians(uSunSize),
    radians(max(uSunGlow, 0.5))
  );
  if (uSunStrength > 0.0) {
    color += uSunGlowColor * sun.y * uSunStrength;
  }

  if (uStarCount > 0.0 && uStarBrightness > 0.0) {
    float stars = xriftSkyStarField(direction, uStarCount, uStarSize, uTime, uTwinkleSpeed);
    color += uStarColor * stars * uStarBrightness * smoothstep(-0.02, 0.12, direction.y);
  }

  if (uMoonStrength > 0.0) {
    vec3 moonDirection = xriftSkyBodyDirection(uMoonAzimuth, uMoonElevation);
    float moonRadius = radians(uMoonSize);
    vec2 moon = xriftSkyCelestial(direction, moonDirection, moonRadius, radians(max(uMoonGlow, 0.2)));
    color += uMoonColor * moon.y * 0.32 * uMoonStrength;
    float shade = xriftSkyMoonShade(direction, moonDirection, moonRadius, uMoonPhase);
    color = mix(color, uMoonColor * shade * 1.35, moon.x * uMoonStrength);
  }

  if (uSunStrength > 0.0) {
    color = mix(color, uSunColor * 1.6, sun.x * uSunStrength);
  }

  if (uCloudStrength > 0.0) {
    float clouds = xriftSkyClouds(direction, uCloudCoverage, uCloudScale, uTime, uCloudSpeed);
    // Cloud faces turned toward the sun pick up its colour.
    float sunFacing = clamp(dot(direction, sunDirection) * 0.5 + 0.5, 0.0, 1.0);
    vec3 cloudColor = mix(uCloudColor, uCloudColor * uSunGlowColor * 2.2, pow(sunFacing, 3.0));
    color = mix(color, cloudColor, clamp(clouds * uCloudStrength, 0.0, 1.0));
  }

${SKY_RIDGE_APPLY}

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Volumetric clouds: a real ray march through a cloud slab rather than a flat
 * plane of noise. Each view ray crosses the layer between `uCloudBase` and
 * `uCloudTop`, accumulating density and transmittance, and each sample takes a
 * short march toward the sun so the clouds shade themselves. That is what gives
 * them thickness — bright rims facing the sun, dark bellies underneath — which
 * a flat cloud texture cannot do.
 *
 * This is the most expensive preset in the catalog. The step counts are variant
 * defines rather than constants, so a world targeting standalone headsets can
 * lower them without editing the GLSL.
 */
const VOLUMETRIC_FRAGMENT_SHADER = `uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uSkyExponent;
uniform vec3 uSunColor;
uniform vec3 uSunGlowColor;
uniform float uSunAzimuth;
uniform float uSunElevation;
uniform float uSunSize;
uniform float uSunGlow;
uniform float uSunStrength;
uniform vec3 uCloudColor;
uniform vec3 uCloudShadowColor;
uniform float uCloudBase;
uniform float uCloudTop;
uniform float uCloudScale;
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform float uCloudSpeed;
uniform float uCloudDistance;
uniform float uCloudStrength;
uniform float uExposure;
uniform float uRotation;
uniform float uTime;
${SKY_RIDGE_UNIFORMS}
varying vec3 vDirection;

${SKY_COMMON_GLSL}

#ifndef XRIFT_CLOUD_STEPS
#define XRIFT_CLOUD_STEPS 40
#endif
#ifndef XRIFT_CLOUD_LIGHT_STEPS
#define XRIFT_CLOUD_LIGHT_STEPS 4
#endif

/**
 * Density inside the cloud slab. The vertical profile is thin at the base and
 * wispy at the top, so the layer reads as cloud rather than as a solid box.
 */
float xriftCloudDensity(
  vec3 position,
  float base,
  float top,
  float coverage,
  float scale,
  float time,
  float speed
) {
  float thickness = max(top - base, 0.001);
  float heightFraction = clamp((position.y - base) / thickness, 0.0, 1.0);
  float profile =
    smoothstep(0.0, 0.22, heightFraction) * (1.0 - smoothstep(0.5, 1.0, heightFraction));
  vec3 p = position * max(scale, 0.00001);
  p.x += time * speed * 0.06;
  float shape = xriftSkyFbm(p);
  float detail = xriftSkyFbm(p * 3.4 + 9.1);
  // The threshold carves separate clouds out of the noise, and three octaves of
  // value noise sit in a narrow band around 0.44. Mapping coverage across that
  // band instead of across 0..1 is what keeps the whole slider useful: a linear
  // threshold spends most of its travel on "no cloud" and then jumps to solid.
  float threshold = mix(0.70, 0.22, clamp(coverage, 0.0, 1.0));
  float density = shape - threshold - detail * 0.14;
  return max(density, 0.0) * profile;
}

void main() {
  vec3 direction = xriftSkyRotateY(normalize(vDirection), uRotation);
  float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 color = mix(uHorizonColor, uZenithColor, pow(height, max(uSkyExponent, 0.05)));

  vec3 sunDirection = xriftSkyBodyDirection(uSunAzimuth, uSunElevation);
  vec2 sun = xriftSkyCelestial(
    direction,
    sunDirection,
    radians(uSunSize),
    radians(max(uSunGlow, 0.5))
  );
  if (uSunStrength > 0.0) {
    color += uSunGlowColor * sun.y * uSunStrength;
    color = mix(color, uSunColor * 1.6, sun.x * uSunStrength);
  }

  if (uCloudStrength > 0.0 && direction.y > 0.012) {
    float base = min(uCloudBase, uCloudTop - 1.0);
    float entry = base / direction.y;
    float exitDistance = min(uCloudTop / direction.y, max(uCloudDistance, base + 1.0));
    if (entry < exitDistance) {
      float stepSize = (exitDistance - entry) / float(XRIFT_CLOUD_STEPS);
      float lightStep = max(uCloudTop - base, 1.0) / float(XRIFT_CLOUD_LIGHT_STEPS);
      float transmittance = 1.0;
      vec3 scattered = vec3(0.0);
      for (int index = 0; index < XRIFT_CLOUD_STEPS; index += 1) {
        if (transmittance > 0.02) {
          vec3 samplePosition = direction * (entry + (float(index) + 0.5) * stepSize);
          float density = xriftCloudDensity(
            samplePosition, base, uCloudTop, uCloudCoverage, uCloudScale, uTime, uCloudSpeed
          ) * uCloudDensity;
          if (density > 0.0) {
            // A short march toward the sun is what separates a lit rim from a
            // shadowed belly; without it the layer reads flat.
            float lightDensity = 0.0;
            for (int light = 0; light < XRIFT_CLOUD_LIGHT_STEPS; light += 1) {
              lightDensity += xriftCloudDensity(
                samplePosition + sunDirection * (float(light) + 0.5) * lightStep,
                base, uCloudTop, uCloudCoverage, uCloudScale, uTime, uCloudSpeed
              );
            }
            // Beer's law on both marches. The coefficients are tuned so a
            // default layer reads as separate clouds rather than fog: the view
            // ray stays partly transparent and the light ray keeps a usable
            // range between a lit rim and a shadowed core.
            float sunlight = exp(-lightDensity * lightStep * uCloudDensity * 0.018);
            vec3 sampleColor = mix(uCloudShadowColor, uCloudColor, sunlight);
            float absorbed = 1.0 - exp(-density * stepSize * 0.009);
            scattered += transmittance * absorbed * sampleColor;
            transmittance *= 1.0 - absorbed;
          }
        }
      }
      float cover = clamp(
        (1.0 - transmittance) * uCloudStrength * smoothstep(0.012, 0.09, direction.y),
        0.0,
        1.0
      );
      color = mix(color, scattered / max(1.0 - transmittance, 0.001), cover);
    }
  }

${SKY_RIDGE_APPLY}

  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const VOLUMETRIC_PARAMETERS: readonly SkyShaderParameter[] = [
  {
    uniform: "uCloudCoverage",
    label: "雲の量",
    hint: "空を覆う雲の割合です。0で快晴、1で一面の曇り空になります。",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    uniform: "uCloudDensity",
    label: "雲の濃さ",
    hint: "雲の厚みです。大きいほど下側が暗く重くなります。",
    kind: "number",
    min: 0.1,
    max: 6,
    step: 0.05,
  },
  {
    uniform: "uCloudScale",
    label: "雲の細かさ",
    hint: "大きいほど雲のかたまりが小さくなります。",
    kind: "number",
    min: 0.0005,
    max: 0.02,
    step: 0.0005,
  },
  {
    uniform: "uCloudBase",
    label: "雲底の高さ",
    hint: "雲の下端の高さです。低いほど頭上に迫ります。",
    kind: "number",
    min: 40,
    max: 1200,
    step: 10,
  },
  {
    uniform: "uCloudTop",
    label: "雲頂の高さ",
    hint: "雲の上端の高さです。雲底との差が雲の厚みになります。",
    kind: "number",
    min: 80,
    max: 3000,
    step: 10,
  },
  {
    uniform: "uCloudSpeed",
    label: "雲の流れる速さ",
    hint: "雲が流れる速さです。0で静止します。",
    kind: "number",
    min: 0,
    max: 6,
    step: 0.05,
  },
];

/** Controls every starry preset shares, so the store reads the same first. */
const STAR_PARAMETERS: readonly SkyShaderParameter[] = [
  {
    uniform: "uStarCount",
    label: "星の数",
    hint: "天球全体に置く星のおおよその数です。",
    kind: "number",
    min: 0,
    max: 8000,
    step: 50,
  },
  {
    uniform: "uStarBrightness",
    label: "星の明るさ",
    hint: "星の発光量です。0で星を消せます。",
    kind: "number",
    min: 0,
    max: 4,
    step: 0.05,
  },
  {
    uniform: "uStarSize",
    label: "星の大きさ",
    hint: "1つの星の見かけの大きさです。",
    kind: "number",
    min: 0.02,
    max: 0.45,
    step: 0.01,
  },
  {
    uniform: "uTwinkleSpeed",
    label: "またたきの速さ",
    hint: "星の明滅の速さです。0で静止します。",
    kind: "number",
    min: 0,
    max: 6,
    step: 0.1,
  },
];

/** The distant scenery controls shared by every preset with a horizon. */
const RIDGE_PARAMETERS: readonly SkyShaderParameter[] = [
  {
    uniform: "uRidgeHeight",
    label: "遠景の高さ",
    hint: "地平線に並ぶ遠くの山の高さです。0で平らな地平線になります。",
    kind: "number",
    min: 0,
    max: 0.5,
    step: 0.005,
  },
  {
    uniform: "uRidgeRoughness",
    label: "遠景の起伏",
    hint: "大きいほど尾根が細かく波打ちます。",
    kind: "number",
    min: 0.1,
    max: 4,
    step: 0.05,
  },
  {
    uniform: "uRidgeHaze",
    label: "遠景のかすみ",
    hint: "奥の尾根を空の色へ溶かし、距離感を出します。",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    uniform: "uRidgeColor",
    label: "手前の尾根の色",
    hint: "近い方の山のシルエット色です。",
    kind: "color",
  },
  {
    uniform: "uRidgeFarColor",
    label: "奥の尾根の色",
    hint: "遠い方の山の色です。かすみで空へ寄ります。",
    kind: "color",
  },
];

/** The sun placement controls shared by the daylight, sunset and dawn presets. */
const SUN_PARAMETERS: readonly SkyShaderParameter[] = [
  {
    uniform: "uSunElevation",
    label: "太陽の高さ (度)",
    hint: "地平線からの角度です。負の値で地平線の下に沈みます。",
    kind: "number",
    min: -15,
    max: 90,
    step: 0.5,
  },
  {
    uniform: "uSunAzimuth",
    label: "太陽の方角 (度)",
    hint: "太陽が出る水平方向です。",
    kind: "number",
    min: 0,
    max: 360,
    step: 1,
  },
  {
    uniform: "uSunSize",
    label: "太陽の大きさ (度)",
    hint: "太陽の見かけの半径です。",
    kind: "number",
    min: 0.2,
    max: 12,
    step: 0.1,
  },
  {
    uniform: "uSunGlow",
    label: "太陽まわりの光 (度)",
    hint: "空へ広がる光の範囲です。夕焼けでは大きくします。",
    kind: "number",
    min: 0.5,
    max: 80,
    step: 0.5,
  },
];

const CLOUD_PARAMETERS: readonly SkyShaderParameter[] = [
  {
    uniform: "uCloudCoverage",
    label: "雲の量",
    hint: "空を覆う雲の割合です。0で快晴になります。",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.02,
  },
  {
    uniform: "uCloudScale",
    label: "雲の細かさ",
    hint: "大きいほど雲が小さく細かくなります。",
    kind: "number",
    min: 0.1,
    max: 6,
    step: 0.05,
  },
  {
    uniform: "uCloudSpeed",
    label: "雲の流れる速さ",
    hint: "雲が流れる速さです。0で静止します。",
    kind: "number",
    min: 0,
    max: 6,
    step: 0.05,
  },
];

function skyVariants(): ClassicR3fMaterialShader["variants"] {
  return [
    {
      name: "sky",
      defines: {},
      // The sky mesh is viewed from the inside and must never occlude the
      // scene, so the preset is authored back-facing and depth-write free.
      side: "back",
      transparent: false,
      depthWrite: false,
    },
  ];
}

/** Framework uniforms Scene Settings drives on every preset. */
function frameworkUniforms(): ClassicR3fMaterialShader["uniforms"] {
  return {
    uCenter: { kind: "vector", value: [0, 0.01, 0] },
    uRotation: { kind: "number", value: 0 },
    uExposure: { kind: "number", value: 1 },
    uTime: { kind: "number", value: 0 },
  };
}

function ridgeUniforms(values: {
  color: string;
  farColor: string;
  height: number;
  roughness: number;
  haze: number;
  strength: number;
}): ClassicR3fMaterialShader["uniforms"] {
  return {
    uRidgeColor: { kind: "color", value: values.color },
    uRidgeFarColor: { kind: "color", value: values.farColor },
    uRidgeHeight: { kind: "number", value: values.height },
    uRidgeRoughness: { kind: "number", value: values.roughness },
    uRidgeHaze: { kind: "number", value: values.haze },
    uRidgeStrength: { kind: "number", value: values.strength },
  };
}

/** Shared shape of the two volumetric presets; only the palette differs. */
function volumetricShader(
  id: string,
  uniforms: ClassicR3fMaterialShader["uniforms"],
): ClassicR3fMaterialShader {
  return {
    kind: "classic-r3f",
    sourceModulePath: `studio://sky-shader/${id}`,
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: VOLUMETRIC_FRAGMENT_SHADER,
    uniforms,
    variants: [
      {
        ...skyVariants()[0],
        // Step counts live here so a standalone-headset build can lower them
        // from the Material's variant without touching the GLSL.
        defines: { XRIFT_CLOUD_STEPS: "40", XRIFT_CLOUD_LIGHT_STEPS: "4" },
      },
    ],
    animatedTimeUniform: "uTime",
  };
}

const VOLUMETRIC_STORE_PARAMETERS: readonly SkyShaderParameter[] = [
  ...VOLUMETRIC_PARAMETERS,
  ...SUN_PARAMETERS,
  ...RIDGE_PARAMETERS,
  {
    uniform: "uCloudColor",
    label: "日なたの雲の色",
    hint: "太陽に照らされた面の色です。",
    kind: "color",
  },
  {
    uniform: "uCloudShadowColor",
    label: "日かげの雲の色",
    hint: "雲の内側と底の色です。暗くするほど厚く見えます。",
    kind: "color",
  },
  {
    uniform: "uZenithColor",
    label: "天頂の色",
    hint: "真上の空の色です。",
    kind: "color",
  },
  {
    uniform: "uHorizonColor",
    label: "地平線の色",
    hint: "地平線付近の空の色です。",
    kind: "color",
  },
];

export const SKY_SHADER_CATALOG: readonly SkyShaderCatalogEntry[] = [
  {
    id: "volumetric-daylight",
    label: "Volumetric Daylight",
    category: "day",
    description:
      "雲の層をレイマーチして厚みごと描く昼の空です。太陽に向いた面が白く光り、底が影になります。カタログで最も重いpresetなので、Quest向けにはvariantのXRIFT_CLOUD_STEPSを下げてください。",
    parameters: VOLUMETRIC_STORE_PARAMETERS,
    shader: volumetricShader("volumetric-daylight", {
      ...frameworkUniforms(),
      uZenithColor: { kind: "color", value: "#2f74d6" },
      uHorizonColor: { kind: "color", value: "#c3dcf3" },
      uSkyExponent: { kind: "number", value: 1.1 },
      uSunColor: { kind: "color", value: "#fff8e6" },
      uSunGlowColor: { kind: "color", value: "#ffe9bc" },
      uSunAzimuth: { kind: "number", value: 132 },
      uSunElevation: { kind: "number", value: 38 },
      uSunSize: { kind: "number", value: 1.6 },
      uSunGlow: { kind: "number", value: 10 },
      uSunStrength: { kind: "number", value: 1 },
      uCloudColor: { kind: "color", value: "#ffffff" },
      uCloudShadowColor: { kind: "color", value: "#5a6b86" },
      uCloudBase: { kind: "number", value: 300 },
      uCloudTop: { kind: "number", value: 900 },
      uCloudScale: { kind: "number", value: 0.004 },
      uCloudCoverage: { kind: "number", value: 0.62 },
      uCloudDensity: { kind: "number", value: 2.6 },
      uCloudSpeed: { kind: "number", value: 1 },
      uCloudDistance: { kind: "number", value: 14000 },
      uCloudStrength: { kind: "number", value: 1 },
      ...ridgeUniforms({
        color: "#5c7684",
        farColor: "#8ba4b4",
        height: 0.07,
        roughness: 1.2,
        haze: 0.55,
        strength: 1,
      }),
    }),
  },
  {
    id: "volumetric-sunset",
    label: "Volumetric Sunset",
    category: "dusk",
    description:
      "同じレイマーチの雲を夕日で照らした空です。低い太陽が雲の縁を橙に染め、底が紫に沈みます。太陽の高さを動かすと日没が進みます。",
    parameters: VOLUMETRIC_STORE_PARAMETERS,
    shader: volumetricShader("volumetric-sunset", {
      ...frameworkUniforms(),
      uZenithColor: { kind: "color", value: "#22315f" },
      uHorizonColor: { kind: "color", value: "#eda368" },
      uSkyExponent: { kind: "number", value: 1.8 },
      uSunColor: { kind: "color", value: "#ffd7a0" },
      uSunGlowColor: { kind: "color", value: "#ff9a4a" },
      uSunAzimuth: { kind: "number", value: 262 },
      uSunElevation: { kind: "number", value: 4.5 },
      uSunSize: { kind: "number", value: 2.4 },
      uSunGlow: { kind: "number", value: 30 },
      uSunStrength: { kind: "number", value: 1 },
      uCloudColor: { kind: "color", value: "#ffd0a2" },
      uCloudShadowColor: { kind: "color", value: "#4a3a5e" },
      uCloudBase: { kind: "number", value: 320 },
      uCloudTop: { kind: "number", value: 1000 },
      uCloudScale: { kind: "number", value: 0.0035 },
      uCloudCoverage: { kind: "number", value: 0.58 },
      uCloudDensity: { kind: "number", value: 2.4 },
      uCloudSpeed: { kind: "number", value: 0.6 },
      uCloudDistance: { kind: "number", value: 14000 },
      uCloudStrength: { kind: "number", value: 1 },
      ...ridgeUniforms({
        color: "#2b2038",
        farColor: "#5d4763",
        height: 0.095,
        roughness: 1.4,
        haze: 0.45,
        strength: 1,
      }),
    }),
  },
  {
    id: "daylight-clear",
    label: "Daylight Clear",
    category: "day",
    description:
      "昼の青空です。太陽の高さと方角、流れる雲、地平線に並ぶ遠くの山を調整できます。太陽を低くすると夕方寄りの空になります。",
    parameters: [
      ...SUN_PARAMETERS,
      ...CLOUD_PARAMETERS,
      ...RIDGE_PARAMETERS,
      {
        uniform: "uZenithColor",
        label: "天頂の色",
        hint: "真上の空の色です。",
        kind: "color",
      },
      {
        uniform: "uHorizonColor",
        label: "地平線の色",
        hint: "地平線付近の空の色です。",
        kind: "color",
      },
      {
        uniform: "uSunGlowColor",
        label: "太陽の光の色",
        hint: "空と雲へ乗る光の色です。",
        kind: "color",
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://sky-shader/daylight-clear",
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SCENERY_FRAGMENT_SHADER,
      uniforms: {
        ...frameworkUniforms(),
        uZenithColor: { kind: "color", value: "#2c6fd1" },
        uHorizonColor: { kind: "color", value: "#bcd9f2" },
        uSkyExponent: { kind: "number", value: 1.1 },
        uSunColor: { kind: "color", value: "#fff6e0" },
        uSunGlowColor: { kind: "color", value: "#ffe6b0" },
        uSunAzimuth: { kind: "number", value: 128 },
        uSunElevation: { kind: "number", value: 42 },
        uSunSize: { kind: "number", value: 1.6 },
        uSunGlow: { kind: "number", value: 9 },
        uSunStrength: { kind: "number", value: 1 },
        uMoonColor: { kind: "color", value: "#e8eef7" },
        uMoonAzimuth: { kind: "number", value: 300 },
        uMoonElevation: { kind: "number", value: 30 },
        uMoonSize: { kind: "number", value: 2.4 },
        uMoonGlow: { kind: "number", value: 4 },
        uMoonPhase: { kind: "number", value: 0.88 },
        uMoonStrength: { kind: "number", value: 0 },
        uCloudColor: { kind: "color", value: "#ffffff" },
        uCloudCoverage: { kind: "number", value: 0.45 },
        uCloudScale: { kind: "number", value: 1.1 },
        uCloudSpeed: { kind: "number", value: 1 },
        uCloudStrength: { kind: "number", value: 0.9 },
        uStarColor: { kind: "color", value: "#dce6ff" },
        uStarCount: { kind: "number", value: 0 },
        uStarBrightness: { kind: "number", value: 0 },
        uStarSize: { kind: "number", value: 0.16 },
        uTwinkleSpeed: { kind: "number", value: 1 },
        ...ridgeUniforms({
          color: "#5f7a86",
          farColor: "#8aa3b3",
          height: 0.075,
          roughness: 1.2,
          haze: 0.55,
          strength: 1,
        }),
      },
      variants: skyVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "golden-sunset",
    label: "Golden Sunset",
    category: "dusk",
    description:
      "夕暮れの空です。低い太陽が雲と遠景を橙に染めます。太陽の高さを下げるほど日没へ近づき、星の数を上げると宵の明星が出ます。",
    parameters: [
      ...SUN_PARAMETERS,
      ...CLOUD_PARAMETERS,
      ...RIDGE_PARAMETERS,
      {
        uniform: "uZenithColor",
        label: "天頂の色",
        hint: "真上の空の色です。",
        kind: "color",
      },
      {
        uniform: "uHorizonColor",
        label: "地平線の色",
        hint: "地平線付近の空の色です。",
        kind: "color",
      },
      {
        uniform: "uSunGlowColor",
        label: "夕日の色",
        hint: "空と雲へ広がる夕日の色です。",
        kind: "color",
      },
      {
        uniform: "uStarCount",
        label: "星の数",
        hint: "暮れかけの空に出る星の数です。0で星なしになります。",
        kind: "number",
        min: 0,
        max: 4000,
        step: 25,
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://sky-shader/golden-sunset",
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SCENERY_FRAGMENT_SHADER,
      uniforms: {
        ...frameworkUniforms(),
        uZenithColor: { kind: "color", value: "#1d2d5c" },
        uHorizonColor: { kind: "color", value: "#f0a15a" },
        uSkyExponent: { kind: "number", value: 1.9 },
        uSunColor: { kind: "color", value: "#ffd39a" },
        uSunGlowColor: { kind: "color", value: "#ff9d4d" },
        uSunAzimuth: { kind: "number", value: 264 },
        uSunElevation: { kind: "number", value: 3.5 },
        uSunSize: { kind: "number", value: 2.6 },
        uSunGlow: { kind: "number", value: 34 },
        uSunStrength: { kind: "number", value: 1 },
        uMoonColor: { kind: "color", value: "#e8eef7" },
        uMoonAzimuth: { kind: "number", value: 84 },
        uMoonElevation: { kind: "number", value: 26 },
        uMoonSize: { kind: "number", value: 2.4 },
        uMoonGlow: { kind: "number", value: 4 },
        uMoonPhase: { kind: "number", value: 0.9 },
        uMoonStrength: { kind: "number", value: 0 },
        uCloudColor: { kind: "color", value: "#6a5570" },
        uCloudCoverage: { kind: "number", value: 0.52 },
        uCloudScale: { kind: "number", value: 0.9 },
        uCloudSpeed: { kind: "number", value: 0.7 },
        uCloudStrength: { kind: "number", value: 0.95 },
        uStarColor: { kind: "color", value: "#dbe4ff" },
        uStarCount: { kind: "number", value: 420 },
        uStarBrightness: { kind: "number", value: 0.75 },
        uStarSize: { kind: "number", value: 0.15 },
        uTwinkleSpeed: { kind: "number", value: 0.8 },
        ...ridgeUniforms({
          color: "#2a2038",
          farColor: "#5b4560",
          height: 0.1,
          roughness: 1.5,
          haze: 0.45,
          strength: 1,
        }),
      },
      variants: skyVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "morning-glow",
    label: "Morning Glow",
    category: "dawn",
    description:
      "朝焼けの空です。低い朝日が薄い雲を桃色に染め、遠景が明けきらない青に沈みます。太陽の高さを上げると昼へつながります。",
    parameters: [
      ...SUN_PARAMETERS,
      ...CLOUD_PARAMETERS,
      ...RIDGE_PARAMETERS,
      {
        uniform: "uZenithColor",
        label: "天頂の色",
        hint: "真上の空の色です。",
        kind: "color",
      },
      {
        uniform: "uHorizonColor",
        label: "地平線の色",
        hint: "地平線付近の空の色です。",
        kind: "color",
      },
      {
        uniform: "uSunGlowColor",
        label: "朝日の色",
        hint: "空と雲へ広がる朝日の色です。",
        kind: "color",
      },
      {
        uniform: "uStarCount",
        label: "星の数",
        hint: "明け方に残る星の数です。0で星なしになります。",
        kind: "number",
        min: 0,
        max: 4000,
        step: 25,
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://sky-shader/morning-glow",
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SCENERY_FRAGMENT_SHADER,
      uniforms: {
        ...frameworkUniforms(),
        uZenithColor: { kind: "color", value: "#2a4a86" },
        uHorizonColor: { kind: "color", value: "#f6c0a8" },
        uSkyExponent: { kind: "number", value: 1.7 },
        uSunColor: { kind: "color", value: "#fff0d2" },
        uSunGlowColor: { kind: "color", value: "#ff9f86" },
        uSunAzimuth: { kind: "number", value: 86 },
        uSunElevation: { kind: "number", value: 6 },
        uSunSize: { kind: "number", value: 2 },
        uSunGlow: { kind: "number", value: 28 },
        uSunStrength: { kind: "number", value: 1 },
        uMoonColor: { kind: "color", value: "#e8eef7" },
        uMoonAzimuth: { kind: "number", value: 268 },
        uMoonElevation: { kind: "number", value: 22 },
        uMoonSize: { kind: "number", value: 2.2 },
        uMoonGlow: { kind: "number", value: 3 },
        uMoonPhase: { kind: "number", value: 0.4 },
        uMoonStrength: { kind: "number", value: 0.55 },
        uCloudColor: { kind: "color", value: "#8f7f96" },
        uCloudCoverage: { kind: "number", value: 0.38 },
        uCloudScale: { kind: "number", value: 1.4 },
        uCloudSpeed: { kind: "number", value: 0.5 },
        uCloudStrength: { kind: "number", value: 0.85 },
        uStarColor: { kind: "color", value: "#d8e2ff" },
        uStarCount: { kind: "number", value: 260 },
        uStarBrightness: { kind: "number", value: 0.5 },
        uStarSize: { kind: "number", value: 0.14 },
        uTwinkleSpeed: { kind: "number", value: 0.6 },
        ...ridgeUniforms({
          color: "#2f3b52",
          farColor: "#5c6b86",
          height: 0.085,
          roughness: 1.1,
          haze: 0.6,
          strength: 1,
        }),
      },
      variants: skyVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "moonlit-night",
    label: "Moonlit Night",
    category: "night",
    description:
      "月のある夜空です。満ち欠け、大きさ、位置を調整でき、遠景の山が月と星を隠します。月をしまうと星だけの夜になります。",
    parameters: [
      {
        uniform: "uMoonPhase",
        label: "月の満ち欠け",
        hint: "0で新月、0.5で半月、1で満月になります。",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        uniform: "uMoonSize",
        label: "月の大きさ (度)",
        hint: "月の見かけの半径です。実際の月は約0.26度です。",
        kind: "number",
        min: 0.2,
        max: 14,
        step: 0.1,
      },
      {
        uniform: "uMoonElevation",
        label: "月の高さ (度)",
        hint: "地平線からの角度です。負の値で沈みます。",
        kind: "number",
        min: -15,
        max: 90,
        step: 0.5,
      },
      {
        uniform: "uMoonAzimuth",
        label: "月の方角 (度)",
        hint: "月が出る水平方向です。",
        kind: "number",
        min: 0,
        max: 360,
        step: 1,
      },
      {
        uniform: "uMoonStrength",
        label: "月の明るさ",
        hint: "月と月あかりの強さです。0で月が消えます。",
        kind: "number",
        min: 0,
        max: 3,
        step: 0.05,
      },
      ...STAR_PARAMETERS,
      ...RIDGE_PARAMETERS,
      {
        uniform: "uMoonColor",
        label: "月の色",
        hint: "月と月あかりの色です。",
        kind: "color",
      },
      {
        uniform: "uZenithColor",
        label: "天頂の色",
        hint: "真上の空の色です。",
        kind: "color",
      },
      {
        uniform: "uHorizonColor",
        label: "地平線の色",
        hint: "地平線付近の空の色です。",
        kind: "color",
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://sky-shader/moonlit-night",
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SCENERY_FRAGMENT_SHADER,
      uniforms: {
        ...frameworkUniforms(),
        uZenithColor: { kind: "color", value: "#050b20" },
        uHorizonColor: { kind: "color", value: "#16243f" },
        uSkyExponent: { kind: "number", value: 1.35 },
        uSunColor: { kind: "color", value: "#fff6e0" },
        uSunGlowColor: { kind: "color", value: "#ffd8a0" },
        uSunAzimuth: { kind: "number", value: 270 },
        uSunElevation: { kind: "number", value: -18 },
        uSunSize: { kind: "number", value: 1.6 },
        uSunGlow: { kind: "number", value: 9 },
        uSunStrength: { kind: "number", value: 0 },
        uMoonColor: { kind: "color", value: "#e9f0fb" },
        uMoonAzimuth: { kind: "number", value: 118 },
        uMoonElevation: { kind: "number", value: 34 },
        uMoonSize: { kind: "number", value: 3.2 },
        uMoonGlow: { kind: "number", value: 6 },
        uMoonPhase: { kind: "number", value: 0.86 },
        uMoonStrength: { kind: "number", value: 1 },
        uCloudColor: { kind: "color", value: "#2b3550" },
        uCloudCoverage: { kind: "number", value: 0.25 },
        uCloudScale: { kind: "number", value: 1 },
        uCloudSpeed: { kind: "number", value: 0.4 },
        uCloudStrength: { kind: "number", value: 0.45 },
        uStarColor: { kind: "color", value: "#dce6ff" },
        uStarCount: { kind: "number", value: 1400 },
        uStarBrightness: { kind: "number", value: 1.15 },
        uStarSize: { kind: "number", value: 0.16 },
        uTwinkleSpeed: { kind: "number", value: 1 },
        ...ridgeUniforms({
          color: "#080c18",
          farColor: "#182338",
          height: 0.095,
          roughness: 1.3,
          haze: 0.4,
          strength: 1,
        }),
      },
      variants: skyVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "starfield-night",
    label: "Starfield Night",
    category: "night",
    description:
      "天の川と3層の星を手続き的に描く夜空です。星の数、大きさ、またたきの速さ、遠景の山、地平線の色を調整できます。",
    parameters: [
      ...STAR_PARAMETERS,
      {
        uniform: "uMilkyWayStrength",
        label: "天の川の濃さ",
        hint: "斜めに走る星雲帯の強さです。0で消えます。",
        kind: "number",
        min: 0,
        max: 3,
        step: 0.05,
      },
      ...RIDGE_PARAMETERS,
      {
        uniform: "uZenithColor",
        label: "天頂の色",
        hint: "真上の空の色です。",
        kind: "color",
      },
      {
        uniform: "uHorizonColor",
        label: "地平線の色",
        hint: "地平線付近の空の色です。",
        kind: "color",
      },
      {
        uniform: "uStarColor",
        label: "星の色",
        hint: "星の発光色です。",
        kind: "color",
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://sky-shader/starfield-night",
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: STARFIELD_FRAGMENT_SHADER,
      uniforms: {
        ...frameworkUniforms(),
        uZenithColor: { kind: "color", value: "#050a1c" },
        uHorizonColor: { kind: "color", value: "#131c34" },
        uStarColor: { kind: "color", value: "#dce6ff" },
        uMilkyWayColor: { kind: "color", value: "#4a5f9e" },
        uStarCount: { kind: "number", value: 1600 },
        uStarBrightness: { kind: "number", value: 1.35 },
        uStarSize: { kind: "number", value: 0.16 },
        uTwinkleSpeed: { kind: "number", value: 1.1 },
        uMilkyWayStrength: { kind: "number", value: 0.85 },
        uHorizonFade: { kind: "number", value: 0.12 },
        ...ridgeUniforms({
          color: "#070a14",
          farColor: "#141c30",
          height: 0.08,
          roughness: 1.25,
          haze: 0.4,
          strength: 1,
        }),
      },
      variants: skyVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "aurora-night",
    label: "Aurora Night",
    category: "aurora",
    description:
      "星空の上に揺れるオーロラのカーテンを重ねます。オーロラの強さ、速さ、高さと星の数、遠景の山を個別に調整できます。",
    parameters: [
      ...STAR_PARAMETERS,
      {
        uniform: "uAuroraStrength",
        label: "オーロラの強さ",
        hint: "カーテンの明るさです。0で星空だけになります。",
        kind: "number",
        min: 0,
        max: 3,
        step: 0.05,
      },
      {
        uniform: "uAuroraSpeed",
        label: "オーロラの速さ",
        hint: "カーテンが揺れる速さです。",
        kind: "number",
        min: 0,
        max: 4,
        step: 0.05,
      },
      {
        uniform: "uAuroraHeight",
        label: "オーロラの高さ",
        hint: "小さいほど頭上高くに、大きいほど地平線側に伸びます。",
        kind: "number",
        min: 0.05,
        max: 1.5,
        step: 0.05,
      },
      ...RIDGE_PARAMETERS,
      {
        uniform: "uAuroraColor",
        label: "オーロラの色",
        hint: "カーテンの基本色です。",
        kind: "color",
      },
      {
        uniform: "uAuroraAccentColor",
        label: "オーロラの差し色",
        hint: "濃い部分に混ざる色です。",
        kind: "color",
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://sky-shader/aurora-night",
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: AURORA_FRAGMENT_SHADER,
      uniforms: {
        ...frameworkUniforms(),
        uZenithColor: { kind: "color", value: "#03081a" },
        uHorizonColor: { kind: "color", value: "#0d1b2e" },
        uStarColor: { kind: "color", value: "#d7e4ff" },
        uAuroraColor: { kind: "color", value: "#2fd6a0" },
        uAuroraAccentColor: { kind: "color", value: "#8b5cf6" },
        uStarCount: { kind: "number", value: 1200 },
        uStarBrightness: { kind: "number", value: 1.1 },
        uStarSize: { kind: "number", value: 0.15 },
        uTwinkleSpeed: { kind: "number", value: 0.9 },
        uAuroraStrength: { kind: "number", value: 0.9 },
        uAuroraSpeed: { kind: "number", value: 0.6 },
        uAuroraHeight: { kind: "number", value: 0.45 },
        uHorizonFade: { kind: "number", value: 0.1 },
        ...ridgeUniforms({
          color: "#05090f",
          farColor: "#122232",
          height: 0.07,
          roughness: 1.6,
          haze: 0.35,
          strength: 1,
        }),
      },
      variants: skyVariants(),
      animatedTimeUniform: "uTime",
    },
  },
  {
    id: "nebula-space",
    label: "Nebula Space",
    category: "space",
    description:
      "地平線を持たない宇宙空間です。星雲がゆっくり流れ、星は全天に広がります。屋内や宇宙ステーションのワールドに向きます。",
    parameters: [
      ...STAR_PARAMETERS,
      {
        uniform: "uNebulaStrength",
        label: "星雲の濃さ",
        hint: "星雲の明るさです。0で星だけになります。",
        kind: "number",
        min: 0,
        max: 3,
        step: 0.05,
      },
      {
        uniform: "uNebulaScale",
        label: "星雲の細かさ",
        hint: "大きいほど雲が細かくなります。",
        kind: "number",
        min: 0.5,
        max: 8,
        step: 0.1,
      },
      {
        uniform: "uDriftSpeed",
        label: "流れる速さ",
        hint: "星雲が流れる速さです。0で静止します。",
        kind: "number",
        min: 0,
        max: 4,
        step: 0.05,
      },
      {
        uniform: "uNebulaColor",
        label: "星雲の色",
        hint: "星雲の基本色です。",
        kind: "color",
      },
      {
        uniform: "uNebulaAccentColor",
        label: "星雲の差し色",
        hint: "濃い部分に混ざる色です。",
        kind: "color",
      },
    ],
    shader: {
      kind: "classic-r3f",
      sourceModulePath: "studio://sky-shader/nebula-space",
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: NEBULA_FRAGMENT_SHADER,
      uniforms: {
        ...frameworkUniforms(),
        uZenithColor: { kind: "color", value: "#04030f" },
        uHorizonColor: { kind: "color", value: "#0a0718" },
        uStarColor: { kind: "color", value: "#e6ecff" },
        uNebulaColor: { kind: "color", value: "#3b2f7a" },
        uNebulaAccentColor: { kind: "color", value: "#c2478f" },
        uStarCount: { kind: "number", value: 2600 },
        uStarBrightness: { kind: "number", value: 1.5 },
        uStarSize: { kind: "number", value: 0.14 },
        uTwinkleSpeed: { kind: "number", value: 0.6 },
        uNebulaStrength: { kind: "number", value: 1.1 },
        uNebulaScale: { kind: "number", value: 2.6 },
        uDriftSpeed: { kind: "number", value: 0.6 },
      },
      variants: skyVariants(),
      animatedTimeUniform: "uTime",
    },
  },
];

export const SKY_SHADER_CATEGORIES = [
  "day",
  "dusk",
  "dawn",
  "night",
  "aurora",
  "space",
] as const satisfies readonly SkyShaderCatalogCategory[];

export function skyShaderCategoryLabel(
  category: SkyShaderCatalogCategory,
): string {
  if (category === "day") return "昼";
  if (category === "dusk") return "夕暮れ";
  if (category === "dawn") return "朝焼け";
  if (category === "night") return "夜空";
  if (category === "aurora") return "オーロラ";
  return "宇宙";
}

export function getSkyShaderCatalogEntry(
  entryId: string,
): SkyShaderCatalogEntry | undefined {
  return SKY_SHADER_CATALOG.find((entry) => entry.id === entryId);
}

/**
 * Applies store-side parameter edits to a preset. Unknown uniform names and
 * kind mismatches are dropped rather than written, so a stale control cannot
 * push an invalid uniform into the Material Asset.
 */
export function applySkyShaderParameters(
  entry: SkyShaderCatalogEntry,
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

/** The store's initial control values, read straight from the preset. */
export function defaultSkyShaderParameterValues(
  entry: SkyShaderCatalogEntry,
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
