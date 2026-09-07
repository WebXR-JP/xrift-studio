import { LIGHTING_CONTRACT_GLSL_UNIFORMS } from "./lighting-contract";
import { WIND_CONTRACT_GLSL_UNIFORMS } from "./wind-contract";

/**
 * Texture-free water for the existing Classic R3F material contract.
 * No scene colour/depth texture, reflection camera, or custom runtime is required.
 * Gerstner derivatives retain the MIT-adapted MochiesCode implementation from v1.
 * All other surface effects below are authored for this catalog.
 */
const WAVE_UNIFORMS = `uniform float uTime;
${WIND_CONTRACT_GLSL_UNIFORMS}
uniform float uWaveHeight;
uniform float uWaveScale;
uniform float uWaveLayers;
uniform float uWaveSpeed;
uniform float uWaveDisplacement;`;

const WAVE_MATH = `const float XRIFT_WATER_TAU = 6.28318530718;
const float XRIFT_WATER_PI = 3.14159265359;

vec2 xriftWaterRotate(vec2 d, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * d.x - s * d.y, s * d.x + c * d.y);
}

// Adapted from Mochie's Unity Shaders, MIT, (c) 2020 MochiesCode.
vec3 xriftWaterGerstner(vec2 direction, float steepness, float wavelength,
  float phase, vec3 point, inout vec3 tangent, inout vec3 binormal) {
  float k = XRIFT_WATER_TAU / max(wavelength, 0.001);
  float c = sqrt(9.8 / k);
  vec2 d = normalize(direction);
  float f = mod(k * dot(d, point.xz) - k * c * phase, XRIFT_WATER_TAU);
  float s = steepness, a = s / k;
  float sinF = sin(f), cosF = cos(f);
  tangent += vec3(-d.x * d.x * s * sinF, d.x * s * cosF, -d.x * d.y * s * sinF);
  binormal += vec3(-d.x * d.y * s * sinF, d.y * s * cosF, -d.y * d.y * s * sinF);
  return vec3(d.x * a * cosF, a * sinF, d.y * a * cosF);
}

struct WaterWave {
  vec3 displacement;
  vec3 normal;
  float crest;
  float compression;
};

WaterWave xriftWaterWaves(vec3 p, vec2 windDirection, float phase) {
  vec3 tangent = vec3(1.0, 0.0, 0.0), binormal = vec3(0.0, 0.0, 1.0);
  vec3 displacement = vec3(0.0);
  // Gust changes amplitude, never accumulated phase. A stopped scene stays stopped.
  float gust = 1.0 + clamp(uWindTurbulence, 0.0, 1.0) * 0.2 * sin(phase * 0.35);
  // Budget across ALL four waves, not individually: sum(s_i) <= .7488 < 1.
  // The horizontal Jacobian stays positive even at the highest author setting.
  float steepness = clamp(uWaveHeight * gust, 0.0, 1.0) * 0.32;
  float wavelength = 18.0 / max(uWaveScale, 0.05);
  float layers = clamp(floor(uWaveLayers + 0.5), 1.0, 4.0);
  displacement += xriftWaterGerstner(windDirection, steepness, wavelength,
    phase, p, tangent, binormal);
  float amplitude = steepness * wavelength / XRIFT_WATER_TAU;
  if (layers >= 2.0) {
    displacement += xriftWaterGerstner(xriftWaterRotate(windDirection, 0.59),
      steepness * 0.65, wavelength * 0.47, phase, p, tangent, binormal);
    amplitude += steepness * 0.65 * wavelength * 0.47 / XRIFT_WATER_TAU;
  }
  if (layers >= 3.0) {
    displacement += xriftWaterGerstner(xriftWaterRotate(windDirection, -0.83),
      steepness * 0.42, wavelength * 0.23, phase, p, tangent, binormal);
    amplitude += steepness * 0.42 * wavelength * 0.23 / XRIFT_WATER_TAU;
  }
  if (layers >= 4.0) {
    displacement += xriftWaterGerstner(xriftWaterRotate(windDirection, 1.71),
      steepness * 0.27, wavelength * 0.11, phase, p, tangent, binormal);
    amplitude += steepness * 0.27 * wavelength * 0.11 / XRIFT_WATER_TAU;
  }
  WaterWave wave;
  wave.displacement = displacement;
  wave.normal = normalize(cross(binormal, tangent));
  wave.crest = displacement.y / max(amplitude, 0.0001);
  wave.compression = clamp(1.0 - (tangent.x * binormal.z - tangent.z * binormal.x), 0.0, 1.0);
  return wave;
}

vec2 xriftWaterWindDirection() {
  return length(uWindDirection) > 0.0001 ? normalize(uWindDirection) : vec2(1.0, 0.0);
}`;

export const WATER_VERTEX_SHADER = `${WAVE_UNIFORMS}
${WAVE_MATH}
varying vec3 vWorldPosition;
varying vec3 vSurfacePosition;
varying vec3 vWorldNormal;
#include <fog_pars_vertex>

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  // normalMatrix is inverse-transpose: non-uniformly scaled meshes stay valid.
  vec3 viewNormal = normalize(normalMatrix * normal);
  vWorldNormal = normalize(vec3(dot(viewMatrix[0].xyz, viewNormal),
    dot(viewMatrix[1].xyz, viewNormal), dot(viewMatrix[2].xyz, viewNormal)));
  vWorldPosition = worldPosition.xyz;
  // Off by default: Studio's ordinary Plane has only four vertices.
  // Opt in only on a subdivided horizontal mesh (the pack contains two).
  if (uWaveDisplacement > 0.0) {
    float phase = uTime * max(uWindSpeed, 0.0) * max(uWaveSpeed, 0.0);
    WaterWave wave = xriftWaterWaves(worldPosition.xyz, xriftWaterWindDirection(), phase);
    float horizontalSurface = smoothstep(0.85, 0.99, abs(vWorldNormal.y));
    worldPosition.xyz += wave.displacement * clamp(uWaveDisplacement, 0.0, 1.0) * horizontalSurface;
  }
  vSurfacePosition = worldPosition.xyz;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const SURFACE_UNIFORMS = `${WAVE_UNIFORMS}
${LIGHTING_CONTRACT_GLSL_UNIFORMS}
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uFoamColor;
uniform float uOpacity;
uniform float uReflectivity;
uniform float uFresnelPower;
uniform float uRoughness;
uniform float uGlintStrength;
uniform float uDetailScale;
uniform float uDetailStrength;
uniform float uDetailQuality;
uniform float uFoamAmount;
uniform float uFoamSharpness;
uniform float uFoamScale;
uniform float uCloudReflection;
uniform float uScatterStrength;
uniform float uHazeDistance;
#ifdef WATER_SHORE
uniform float uShoreAngle;
uniform float uShoreOffset;
uniform float uShoreWidth;
#endif
#ifdef WATER_CAUSTICS
uniform float uCausticStrength;
uniform float uCausticScale;
#endif
#ifdef WATER_STREAKS
uniform float uStreakStrength;
#endif
#ifdef WATER_GLOW
uniform vec3 uGlowColor;
uniform float uGlowStrength;
#endif
#ifdef WATER_TOON
uniform float uBandCount;
#endif
#ifdef WATER_PIGMENT
uniform float uPigmentStrength;
#endif
#ifdef WATER_IRIDESCENT
uniform float uIridescence;
#endif
#ifdef WATER_GRID
uniform float uGridScale;
#endif
#ifdef WATER_RAIN
uniform float uRainStrength;
#endif
#ifdef WATER_ICE
uniform float uIceCoverage;
#endif
varying vec3 vWorldPosition;
varying vec3 vSurfacePosition;
varying vec3 vWorldNormal;
#include <fog_pars_fragment>`;

const SURFACE_MATH = `
float xriftWaterHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Value + analytic xy gradient; four hashes, instead of three noise evaluations.
vec3 xriftWaterNoiseGradient(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = xriftWaterHash(i), b = xriftWaterHash(i + vec2(1.0, 0.0));
  float c = xriftWaterHash(i + vec2(0.0, 1.0)), d = xriftWaterHash(i + 1.0);
  float k = a - b - c + d;
  return vec3(a + (b-a)*u.x + (c-a)*u.y + k*u.x*u.y,
    du.x * (b-a + k*u.y), du.y * (c-a + k*u.x));
}
float xriftWaterNoise(vec2 p) { return xriftWaterNoiseGradient(p).x; }

vec3 xriftWaterDetailNormal(vec2 worldXZ, float scale, float strength,
  vec2 windDirection, float phase) {
  vec2 p = worldXZ * max(scale, 0.01);
  vec2 drift = windDirection * phase * 0.28;
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  vec2 slope = xriftWaterNoiseGradient(p - drift).yz * (1.0 - smoothstep(0.35, 1.8, footprint));
  if (uDetailQuality >= 1.0) {
    vec2 q = xriftWaterRotate(p * 2.03, 0.73) + drift * 0.61;
    vec2 gradient = xriftWaterNoiseGradient(q).yz;
    slope += xriftWaterRotate(gradient, -0.73) * 0.52 * (1.0 - smoothstep(0.25, 1.0, footprint));
  }
  if (uDetailQuality >= 2.0) {
    vec2 q = xriftWaterRotate(p * 4.11, -1.11) - drift * 0.43;
    slope += xriftWaterRotate(xriftWaterNoiseGradient(q).yz, 1.11) * 0.23 *
      (1.0 - smoothstep(0.1, 0.5, footprint));
  }
  return normalize(vec3(-slope.x * strength * 0.46, 1.0, -slope.y * strength * 0.46));
}

vec3 xriftWaterSkyReflection(vec3 direction, vec2 drift) {
  float y = clamp(direction.y, 0.0, 1.0);
  vec3 sky = mix(uHorizonColor, uZenithColor, pow(y, 0.42));
  // An authored, procedural sky approximation, not a capture of the scene.
  if (uCloudReflection > 0.001 && uDetailQuality >= 1.0) {
    vec2 cloudUV = direction.xz / max(0.22, y + 0.1) * 1.6;
    float clouds = xriftWaterNoise(cloudUV + drift * 0.015);
    clouds = smoothstep(0.42, 0.79, clouds) * uCloudReflection;
    sky = mix(sky, uHorizonColor * 1.15, clouds * smoothstep(0.0, 0.25, y));
  }
  return sky;
}

float xriftWaterFoam(vec2 p, vec2 drift, float crest, float compression) {
  // Islands of foam, then lace and holes: never a solid white threshold band.
  vec2 q = p * max(uFoamScale, 0.02);
  float macro = xriftWaterNoise(q * 0.28 - drift * 0.13);
  float broken = xriftWaterNoise(q - drift * 0.29 + vec2(macro * 1.9));
  float fine = uDetailQuality >= 1.0 ? xriftWaterNoise(q * 2.7 + drift * 0.17) : broken;
  float threshold = mix(1.12, 0.08, clamp(uFoamAmount, 0.0, 1.0));
  float structure = compression * 1.12 + max(crest, 0.0) * 0.30 + (macro - 0.5) * 0.22;
  float crestMask = smoothstep(threshold, threshold + max(uFoamSharpness, 0.02), structure);
  float lace = smoothstep(0.2, 0.56, broken) * (0.45 + 0.55 * smoothstep(0.17, 0.68, fine));
  return crestMask * lace * step(0.0001, uFoamAmount);
}

float xriftWaterSpecular(vec3 n, vec3 v, vec3 l, float roughness) {
  vec3 sumDirection = l + v;
  vec3 h = sumDirection / max(length(sumDirection), 0.0001);
  float nv = max(dot(n, v), 0.001), nl = max(dot(n, l), 0.0);
  float nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0);
  float a = roughness * roughness, a2 = a * a;
  float den = nh * nh * (a2 - 1.0) + 1.0;
  float distribution = a2 / max(XRIFT_WATER_PI * den * den, 0.000001);
  float k = (roughness + 1.0) * (roughness + 1.0) * 0.125;
  float visibility = nv / (nv * (1.0-k) + k) * nl / max(nl * (1.0-k) + k, 0.001);
  float fresnel = 0.02037 + 0.97963 * pow(1.0-vh, 5.0);
  return min(45.0, distribution * visibility * fresnel / max(4.0 * nv, 0.001));
}

#ifdef WATER_RAIN
// Nine neighbouring cells avoid seams and clipped rings at cell borders.
vec2 xriftWaterRainSlope(vec2 p, float phase) {
  vec2 q = p * 0.8, cell = floor(q), slope = vec2(0.0);
  for (int y=-1; y<=1; y++) {
    for (int x=-1; x<=1; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      float seed = xriftWaterHash(id);
      vec2 centre = id + vec2(seed, xriftWaterHash(id + 17.2));
      float age = fract(phase * 0.7 + seed * 7.0);
      vec2 delta = q - centre;
      float radius = length(delta);
      float ring = radius - age * 0.95;
      float envelope = sin(age * XRIFT_WATER_PI) * (1.0-age);
      float width = max(0.06, fwidth(radius));
      float derivative = -2.0 * ring / (width*width) * exp(-ring*ring/(width*width));
      slope += delta / max(radius, 0.001) * derivative * envelope * 0.018;
    }
  }
  return slope * uRainStrength;
}
#endif

#ifdef WATER_ICE
vec2 xriftWaterIce(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  float first = 10.0, second = 10.0;
  for (int y=-1; y<=1; y++) {
    for (int x=-1; x<=1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 delta = o + vec2(xriftWaterHash(cell+o), xriftWaterHash(cell+o+47.1)) - f;
      float d = dot(delta, delta);
      if (d < first) { second = first; first = d; }
      else { second = min(second, d); }
    }
  }
  return vec2(first, sqrt(second)-sqrt(first));
}
#endif
`;

export const WATER_FRAGMENT_SHADER = `${SURFACE_UNIFORMS}
${WAVE_MATH}
${SURFACE_MATH}

void main() {
  vec2 windDirection = xriftWaterWindDirection();
  float phase = uTime * max(uWindSpeed, 0.0) * max(uWaveSpeed, 0.0);
  vec2 drift = windDirection * phase;
  WaterWave wave = xriftWaterWaves(vWorldPosition, windDirection, phase);
  vec3 detailNormal = xriftWaterDetailNormal(
    vWorldPosition.xz, uDetailScale, uDetailStrength, windDirection, phase);
  vec2 slope = wave.normal.xz / max(wave.normal.y, 0.15) + detailNormal.xz / max(detailNormal.y, 0.15);
#ifdef WATER_RAIN
  if (uRainStrength > 0.0 && uDetailQuality >= 1.0) slope += xriftWaterRainSlope(vWorldPosition.xz, phase);
#endif
  vec3 normal = normalize(vec3(slope.x, 1.0, slope.y));
  // Water is horizontal; assigning it to a wall must not turn the wall normal upward.
  normal = normalize(mix(normalize(vWorldNormal), normal, smoothstep(0.6, 0.98, abs(vWorldNormal.y))));
  vec3 viewDirection = normalize(cameraPosition - vSurfacePosition);
  if (dot(normal, viewDirection) < 0.0) normal = -normal;
  float ndv = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = 0.02037 + 0.97963 * pow(1.0 - ndv, max(uFresnelPower, 0.1));
  vec3 skyColor = xriftWaterSkyReflection(reflect(-viewDirection, normal), drift);
  float crest = clamp(wave.crest, -1.0, 1.0);
  float shallow = clamp(0.13 + (1.0-ndv)*0.19 + max(crest, 0.0)*0.19, 0.0, 1.0);
  vec3 body = mix(uDeepColor, uShallowColor, shallow);
  float foam = xriftWaterFoam(vWorldPosition.xz, drift, crest, wave.compression);
  float shoreMask = 1.0;

#ifdef WATER_SHORE
  // Author-specified straight shoreline; there is NO terrain/depth lookup here.
  float angle = uShoreAngle * XRIFT_WATER_PI / 180.0;
  vec2 shoreDirection = vec2(cos(angle), sin(angle));
  float distanceToShore = dot(vWorldPosition.xz, shoreDirection) - uShoreOffset;
  float width = max(uShoreWidth, 0.1);
  float along = dot(vWorldPosition.xz, vec2(-shoreDirection.y, shoreDirection.x));
  float swash = (0.45 + 0.4 * sin(phase * 0.7 + sin(along * 0.21)*0.28)) * width;
  float shoreNoise = xriftWaterNoise(vWorldPosition.xz * uFoamScale - drift * 0.3);
  float edge = distanceToShore - swash;
  float edgeAA = max(fwidth(edge), 0.025);
  shoreMask = smoothstep(-edgeAA, edgeAA + width * 0.16, edge);
  float swashFoam = (1.0-smoothstep(width*0.07, width*0.4, abs(edge))) *
    smoothstep(0.2, 0.65, shoreNoise);
  float breakers = pow(max(0.0, sin(distanceToShore/width * 3.5 - phase * 0.9 + shoreNoise)), 10.0);
  breakers *= (1.0-smoothstep(width, width*4.0, distanceToShore)) * shoreMask;
  foam = max(foam, (swashFoam * 0.9 + breakers * 0.4) * clamp(uFoamAmount * 2.5, 0.0, 1.0));
  body = mix(uShallowColor, body, smoothstep(0.0, width * 5.0, distanceToShore));
#endif

#ifdef WATER_CAUSTICS
  // Decorative surface caustics, NOT refracted illumination on scene geometry.
  vec2 causticUV = vWorldPosition.xz * max(uCausticScale, 0.01);
  float warp = xriftWaterNoise(causticUV * 0.6 - drift * 0.09);
  float c1 = xriftWaterNoise(causticUV + warp * 0.8 + drift * 0.12);
  float c2 = xriftWaterNoise(xriftWaterRotate(causticUV * 1.37, 0.9) - drift * 0.1);
  float ridge = min(abs(c1-0.5), abs(c2-0.5));
  float aa = max(fwidth(ridge), 0.006);
  float caustics = 1.0 - smoothstep(0.025, 0.055 + aa, ridge);
  float detailFade = 1.0-smoothstep(0.8, 2.5, max(length(dFdx(causticUV)), length(dFdy(causticUV))));
  vec3 causticLight = uShallowColor * caustics * uCausticStrength * ndv * detailFade * 0.5;
  body += causticLight;
#endif

#ifdef WATER_STREAKS
  vec2 streakUV = vec2(dot(vWorldPosition.xz, windDirection)*0.11,
    dot(vWorldPosition.xz, vec2(-windDirection.y, windDirection.x))*1.7);
  float streak = xriftWaterNoise(streakUV - vec2(phase*0.12, 0.0));
  streak = smoothstep(0.65, 0.87, streak) * (0.25 + 0.75 * max(crest, 0.0));
  foam = max(foam, streak * uStreakStrength * uFoamAmount);
#endif

  vec3 lightDirection = uSunDirection / max(length(uSunDirection), 0.0001);
  float lightAbove = smoothstep(-0.04, 0.08, lightDirection.y);
  float nl = max(dot(normal, lightDirection), 0.0);
  float ambient = max(uAmbientIntensity, 0.0);
  body *= uAmbientColor * (0.24 + ambient * 0.76) +
    uSunColor * max(uSunIntensity, 0.0) * nl * lightAbove * 0.28;
  // Backlit crests transmit more light; this is an artistic scattering approximation.
  float scatter = pow(max(dot(viewDirection, -lightDirection), 0.0), 3.0) * max(crest, 0.0);
  body += uShallowColor * uSunColor * max(uSunIntensity, 0.0) *
    scatter * uScatterStrength * lightAbove * 0.4;
  float normalVariance = dot(dFdx(normal), dFdx(normal)) + dot(dFdy(normal), dFdy(normal));
  float roughness = clamp(sqrt(uRoughness*uRoughness + min(normalVariance, 0.15)), 0.065, 0.95);
  float glint = xriftWaterSpecular(normal, viewDirection, lightDirection, roughness);
  vec3 color = mix(body, skyColor, clamp(fresnel * uReflectivity, 0.0, 1.0));
  color += uSunColor * max(uSunIntensity, 0.0) * glint * uGlintStrength * lightAbove;

#ifdef WATER_TOON
  float bands = max(floor(uBandCount + 0.5), 2.0);
  float shade = floor(clamp(0.4 + crest * 0.22 + nl * 0.38, 0.0, 1.0) * bands) / bands;
  vec3 toonBody = mix(uDeepColor, uShallowColor, shade);
  float bandedFresnel = floor(fresnel * bands) / bands;
  color = mix(toonBody, skyColor, bandedFresnel * uReflectivity);
#ifdef WATER_CAUSTICS
  color += causticLight * (1.0 - bandedFresnel);
#endif
  float contour = abs(crest - 0.48 + detailNormal.x * 0.22);
  float contourWidth = max(fwidth(contour), 0.025);
  foam = max(foam, (1.0-smoothstep(0.025, 0.045 + contourWidth, contour)) * uFoamAmount);
  color += uSunColor * max(uSunIntensity, 0.0) * smoothstep(0.08, 0.3, glint) * uGlintStrength * 0.35 * lightAbove;
#endif


#ifdef WATER_INK
  float contour = abs(sin((crest + xriftWaterNoise(vWorldPosition.xz * 0.14)*0.25) * 12.0));
  float aa = max(fwidth(contour), 0.04);
  float lines = 1.0-smoothstep(0.1, 0.16+aa, contour);
  float hatch = 1.0-smoothstep(0.08, 0.13 + max(fwidth(vWorldPosition.x*1.7+vWorldPosition.z), 0.01),
    abs(sin(vWorldPosition.x*1.7+vWorldPosition.z)));
  color = mix(uShallowColor, uDeepColor, clamp(lines*0.8 + hatch*(1.0-ndv)*0.25, 0.0, 1.0));
#endif

#ifdef WATER_PIGMENT
  float pigment = xriftWaterNoise(vWorldPosition.xz * 0.32 - drift * 0.015);
  float grain = xriftWaterNoise(vWorldPosition.xz * 4.2);
  float pigmentAA = 1.0-smoothstep(0.4, 2.0, length(fwidth(vWorldPosition.xz * 4.2)));
  color *= 1.0 + (pigment - 0.5) * uPigmentStrength * 0.7;
  color += uShallowColor * (grain-0.5) * uPigmentStrength * 0.12 * pigmentAA;
  foam *= smoothstep(0.12, 0.65, pigment + grain * 0.3);
#endif

#ifdef WATER_IRIDESCENT
  vec3 spectrum = 0.5 + 0.5 * cos(vec3(0.0, 2.094, 4.188) +
    (1.0-ndv) * 13.0 + crest * 2.0 + xriftWaterNoise(vWorldPosition.xz*0.25)*2.0);
  color = mix(color, color * (0.45 + spectrum * 1.9) + spectrum * 0.035,
    clamp(uIridescence, 0.0, 1.0) * (0.3+0.7*fresnel));
#endif

#ifdef WATER_ICE
  vec2 iceUV = vWorldPosition.xz * 0.42 + wave.normal.xz * 0.25;
  vec2 ice = xriftWaterIce(iceUV);
  float edgeAA = max(fwidth(ice.y), 0.015);
  float floe = smoothstep(0.035, 0.075+edgeAA, ice.y) *
    (1.0-smoothstep(uIceCoverage, uIceCoverage+0.14, xriftWaterNoise(iceUV*0.37)));
  floe *= smoothstep(0.0, 0.05, uIceCoverage);
  float frost = xriftWaterNoise(iceUV * 9.0) * 0.12;
  color = mix(color, mix(uShallowColor, uFoamColor, 0.42+frost), floe * 0.88);
#endif

  vec3 litFoam = uFoamColor * (uAmbientColor * (0.28 + ambient*0.72) +
    uSunColor * max(uSunIntensity, 0.0) * 0.38 * lightAbove);
  color = mix(color, litFoam, clamp(foam, 0.0, 1.0));

#ifdef WATER_GLOW
  float filament = pow(max(0.0, crest), 3.0) *
    smoothstep(0.44, 0.76, xriftWaterNoise(vWorldPosition.xz*1.8-drift*0.2));
  float speckle = pow(xriftWaterNoise(vWorldPosition.xz*9.0-drift*0.08), 18.0);
  speckle *= 1.0-smoothstep(0.4, 1.5, length(fwidth(vWorldPosition.xz*9.0)));
  color += uGlowColor * uGlowStrength * (foam * 1.5 + filament * 0.5 + speckle * 0.8);
#endif
#ifdef WATER_GRID
  vec2 gridUV = vWorldPosition.xz * max(uGridScale, 0.01) + wave.normal.xz * 0.4;
  vec2 edge = abs(fract(gridUV-0.5)-0.5);
  vec2 aa = max(fwidth(gridUV), vec2(0.001));
  vec2 lines = 1.0-smoothstep(aa*0.65, aa*1.7, edge);
  float gridFade = 1.0-smoothstep(0.3, 0.85, max(aa.x, aa.y));
  float scan = 0.55 + 0.45 * sin(dot(vWorldPosition.xz, windDirection)*0.5-phase);
  color += uGlowColor * max(lines.x, lines.y) * uGlowStrength * scan * gridFade;
#endif

  // Gentle aerial perspective on long planes, independently of scene fog.
  float distanceToCamera = length(cameraPosition.xz - vSurfacePosition.xz);
  float haze = (1.0-exp(-distanceToCamera/max(uHazeDistance, 1.0))) * 0.48;
  color = mix(color, uHorizonColor, haze);
  float alpha = mix(clamp(uOpacity, 0.0, 1.0), 1.0, clamp(fresnel*0.75 + foam*0.6, 0.0, 1.0));
  // Opacity zero must really hide the surface; preserve the shore's transparent edge.
  alpha *= shoreMask * smoothstep(0.0, 0.015, uOpacity);
  gl_FragColor = vec4(max(color, vec3(0.0)), clamp(alpha, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
