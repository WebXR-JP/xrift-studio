import type { ClassicR3fMaterialShader, ClassicR3fShaderUniform } from "./custom-shader-contract";
import type { SkyShaderCatalogCategory, SkyShaderCatalogEntry, SkyShaderParameter } from "./sky-shader-catalog";
import { SKY_VERTEX_SHADER, SKY_COMMON_GLSL } from "./sky-shader-glsl";

/** Original, texture-free sky programs. No remote URLs, sampler assets or
 * runtime-only effects are required; a preset installs as editable GLSL.
 * These are art-directed approximations, not a physically calibrated sky model.
 */
const HEADER = `uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uPrimaryColor;
uniform vec3 uSecondaryColor;
uniform float uScale;
uniform float uSpeed;
uniform float uIntensity;
uniform float uSeed;
uniform float uStarCount;
uniform float uStarBrightness;
uniform float uStarSize;
uniform float uTwinkleSpeed;
uniform float uExposure;
uniform float uRotation;
uniform float uTime;
varying vec3 vDirection;
${SKY_COMMON_GLSL}
#ifndef XRIFT_SKY_DETAIL
#define XRIFT_SKY_DETAIL 4
#endif
#ifndef XRIFT_SKY_CLOUD_STEPS
#define XRIFT_SKY_CLOUD_STEPS 18
#endif
#ifndef XRIFT_SKY_AURORA_STEPS
#define XRIFT_SKY_AURORA_STEPS 18
#endif

float skyDetail(vec3 p) {
  float sum = 0.0;
  float weight = 0.5333333;
  const mat3 turn = mat3(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64);
  for (int i = 0; i < XRIFT_SKY_DETAIL; i++) {
    sum += xriftSkyNoise(p) * weight;
    p = turn * p * 2.03 + vec3(5.17, 1.39, 8.73);
    weight *= 0.5;
  }
  return sum;
}

vec3 skyDirection() { return xriftSkyRotateY(normalize(vDirection), uRotation); }
vec3 skyGradient(vec3 d) {
  vec3 c = mix(uHorizonColor, uZenithColor, pow(max(d.y, 0.0), 0.48));
  return mix(c, uGroundColor, (1.0 - smoothstep(-0.4, -0.015, d.y)));
}

// A stable spherical star pattern; only brightness twinkles, never positions.
vec3 skyStars(vec3 d) {
  float stars = xriftSkyStarField(d, uStarCount, uStarSize, uTime, uTwinkleSpeed);
  float warmth = xriftSkyNoise(d * 87.0 + 31.0);
  return mix(vec3(0.68, 0.79, 1.0), vec3(1.0, 0.88, 0.65), warmth)
    * stars * uStarBrightness;
}

vec3 skyRight(vec3 axis) {
  return normalize(cross(abs(axis.y) > 0.98 ? vec3(0,0,1) : vec3(0,1,0), axis));
}

// Tangent coordinates around a celestial body's centre. No UV seam at poles.
vec2 skyBodyUV(vec3 d, vec3 axis) {
  vec3 right = skyRight(axis);
  return vec2(dot(d, right), dot(d, cross(axis, right)));
}

float skyDisc(vec3 d, vec3 axis, float radius) {
  float chord = length(d - axis);
  float r = 2.0 * sin(radius * 0.5);
  float aa = max(fwidth(chord), 0.00008);
  return 1.0 - smoothstep(r-aa, r+aa, chord);
}

float skySphereHit(vec3 ro, vec3 rd, vec3 center, float radius) {
  vec3 oc = ro - center;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - radius * radius;
  float h = b * b - c;
  if (h < 0.0) return -1.0;
  float nearHit = -b - sqrt(h);
  return nearHit > 0.0 ? nearHit : -1.0;
}
`;
const OUTPUT = `
  gl_FragColor = vec4(max(color, vec3(0.0)) * max(uExposure, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Cumulus / cirrus / aerial haze / storm / cloud sea. Ray steps are bounded,
// the light probe is short, and opaque portions stop marching early.
const ATMOSPHERE = `${HEADER}
uniform float uCloudCoverage;
uniform float uCloudDensity;
uniform float uSunAzimuth;
uniform float uSunElevation;
uniform float uSunSize;
uniform float uSunStrength;
uniform float uHaze;
uniform float uRain;
uniform float uRidgeStrength;
uniform float uRidgeHeight;
#ifndef XRIFT_ATMOS_MODE
#define XRIFT_ATMOS_MODE 0
#endif

float cloudShape(vec3 p) {
  vec3 q = p * uScale + vec3(uTime * uSpeed * 0.028, uSeed, 0.0);
  float weather = xriftSkyFbm(vec3(q.x * 0.31, 2.0, q.z * 0.31));
  float shape = skyDetail(q);
  float threshold = mix(0.7, 0.18, uCloudCoverage) + (weather - 0.4) * 0.18;
  return max(shape - threshold, 0.0);
}
float cloudDensity(vec3 p) {
  if (p.y < 1.0 || p.y > 2.15 || uCloudCoverage <= 0.0) return 0.0;
  float h = (p.y - 1.0) / 1.15;
  float profile = smoothstep(0.0, 0.17, h) * (1.0 - smoothstep(0.48, 1.0, h));
  return cloudShape(p) * profile * uCloudDensity * 4.0;
}

void main() {
  vec3 d = skyDirection();
  vec3 sunDir = xriftSkyBodyDirection(uSunAzimuth, uSunElevation);
  float sunDot = max(dot(d, sunDir), 0.0);
  vec3 color = skyGradient(d);
  float horizon = exp(-abs(d.y) * 7.0);
  color += uPrimaryColor * pow(sunDot, 20.0) * uSunStrength * 0.15;
  color = mix(color, uHorizonColor, horizon * uHaze * 0.35);
  float disc = skyDisc(d, sunDir, radians(uSunSize));
  color += uPrimaryColor * (disc * 3.0 + pow(sunDot, 320.0) * 0.3) * uSunStrength;

#if XRIFT_ATMOS_MODE == 1
  // Two wind-sheared high-altitude sheets: no volume march for wispy cirrus.
  vec2 uv = d.xz / (max(d.y, 0.0) + 0.2);
  float mask = smoothstep(0.0, 0.18, d.y);
  vec3 p = vec3(uv.x * 0.7, uv.y * 2.8, uSeed) * uScale;
  p.x += uTime * uSpeed * 0.02;
  float curl = xriftSkyFbm(p * 0.5);
  float n = skyDetail(p + vec3(curl * 1.4, 0.0, 0.0));
  float wisps = smoothstep(0.57 - uCloudCoverage * 0.23, 0.79, n);
  float veil = smoothstep(0.52, 0.77, skyDetail(p * 1.8 + 13.0)) * 0.3;
  color = mix(color, uPrimaryColor * 1.08, (wisps + veil) * mask * uCloudDensity * uCloudCoverage);
#elif XRIFT_ATMOS_MODE == 2
  // Direction-space dust/haze, with an optical-depth-like horizon falloff.
  float n = skyDetail(d * (uScale * 2.0) + vec3(uTime * uSpeed * 0.015, uSeed, 0.0));
  float dust = (0.3 + 0.7 * n) * exp(-abs(d.y - 0.05) * 2.4) * uHaze;
  color = mix(color, mix(uSecondaryColor, uPrimaryColor, n), clamp(dust, 0.0, 0.85));
#else
  if (d.y > 0.01 && uCloudCoverage > 0.0) {
    float start = 1.0 / d.y;
    float finish = min(2.15 / d.y, 55.0);
    if (finish > start) {
      float stepSize = (finish - start) / float(XRIFT_SKY_CLOUD_STEPS);
      float trans = 1.0;
      vec3 scatter = vec3(0.0);
      // Direction-space jitter is stable across frames and both XR eyes.
      float jitter = 0.35 + 0.3 * xriftSkyNoise(d * 350.0);
      for (int i = 0; i < XRIFT_SKY_CLOUD_STEPS; i++) {
        if (trans < 0.02) break;
        vec3 p = d * (start + (float(i) + jitter) * stepSize);
        float density = cloudDensity(p);
        if (density > 0.002) {
          float lightDepth = cloudDensity(p + sunDir * 0.22) * 0.55
            + cloudDensity(p + sunDir * 0.56) * 0.3;
          float lit = exp(-lightDepth * 1.4);
          float silver = pow(sunDot, 24.0) * pow(lit, 3.0) * 0.55;
          float heightLight = smoothstep(1.0, 1.85, p.y) * 0.15;
          vec3 albedo = mix(uSecondaryColor, uPrimaryColor, clamp(lit * 0.82 + heightLight, 0.0, 1.0));
          albedo += uPrimaryColor * silver * uSunStrength;
          float absorbed = 1.0 - exp(-density * stepSize * 1.4);
          scatter += trans * absorbed * albedo;
          trans *= 1.0 - absorbed;
        }
      }
      float fade = smoothstep(0.01, 0.07, d.y);
      color = mix(color, color * trans + scatter, fade);
    }
  }
#endif
#if XRIFT_ATMOS_MODE == 3
  // Distant rain shafts only; deliberately no rapid full-screen lightning.
  float az = atan(d.z, d.x);
  vec3 ring = vec3(cos(az), sin(az), uSeed);
  float rain = pow(xriftSkyFbm(ring * 11.0 + vec3(0.0, 0.0, uTime * uSpeed * 0.03)), 3.0);
  rain *= smoothstep(-0.03, 0.08, d.y) * (1.0 - smoothstep(0.12, 0.55, d.y));
  color = mix(color, uSecondaryColor * 0.7, rain * uRain * 3.0);
#endif
#if XRIFT_ATMOS_MODE == 4
  // A lower sea of cloud wisps, kept continuous below the horizon.
  // Intersect a plane below the camera, rather than stretching one azimuthal
  // sample vertically down the hemisphere. The distant layer dissolves in haze.
  vec2 seaUV = d.xz / max(-d.y + 0.14, 0.14);
  vec3 seaPoint = vec3(seaUV.x, uSeed, seaUV.y) * uScale * 1.8;
  seaPoint.x += uTime * uSpeed * 0.02;
  float sea = skyDetail(seaPoint);
  float billow = smoothstep(0.24, 0.68, sea);
  float detail = skyDetail(seaPoint * 2.4 + 13.0);
  vec3 seaColor = mix(uSecondaryColor, uPrimaryColor, 0.4 + billow * 0.48 + detail * 0.1);
  seaColor = mix(seaColor, uHorizonColor, exp(-abs(d.y) * 8.0) * 0.78);
  float seaMask = 1.0 - smoothstep(-0.04, 0.07, d.y);
  color = mix(color, seaColor * 0.9, seaMask);
#endif
  if (uRidgeStrength > 0.0) {
    float far = xriftSkyRidgeMask(d, uRidgeHeight * 0.55, 1.7, uSeed + 8.0);
    float near = xriftSkyRidgeMask(d, uRidgeHeight, 2.2, uSeed + 17.0);
    color = mix(color, mix(uHorizonColor, uGroundColor, 0.55), far * uRidgeStrength);
    color = mix(color, uGroundColor, near * uRidgeStrength);
  }
  color *= uIntensity;
${OUTPUT}`;

const CELESTIAL = `${HEADER}
uniform float uBodyAzimuth;
uniform float uBodyElevation;
uniform float uBodySize;
uniform float uPhase;
uniform float uHaloRadius;
uniform float uRingTilt;
uniform float uNebulaStrength;
#ifndef XRIFT_CELESTIAL_MODE
#define XRIFT_CELESTIAL_MODE 0
#endif

vec3 galacticDust(vec3 d) {
  vec3 axis = normalize(vec3(0.48, 0.35, -0.8));
  float latitude = dot(d, axis);
  float broad = exp(-latitude * latitude * 15.0);
  float narrow = exp(-latitude * latitude * 95.0);
  vec3 p = d * uScale * 3.2 + uSeed;
  float structure = skyDetail(p);
  float fine = skyDetail(p * 3.1 + structure * 2.5);
  float darkLane = smoothstep(0.37, 0.63, fine) * narrow;
  vec3 dust = mix(uPrimaryColor, uSecondaryColor, structure);
  dust *= (broad * 0.15 + narrow * pow(structure, 2.0) * 2.2);
  return dust * (1.0 - darkLane * 0.9) * uNebulaStrength;
}

void main() {
  vec3 d = skyDirection();
  vec3 axis = xriftSkyBodyDirection(uBodyAzimuth, uBodyElevation);
  vec3 right = skyRight(axis);
  vec3 up = cross(axis, right);
  vec2 uv = skyBodyUV(d, axis);
  float radius = radians(uBodySize);
  float angle = length(d - axis);
  float disk = skyDisc(d, axis, radius);
  vec3 color = mix(uHorizonColor, uZenithColor, d.y * 0.5 + 0.5);
  color += galacticDust(d) + skyStars(d);
#if XRIFT_CELESTIAL_MODE == 0
  float r = max(sin(radius), 0.0001);
  vec2 local = uv / r;
  vec3 normal = vec3(local, sqrt(max(1.0-dot(local,local), 0.0)));
  float phaseAngle = (1.0 - uPhase) * 3.14159265;
  float lit = max(dot(normal, vec3(sin(phaseAngle), 0.0, cos(phaseAngle))), 0.0);
  float maria = smoothstep(0.25, 0.67, skyDetail(normal * 6.0 + uSeed));
  float craters = skyDetail(normal * 23.0 + 3.0);
  vec3 moon = uPrimaryColor * (0.53 + maria * 0.45 + craters * 0.17) * (0.035 + lit * 1.4);
  color = mix(color, moon, disk);
  float halo = exp(-pow((angle - radians(uHaloRadius)) / 0.018, 2.0));
  color += uSecondaryColor * (halo * 0.07 + exp(-angle * 11.0) * 0.06) * uIntensity;
  color = mix(uGroundColor, color, smoothstep(-0.12, 0.03, d.y));
#elif XRIFT_CELESTIAL_MODE == 1
  // The tilted galactic core and dark lanes occupy the whole dome.
  color += galacticDust(xriftSkyRotateY(d, 0.16)) * 0.35;
  color = mix(uGroundColor, color, smoothstep(-0.13, 0.04, d.y));
#elif XRIFT_CELESTIAL_MODE == 2
  // Analytic planet sphere and ray/plane ring intersection with correct depth.
  float planetRadius = 5.0 * sin(radius);
  vec3 center = axis * 5.0;
  vec3 sun = normalize(-axis * 0.65 + right * 0.85 + up * 0.5);
  float hit = skySphereHit(vec3(0.0), d, center, planetRadius);
  vec3 n = normalize(d * max(hit, 0.001) - center);
  float band = sin(n.y * 35.0 + skyDetail(n * 5.0 + uSeed) * 8.0);
  float turbulence = skyDetail(n * 11.0 + uSeed);
  vec3 surface = mix(uPrimaryColor, uSecondaryColor, clamp(0.45 + band * 0.24 + turbulence * 0.3, 0.0, 1.0));
  surface *= 0.035 + max(dot(n, sun), 0.0) * 1.3;
  float limb = pow(1.0 - max(dot(n, -d), 0.0), 3.0);
  surface += uSecondaryColor * limb * max(dot(n, sun), 0.0) * 0.4;
  if (hit > 0.0) color = mix(color, surface, disk);
  float outer = exp(-pow((angle - radius) / 0.008, 2.0));
  color += uSecondaryColor * outer * 0.14 * max(dot(d, sun) + 0.5, 0.0);
  float tilt = radians(uRingTilt);
  vec3 ringNormal = normalize(up * cos(tilt) - axis * sin(tilt) + right * 0.16);
  float denom = dot(d, ringNormal);
  float ringT = dot(center, ringNormal) / (abs(denom) < 0.0001 ? 0.0001 : denom);
  vec3 ringPos = d * ringT - center;
  float ringR = length(ringPos) / max(planetRadius, 0.01);
  float aa = clamp(fwidth(ringR), 0.001, 0.06);
  float ringMask = smoothstep(1.27-aa, 1.27+aa, ringR) * (1.0-smoothstep(2.15-aa, 2.15+aa, ringR));
  float gap = 1.0 - smoothstep(0.012, 0.022, abs(ringR - 1.77));
  // Smooth high-frequency rings at distance instead of aliasing bright lines.
  float frequencyFade = 1.0 - smoothstep(0.008, 0.035, aa);
  float bands = 0.62 + 0.15 * sin(ringR * 95.0) * frequencyFade + 0.17 * sin(ringR * 27.0);
  if (ringT > 0.0 && (hit < 0.0 || ringT < hit) && ringMask > 0.0) {
    float shadow = skySphereHit(d * ringT + sun * 0.01, sun, center, planetRadius) > 0.0 ? 0.16 : 1.0;
    vec3 rings = mix(uSecondaryColor, uPrimaryColor, clamp((ringR-1.27)/0.88, 0.0, 1.0));
    color = mix(color, rings * bands * shadow, ringMask * (0.8 - gap * 0.75));
  }
#elif XRIFT_CELESTIAL_MODE == 3
  vec2 local = uv / max(sin(radius), 0.001);
  vec3 normal = vec3(local, sqrt(max(1.0 - dot(local, local), 0.0)));
  vec3 p = normal * uScale * 7.0 + vec3(0.0, uTime * uSpeed * 0.025, uSeed);
  float convection = skyDetail(p + skyDetail(p * 0.4) * 2.0);
  float cells = pow(abs(sin(convection * 16.0)), 0.7);
  float limb = pow(max(normal.z, 0.0), 0.4);
  vec3 star = mix(uSecondaryColor, uPrimaryColor, cells) * (1.0 + limb * 1.8);
  float corona = exp(-max(angle-radius, 0.0) * 20.0) * (1.0-disk);
  float polar = atan(uv.y, uv.x);
  corona *= 0.5 + 0.2 * sin(polar * 13.0 + uTime * uSpeed * 0.03) + 0.12 * sin(polar * 31.0);
  color += uSecondaryColor * corona * 0.6;
  color = mix(color, star, disk);
#elif XRIFT_CELESTIAL_MODE == 4
  vec3 p = d * uScale * 2.6 + vec3(uSeed, 0.0, uTime * uSpeed * 0.008);
  float warp = skyDetail(p * 0.6);
  float n = skyDetail(p + vec3(warp, -warp, warp) * 2.0);
  float vein = skyDetail(p * 3.5 + n * 2.0);
  float smoke = smoothstep(0.25, 0.75, n);
  float dust = smoothstep(0.37, 0.67, vein);
  color += mix(uPrimaryColor, uSecondaryColor, smoothstep(0.3, 0.68, n))
    * smoke * (1.0 - dust * 0.87) * uNebulaStrength * 1.7;
#elif XRIFT_CELESTIAL_MODE == 5
  float polar = atan(uv.y, uv.x);
  float petal = 0.62 + 0.2 * sin(polar * 6.0) + 0.12 * sin(polar * 13.0 + 1.3);
  float corona = exp(-max(angle-radius, 0.0) / max(radius * 0.42 * petal, 0.001));
  float ring = exp(-pow((angle - radius) / 0.003, 2.0));
  color += uPrimaryColor * corona * 1.4 + uSecondaryColor * ring * 2.0;
  // The occulting disc covers the stars as well as the corona.
  color = mix(color, uGroundColor, disk);
#endif
  color *= uIntensity;
${OUTPUT}`;

const AURORA = `${HEADER}
uniform float uAuroraHeight;
uniform float uAuroraWidth;
#ifndef XRIFT_AURORA_MODE
#define XRIFT_AURORA_MODE 0
#endif
void main() {
  vec3 d = skyDirection();
  vec3 color = mix(uHorizonColor, uZenithColor, pow(max(d.y, 0.0), 0.4));
  color += skyStars(d) * smoothstep(-0.03, 0.16, d.y);
  vec3 emission = vec3(0.0);
  float time = uTime * uSpeed * 0.06;
  // Fibres follow the same azimuth through the whole column of atmosphere.
  // A per-sample sine would produce a checkerboard as the height changes.
  float az = atan(d.z, d.x);
  vec3 fibreP = vec3(cos(az), sin(az), uSeed * 0.1);
  float fibres = xriftSkyNoise(fibreP * 74.0 + vec3(0.0, 0.0, time * 0.3));
  float broadFibres = xriftSkyNoise(fibreP * 23.0 + vec3(0.0, 0.0, time * 0.18));
  float fiber = 0.28 + 0.48 * fibres + 0.24 * broadFibres;
  if (d.y > 0.025) {
    for (int i = 0; i < XRIFT_SKY_AURORA_STEPS; i++) {
      float h = (float(i) + 0.5) / float(XRIFT_SKY_AURORA_STEPS);
      vec2 p = d.xz * (uAuroraHeight + h * 1.3) / (d.y + 0.13);
      p *= uScale;
      float fold;
#if XRIFT_AURORA_MODE == 1
      float radius = 1.0 + sin(az * 5.0 + time * 0.4) * 0.18
        + sin(az * 9.0 - time * 0.3) * 0.09;
      fold = abs(length(p) - radius);
#else
      float wave = sin(p.x * 0.65 + time) * 0.7 + sin(p.x * 1.43 - time * 0.8) * 0.23;
      fold = abs(sin((p.y + wave + 0.4) * 1.4));
#endif
      // A smooth cross-section overlaps adjacent integration samples instead
      // of leaving discrete horizontal bands at the lower quality settings.
      float baseWidth = max(uAuroraWidth * 0.115, 0.03);
      float footprint = length(d.xz) * 1.3 * uScale
        / ((d.y + 0.13) * float(XRIFT_SKY_AURORA_STEPS));
      float width = sqrt(baseWidth * baseWidth + footprint * footprint * 0.85);
      float density = exp(-pow(fold / width, 2.0)) * baseWidth / width;
      float envelope = sin(h * 3.14159265) * exp(-h * 1.7);
      vec3 tint = mix(uPrimaryColor, uSecondaryColor, smoothstep(0.2, 0.92, h));
      emission += tint * density * fiber * envelope;
    }
  }
  emission *= 17.0 / float(XRIFT_SKY_AURORA_STEPS);
  color += emission * uIntensity * smoothstep(0.025, 0.2, d.y);
  color = mix(uGroundColor, color, smoothstep(-0.12, 0.02, d.y));
${OUTPUT}`;

const RIBBONS = `${HEADER}
uniform float uRibbonWidth;
void main() {
  vec3 d = skyDirection();
  vec3 color = mix(uHorizonColor, uZenithColor, d.y * 0.5 + 0.5) + skyStars(d);
  float time = uTime * uSpeed * 0.025;
  vec3 p = d * uScale;
  float warp = skyDetail(p * 2.5 + vec3(time, uSeed, 0.0)) - 0.5;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec3 axis = normalize(vec3(sin(fi * 1.7), 0.3 + fi * 0.18, cos(fi * 1.7)));
    float plane = dot(d, axis) + warp * 0.32 + sin(fi + time) * 0.12;
    float width = max(uRibbonWidth * (0.8 + fi * 0.15), 0.005);
    float ribbon = exp(-pow(plane / width, 2.0));
    float edge = exp(-pow((abs(plane) - width * 0.95) / (width * 0.09 + fwidth(plane)), 2.0));
    float sheen = pow(max(dot(d, normalize(vec3(-0.6, 0.45, -0.7))), 0.0), 8.0);
    vec3 tint = mix(uPrimaryColor, uSecondaryColor, 0.5 + 0.5 * sin(fi * 1.5 + warp * 5.0));
    color += tint * (ribbon * (0.24 + sheen * 0.55) + edge * 0.35) * uIntensity;
  }
${OUTPUT}`;

const GATE = `${HEADER}
uniform float uBodyAzimuth;
uniform float uBodyElevation;
uniform float uBodySize;
void main() {
  vec3 d = skyDirection();
  vec3 axis = xriftSkyBodyDirection(uBodyAzimuth, uBodyElevation);
  vec2 p = skyBodyUV(d, axis) / max(sin(radians(uBodySize)), 0.01);
  float facing = smoothstep(0.0, 0.5, dot(d, axis));
  float r = length(p);
  float az = atan(p.y, p.x);
  float time = uTime * uSpeed * 0.025;
  vec3 color = mix(uHorizonColor, uZenithColor, d.y * 0.5 + 0.5) + skyStars(d);
  float glow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float radius = 0.65 + fi * 0.22;
    float edge = abs(r - radius);
    float aa = max(fwidth(r), 0.001);
    float arc = 0.55 + 0.45 * smoothstep(-0.6, 0.5, sin(az * (5.0 + fi) + time * (fi + 1.0)));
    glow += (exp(-edge * 35.0) * 0.17 + (1.0-smoothstep(0.003, 0.003+aa, edge)) * 0.55) * arc;
  }
  float ticks = pow(max(sin(az * 72.0 + time), 0.0), 8.0) * exp(-pow((r-1.1)/0.023, 2.0));
  float inner = exp(-r * r * 3.0) * skyDetail(d * uScale * 4.0 + vec3(0.0,time,uSeed));
  color += (uPrimaryColor * (glow + ticks * 0.4) + uSecondaryColor * inner * 0.6) * facing * uIntensity;
${OUTPUT}`;

const CRYSTAL = `${HEADER}
uniform float uEdgeWidth;
void main() {
  vec3 d = skyDirection();
  vec3 p = d * uScale * 3.8 + uSeed;
  vec3 cell = floor(p);
  vec3 f = fract(p);
  float nearest = 100.0;
  float second = 100.0;
  vec3 identity = vec3(0.0);
  // A continuous 3D Voronoi field sampled on a sphere; no cube-face seams.
  for (int z=-1; z<=1; z++) for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
    vec3 offset = vec3(float(x), float(y), float(z));
    vec3 h = xriftSkyHash33(cell + offset);
    vec3 delta = offset + 0.18 + h * 0.64 - f;
    float dist = dot(delta, delta);
    if (dist < nearest) { second = nearest; nearest = dist; identity = h; }
    else if (dist < second) second = dist;
  }
  float edge = second - nearest;
  float aa = max(fwidth(edge), 0.002);
  float line = 1.0 - smoothstep(uEdgeWidth, uEdgeWidth+aa, edge);
  float time = uTime * uSpeed * 0.045;
  float iridescence = 0.5 + 0.5 * sin(dot(d, identity * 4.0) * 3.0 + identity.x * 6.0 + time);
  vec3 tint = mix(uPrimaryColor, uSecondaryColor, iridescence);
  float shine = pow(max(dot(d, normalize(identity - 0.5)), 0.0), 18.0);
  vec3 color = mix(uZenithColor, tint, 0.18 + identity.z * 0.45) * (0.4 + identity.y * 0.6);
  color += tint * line * 0.8 * uIntensity + vec3(1.0) * shine * 0.28;
${OUTPUT}`;

const PAINTED = `${HEADER}
uniform float uCloudCoverage;
uniform float uOutline;
uniform float uSunAzimuth;
uniform float uSunElevation;
uniform float uSunSize;
void main() {
  vec3 d = skyDirection();
  vec3 color = skyGradient(d);
  vec3 sun = xriftSkyBodyDirection(uSunAzimuth, uSunElevation);
  color = mix(color, uPrimaryColor * 1.2, skyDisc(d,sun,radians(uSunSize)));
  vec2 p = d.xz / (max(d.y, 0.0) + 0.3) * uScale;
  vec3 q = vec3(p.x + uTime*uSpeed*0.025, p.y, uSeed);
  float shape = skyDetail(q * 1.2);
  float threshold = mix(0.75,0.25,uCloudCoverage);
  float aa = max(fwidth(shape),0.005);
  float cloud = smoothstep(threshold-aa,threshold+aa,shape) * smoothstep(-0.01,0.15,d.y) * step(0.001,uCloudCoverage);
  float contour = exp(-abs(shape-threshold)*70.0) * uOutline;
  float shadow = smoothstep(threshold+0.025,threshold+0.11,shape);
  vec3 ink = mix(uPrimaryColor,uSecondaryColor,shadow*0.5);
  ink *= 1.0-contour*0.45;
  color = mix(color,ink,cloud);
  float grain = (xriftSkyNoise(d*400.0)-0.5)*0.006;
  color = max(color + grain, vec3(0.0)) * uIntensity;
${OUTPUT}`;

const SYNTHWAVE = `${HEADER}
uniform float uBodyAzimuth;
uniform float uBodyElevation;
uniform float uBodySize;
uniform float uGridStrength;
uniform float uRidgeHeight;
void main() {
  vec3 d = skyDirection();
  vec3 color = skyGradient(d) + skyStars(d) * smoothstep(0.0,0.25,d.y);
  vec3 axis = xriftSkyBodyDirection(uBodyAzimuth,uBodyElevation);
  vec2 uv = skyBodyUV(d,axis)/max(sin(radians(uBodySize)),0.01);
  float disk = skyDisc(d,axis,radians(uBodySize));
  float band = sin((uv.y+1.0)*29.0);
  float aa = max(fwidth(band),0.02);
  float stripe = smoothstep(-0.1-aa,-0.1+aa,band);
  stripe = mix(stripe,1.0,smoothstep(0.0,0.5,uv.y));
  vec3 sun = mix(uSecondaryColor,uPrimaryColor,clamp(uv.y*0.5+0.5,0.0,1.0));
  color += sun * exp(-length(d-axis)*5.0)*0.35;
  color = mix(color,sun*1.6,disk*stripe);
  float ridge = xriftSkyRidgeMask(d,uRidgeHeight,2.6,uSeed);
  color = mix(color,uGroundColor,ridge);
  vec2 plane = d.xz/max(abs(d.y),0.015);
  plane.y += uTime*uSpeed*0.12;
  vec2 g = plane*uScale;
  vec2 pixel = max(fwidth(g),vec2(0.001));
  vec2 line = abs(fract(g-0.5)-0.5)/pixel;
  float grid = 1.0-clamp(min(line.x,line.y),0.0,1.0);
  float fade = (1.0-smoothstep(-0.14,-0.015,d.y)) * exp(-length(plane)*0.018);
  color += uSecondaryColor * grid * fade * uGridStrength * uIntensity;
${OUTPUT}`;

const ABSTRACT = `${HEADER}
#ifndef XRIFT_ABSTRACT_MODE
#define XRIFT_ABSTRACT_MODE 0
#endif
void main() {
  vec3 d = skyDirection();
  float time = uTime*uSpeed*0.04;
  vec3 p = d*uScale*2.0 + vec3(time,uSeed,time*0.37);
  vec3 warp = vec3(skyDetail(p+3.0),skyDetail(p+13.0),skyDetail(p-7.0));
  float n = skyDetail(p+warp*3.5);
  vec3 color;
#if XRIFT_ABSTRACT_MODE == 0
  float bands = sin(n*21.0 + dot(d,vec3(1.0,2.0,-1.0))*1.5);
  float film = 0.5+0.5*bands;
  vec3 spectral = mix(uPrimaryColor,uSecondaryColor,film);
  float highlight = pow(max(0.0,1.0-abs(bands)),10.0);
  float aa = max(fwidth(n),0.0001);
  float pearl = exp(-pow((n-0.53)/(0.04+aa),2.0));
  color = mix(uZenithColor,spectral,0.3+0.7*n) + uHorizonColor*highlight*0.3 + vec3(pearl*0.12);
#else
  float vein = sin(n*45.0 + warp.x*7.0);
  float aa = max(fwidth(vein),0.02);
  float ink = smoothstep(-0.1-aa,0.1+aa,vein);
  float contour = 1.0-smoothstep(0.025,0.06+aa,abs(vein));
  color = mix(uPrimaryColor,uZenithColor,ink*0.91) + uSecondaryColor*contour*0.45;
#endif
  color *= uIntensity;
${OUTPUT}`;

const UNDERWATER = `${HEADER}
uniform float uCausticStrength;
uniform float uShaftStrength;
void main() {
  vec3 d = skyDirection();
  float depth = pow(max(d.y,0.0),0.55);
  vec3 color = mix(uZenithColor,uHorizonColor,depth);
  // Snell-window-like bright cone above the viewer; not a simulated water mesh.
  float window = smoothstep(cos(radians(51.0)),cos(radians(47.0)),d.y);
  vec2 p = d.xz/(max(d.y,0.0)+0.22)*uScale*2.5;
  float time = uTime*uSpeed*0.055;
  float warp = xriftSkyFbm(vec3(p*0.8,time));
  float waves = sin(p.x*3.1+time+warp*4.0) + sin(p.y*3.7-time*0.8) + sin((p.x+p.y)*2.7+warp*3.0);
  float caustic = pow(max(1.0-abs(waves)*0.55,0.0),6.0);
  color += uPrimaryColor * window * (0.16 + caustic*uCausticStrength*0.25);
  float az = atan(d.z,d.x);
  float rays = pow(max(0.0,0.5+0.3*sin(az*17.0+time*0.1)+0.2*sin(az*31.0-time*0.2)),5.0);
  float shaft = rays * smoothstep(-0.35,0.6,d.y)*(1.0-window*0.7);
  color += uSecondaryColor*shaft*uShaftStrength*0.5;
  float rim = exp(-pow((d.y-cos(radians(48.6)))/0.015,2.0));
  color += uPrimaryColor*rim*0.05;
  color *= uIntensity;
${OUTPUT}`;

type Values = Record<string, number | string>;
const BASE_VALUES: Values = {
  uZenithColor: "#040818", uHorizonColor: "#172441", uGroundColor: "#060b15",
  uPrimaryColor: "#7ad7ee", uSecondaryColor: "#b37edb",
  uScale: 1, uSpeed: 0.3, uIntensity: 1, uSeed: 4.7,
  uStarCount: 0, uStarBrightness: 1.8, uStarSize: 0.095, uTwinkleSpeed: 0,
};
const PARAMS: Record<string, SkyShaderParameter> = {};
function numberControl(uniform: string, label: string, min: number, max: number, step: number, hint: string): void {
  PARAMS[uniform] = { uniform, label, kind: "number", min, max, step, hint };
}
for (const [uniform, label, hint] of [
  ["uZenithColor", "天頂・背景の色", "真上または背景の基調色です。"],
  ["uHorizonColor", "地平線・散乱光の色", "空の低い位置や淡い散乱光の色です。"],
  ["uGroundColor", "下半球の色", "地平線より下の背景色です。"],
  ["uPrimaryColor", "主な光・雲の色", "雲の明るい面や主役となる発光の色です。"],
  ["uSecondaryColor", "影・差し色", "雲の影、天体の模様、発光の差し色です。"],
]) PARAMS[uniform] = { uniform, label, hint, kind: "color" };
numberControl("uScale", "模様の細かさ", 0.3, 5, 0.05, "大きくすると雲や模様が細かくなります。");
numberControl("uSpeed", "動きの速さ", 0, 2, 0.02, "0で雲や模様の動きを止めます。星の瞬きは別に設定します。");
numberControl("uIntensity", "表現の強さ", 0, 3, 0.05, "発光や空の色の強さです。Sceneの露出設定とは独立しています。");
numberControl("uSeed", "模様の配置", 0, 50, 0.1, "ノイズの位置を変え、別の雲や模様を作ります。");
numberControl("uStarCount", "星の数（目安）", 0, 14000, 100, "全天のセルを確率的に選ぶため、表示される数は目安です。");
numberControl("uStarBrightness", "星の明るさ", 0, 5, 0.05, "星だけの明るさを調整します。");
numberControl("uStarSize", "星の大きさ", 0.03, 0.18, 0.005, "小さい星は画素の大きさに合わせて滑らかに描きます。");
numberControl("uTwinkleSpeed", "星が瞬く速さ", 0, 3, 0.05, "0で瞬きを止めます。宇宙プリセットでは既定で0です。");
numberControl("uCloudCoverage", "雲の量", 0, 1, 0.02, "0で雲をなくし、1に近づけると空を広く覆います。");
numberControl("uCloudDensity", "雲の厚み", 0.1, 5, 0.05, "大きくすると雲の内側や底が濃くなります。");
numberControl("uSunAzimuth", "太陽の方角", -180, 180, 1, "空全体を回さずに太陽の方角を調整します。");
numberControl("uSunElevation", "太陽の高さ", -10, 85, 1, "太陽の高さを度数で設定します。配色は自動で昼夜変化しません。");
numberControl("uSunSize", "太陽の半径", 0.15, 4, 0.05, "太陽の見かけの半径を度数で設定します。");
numberControl("uSunStrength", "太陽の光", 0, 2, 0.05, "太陽と雲の縁の光の強さです。");
numberControl("uHaze", "霞・砂塵の濃さ", 0, 1.5, 0.02, "地平線の霞や大気の色を濃くします。");
numberControl("uRain", "遠くの雨筋", 0, 1, 0.02, "雲の下に遠くの雨筋を描きます。手前の雨粒ではありません。");
numberControl("uRidgeStrength", "遠景の山", 0, 1, 0.05, "0で山並みを隠します。Sceneの地形とは別の背景表現です。");
numberControl("uRidgeHeight", "遠景の山の高さ", 0, 0.25, 0.005, "背景の山並みの高さです。");
numberControl("uBodyAzimuth", "天体・主役の方角", -180, 180, 1, "天体や光の輪の方角を調整します。");
numberControl("uBodyElevation", "天体・主役の高さ", -15, 85, 1, "天体や光の輪の高さを度数で設定します。");
numberControl("uBodySize", "天体・主役の半径", 0.2, 30, 0.1, "見かけの半径を度数で設定します。");
numberControl("uPhase", "月の満ち欠け", 0, 1, 0.02, "0が新月、0.5が半月、1が満月です。");
numberControl("uHaloRadius", "月暈の半径", 5, 30, 0.5, "月を囲む光の輪の半径です。既定は22度です。");
numberControl("uRingTilt", "惑星の環の傾き", 5, 70, 1, "大きくすると環が開いて見えます。");
numberControl("uNebulaStrength", "銀河・星雲の濃さ", 0, 4, 0.05, "0で星雲や銀河の光を消します。");
numberControl("uAuroraHeight", "オーロラの高さ", 0.35, 2, 0.05, "光の幕の見え方と広がりを変えます。");
numberControl("uAuroraWidth", "オーロラの幕の幅", 0.25, 2, 0.05, "小さいほど薄い光の幕になります。");
numberControl("uRibbonWidth", "光のリボンの幅", 0.02, 0.3, 0.005, "リボンの幅と縁の広がりを変えます。");
numberControl("uEdgeWidth", "結晶の縁の太さ", 0.001, 0.09, 0.001, "結晶の境界にある光の線の太さです。");
numberControl("uOutline", "雲の輪郭", 0, 1, 0.05, "雲の輪郭を強くしてイラスト風にします。");
numberControl("uGridStrength", "グリッドの光", 0, 2, 0.05, "下半球に描くレトロな格子の明るさです。");
numberControl("uCausticStrength", "水面の光の模様", 0, 3, 0.05, "頭上の水面に揺れる光の模様を加えます。");
numberControl("uShaftStrength", "水中の光の筋", 0, 3, 0.05, "上から差し込む光の筋の強さです。");

function makeEntry(
  id: string, label: string, category: SkyShaderCatalogCategory, description: string,
  fragment: string, values: Values, controls: string[],
  options: { cost: "light" | "medium" | "heavy"; tags: string[]; defines?: Record<string, string>; preview?: { azimuth: number; elevation: number } },
): SkyShaderCatalogEntry {
  const merged = { ...BASE_VALUES, ...values };
  const uniforms: Record<string, ClassicR3fShaderUniform> = {
    uCenter: { kind: "vector", value: [0, 0, 0] },
    uRotation: { kind: "number", value: 0 },
    uExposure: { kind: "number", value: 1 },
    uTime: { kind: "number", value: 0 },
  };
  for (const [name, value] of Object.entries(merged)) {
    uniforms[name] = typeof value === "number" ? { kind: "number", value } : { kind: "color", value };
  }
  const shader: ClassicR3fMaterialShader = {
    kind: "classic-r3f", sourceModulePath: `studio://sky-shader/${id}`,
    vertexShader: SKY_VERTEX_SHADER, fragmentShader: fragment, uniforms,
    variants: [{ name: "sky", side: "back", transparent: false, depthWrite: false, defines: { ...options.defines } }],
    animatedTimeUniform: "uTime",
  };
  return { id, label, category, description, shader, cost: options.cost, tags: options.tags,
    preview: options.preview ?? { azimuth: -110, elevation: 20 },
    parameters: [...new Set(controls)].map((name) => {
      const control = PARAMS[name];
      if (!control) throw new Error(`Missing sky control: ${name}`);
      return control;
    }),
  };
}

const PALETTE = ["uPrimaryColor", "uSecondaryColor", "uZenithColor", "uHorizonColor"];
const MOTION = ["uScale", "uSpeed", "uSeed", "uIntensity"];
const STARS = ["uStarCount", "uStarBrightness", "uStarSize", "uTwinkleSpeed"];
const SUN = ["uSunAzimuth", "uSunElevation", "uSunSize", "uSunStrength"];
const BODY = ["uBodyAzimuth", "uBodyElevation", "uBodySize"];
const CLOUDS = ["uCloudCoverage", "uCloudDensity"];
const RIDGE = ["uRidgeStrength", "uRidgeHeight"];
const ATMOS_DEFAULTS: Values = {
  uZenithColor: "#367abb", uHorizonColor: "#c4dced", uGroundColor: "#879fab",
  uPrimaryColor: "#fff8ed", uSecondaryColor: "#657994",
  uCloudCoverage: 0.62, uCloudDensity: 2.2, uSunAzimuth: -135, uSunElevation: 32,
  uSunSize: 0.3, uSunStrength: 0.9, uHaze: 0.25, uRain: 0, uRidgeStrength: 0,
  uRidgeHeight: 0.045, uScale: 1.7, uSpeed: 0.28, uIntensity: 1,
};
const CELESTIAL_DEFAULTS: Values = {
  uBodyAzimuth: -110, uBodyElevation: 25, uBodySize: 1.0, uPhase: 0.8,
  uHaloRadius: 22, uRingTilt: 22, uNebulaStrength: 0.25,
  uStarCount: 4200, uStarBrightness: 2.6, uStarSize: 0.095,
  uZenithColor: "#030612", uHorizonColor: "#121326", uGroundColor: "#010309",
};
function atmosphere(id: string, label: string, category: SkyShaderCatalogCategory, description: string, mode: number, values: Values, tags: string[]): SkyShaderCatalogEntry {
  return makeEntry(id,label,category,description,ATMOSPHERE,{...ATMOS_DEFAULTS,...values},[
    ...(mode === 2 ? [] : CLOUDS), ...SUN, "uHaze", ...(mode === 3 ? ["uRain"] : []),
    ...RIDGE,...MOTION,...PALETTE.filter((name) => mode !== 1 || name !== "uSecondaryColor"),"uGroundColor",
  ], {cost: mode === 1 || mode === 2 ? "light" : "heavy",tags,defines:{XRIFT_ATMOS_MODE:String(mode)}});
}
function celestial(id: string,label: string,category: SkyShaderCatalogCategory,description: string,mode: number,values: Values,tags: string[]): SkyShaderCatalogEntry {
  return makeEntry(id,label,category,description,CELESTIAL,{...CELESTIAL_DEFAULTS,...values},[
    ...(mode === 1 || mode === 4 ? [] : BODY), ...(mode === 0 ? ["uPhase","uHaloRadius"] : []),
    ...(mode === 2 ? ["uRingTilt"] : []), ...STARS,"uNebulaStrength",
    ...MOTION.filter((name) => name !== "uSpeed" || mode === 3 || mode === 4),
    ...PALETTE,...([2,3,4].includes(mode) ? [] : ["uGroundColor"]),
  ], {cost:"medium",tags,defines:{XRIFT_CELESTIAL_MODE:String(mode)},
    preview:{azimuth:mode === 1 ? -162 : -110,elevation:mode === 1 ? 26 : 22}});
}

export const EXTENDED_SKY_SHADER_CATALOG: readonly SkyShaderCatalogEntry[] = [
  atmosphere("alpine-cumulus","Alpine Cumulus · 立体的な積雲","day",
    "雲の厚み、内側の影、光る縁を描く青空です。雲の量と風を調整できます。山並みは必要なときだけ追加できます。",0,
    {uSeed:8.4,uCloudCoverage:0.62,uCloudDensity:2.5},["自然","青空","夏","積雲","cumulus","realistic"]),
  atmosphere("high-cirrus","High Cirrus · 高層の巻雲","day",
    "上空を細く流れる巻雲です。風で引き伸ばした二層の雲を重ね、レイマーチせずに薄い雲の奥行きを表現します。",1,
    {uZenithColor:"#2d72b4",uHorizonColor:"#d4e7f5",uCloudCoverage:0.72,uCloudDensity:1.4,uScale:1.4,uSunElevation:48},["自然","薄雲","巻雲","秋","cirrus"]),
  atmosphere("coastal-haze","Coastal Haze · 海辺の霞","day",
    "淡い水色から白い地平線へつながる海辺の空です。砂塵型の大気表現を薄く使い、雲のない明るい空を作ります。海の水面自体は描きません。",2,
    {uZenithColor:"#5facc8",uHorizonColor:"#d9e5de",uPrimaryColor:"#f3ead2",uSecondaryColor:"#9dbdc4",uGroundColor:"#afc9c8",uHaze:0.65,uSunElevation:42,uScale:1.1},["海","海岸","霞","夏","coast","haze"]),
  atmosphere("amber-cloud-sea","Amber Cloud Sea · 琥珀の雲海","dusk",
    "夕日に染まる頭上の積雲と、眼下に広がる雲海です。空の上下に雲を配置するため、高台や空中のワールドに向きます。",4,
    {uZenithColor:"#555187",uHorizonColor:"#edb381",uPrimaryColor:"#ffe0ae",uSecondaryColor:"#6f648c",uGroundColor:"#9a7991",uSunElevation:9,uSunAzimuth:-115,uSunSize:0.55,uCloudCoverage:0.59,uCloudDensity:2.6,uHaze:0.45,uSeed:12.7},["夕焼け","雲海","空中","golden","cloud sea"]),
  atmosphere("lavender-blue-hour","Lavender Blue Hour · 薄明の巻雲","dawn",
    "青紫の空と淡い桃色の巻雲を重ねた、日の出前の静かな空です。雲は細い筋として流れ、地平線に暖色を残します。",1,
    {uZenithColor:"#4c5591",uHorizonColor:"#e5a6a4",uPrimaryColor:"#eec3c7",uSecondaryColor:"#667094",uGroundColor:"#8d8aa3",uSunElevation:-3,uSunStrength:0.15,uCloudCoverage:0.83,uCloudDensity:1.7,uScale:1.2,uHaze:0.5,uSpeed:0.16},["朝焼け","薄明","青紫","blue hour","lavender"]),
  atmosphere("storm-front","Storm Front · 雨雲の前線","weather",
    "低く厚い雲、暗い雲底、遠くの雨筋を描く嵐の空です。雲の奥の光を残して立体感を付けます。激しい点滅や落雷は入れていません。",3,
    {uZenithColor:"#243342",uHorizonColor:"#8d9eac",uPrimaryColor:"#b6c4c9",uSecondaryColor:"#273745",uGroundColor:"#455565",uCloudCoverage:0.89,uCloudDensity:3.7,uSunStrength:0.45,uSunElevation:20,uRain:0.8,uHaze:0.65,uScale:1.2,uSeed:16.2},["雨","嵐","曇天","積乱雲","storm","rain"]),
  atmosphere("overcast-silver","Overcast Silver · 銀灰色の曇天","weather",
    "空を広く覆う銀灰色の雲です。雲の厚みの差を残した拡散光の空で、落ち着いた街や建物の背景に使えます。",0,
    {uZenithColor:"#8496a9",uHorizonColor:"#b8c4cb",uPrimaryColor:"#d9deda",uSecondaryColor:"#728390",uGroundColor:"#98a4aa",uCloudCoverage:0.94,uCloudDensity:2.8,uSunStrength:0.2,uHaze:0.8,uScale:1.0,uSpeed:0.12},["曇り","曇天","灰色","overcast","silver"]),
  atmosphere("desert-dust","Desert Dust · 砂塵の地平線","weather",
    "黄土色の霞が地平線にたまる乾いた空です。雲とは異なる方向空間のノイズで、薄い砂塵の層をゆっくり流します。",2,
    {uZenithColor:"#ab8066",uHorizonColor:"#e6b77e",uPrimaryColor:"#f3cc8f",uSecondaryColor:"#b1835e",uGroundColor:"#b79573",uHaze:1.25,uSunElevation:14,uSunSize:0.48,uSunStrength:0.6,uScale:1.8,uSpeed:0.15},["砂漠","砂嵐","砂塵","desert","dust"]),
  celestial("lunar-halo","Lunar Halo · 月暈の夜","night",
    "満ち欠けと表面の濃淡がある月を、淡い22度の光の輪が囲みます。月暈、月の大きさ、星の数をそれぞれ調整できます。",0,
    {uPrimaryColor:"#e6e5db",uSecondaryColor:"#a9c1e3",uBodySize:1.15,uBodyElevation:29,uPhase:0.93,uStarCount:2800,uNebulaStrength:0.05,uStarBrightness:2.3},["月","月暈","満月","夜","moon","halo"]),
  celestial("milky-way-core","Milky Way Core · 銀河の暗黒帯","night",
    "傾いた銀河の帯に明るい星の集まりと暗黒帯を重ねた夜空です。明暗を分けた細かな星雲で、単色のぼかしにならないようにしています。",1,
    {uPrimaryColor:"#9da8bf",uSecondaryColor:"#d5b18e",uNebulaStrength:1.8,uStarCount:10000,uStarBrightness:3.1,uStarSize:0.085,uScale:1.2,uSeed:9.1},["天の川","銀河","暗黒帯","星空","milky way"]),
  makeEntry("polar-curtains","Polar Curtains · 光のカーテン","aurora",
    "高さの異なる光の幕を重ねたオーロラです。細い縦筋と、下側の緑から上側の紫へ変わる色を描きます。",AURORA,
    {uPrimaryColor:"#4ceba7",uSecondaryColor:"#bf69e5",uZenithColor:"#030b21",uHorizonColor:"#0b2539",uStarCount:4000,uStarBrightness:2.4,uAuroraHeight:0.7,uAuroraWidth:1.15,uScale:1.0,uSpeed:0.3,uIntensity:1.25},
    ["uAuroraHeight","uAuroraWidth",...STARS,...MOTION,...PALETTE,"uGroundColor"],{cost:"medium",tags:["極地","オーロラ","緑","curtain"],defines:{XRIFT_AURORA_MODE:"0"},preview:{azimuth:-95,elevation:35}}),
  makeEntry("aurora-corona","Aurora Corona · 天頂の光冠","aurora",
    "天頂から放射状に広がるオーロラです。横に流れる幕とは別の形で、見上げたときに光の筋が頭上へ集まります。",AURORA,
    {uPrimaryColor:"#63dce7",uSecondaryColor:"#ba6fe9",uZenithColor:"#030817",uHorizonColor:"#11243d",uStarCount:3500,uStarBrightness:2.2,uAuroraHeight:0.8,uAuroraWidth:0.9,uScale:1.4,uSpeed:0.2,uIntensity:1.4},
    ["uAuroraHeight","uAuroraWidth",...STARS,...MOTION,...PALETTE,"uGroundColor"],{cost:"medium",tags:["天頂","光冠","放射状","corona"],defines:{XRIFT_AURORA_MODE:"1"},preview:{azimuth:-110,elevation:66}}),
  celestial("ringed-planet","Ringed Planet · 環を持つ惑星","space",
    "縞模様の惑星と幾重もの環を描きます。球と環の前後関係、環に落ちる惑星の影、大気の縁を計算する天体シェーダーです。",2,
    {uPrimaryColor:"#e5c6a0",uSecondaryColor:"#7f9cba",uBodySize:13.5,uBodyElevation:23,uRingTilt:23,uNebulaStrength:0.14,uStarCount:6500,uStarBrightness:2.7,uScale:1.0},["惑星","環","土星風","宇宙","planet","rings"]),
  celestial("red-giant","Red Giant · 赤色の恒星","space",
    "大きな恒星の表面に、対流を模した細かな模様と明るさのむらを描きます。周囲に柔らかなコロナが広がるSF向けの空です。",3,
    {uPrimaryColor:"#ffd79b",uSecondaryColor:"#f66a29",uBodySize:18,uBodyElevation:24,uStarCount:3500,uNebulaStrength:0.1,uIntensity:1.0,uSpeed:0.25},["恒星","赤色巨星","太陽","SF","red giant"]),
  celestial("cosmic-dust","Cosmic Dust · 星雲と暗い塵","space",
    "細かく枝分かれする星雲と、光を遮る暗い塵を重ねます。方向から模様を作るため、全天に画像のつなぎ目はありません。",4,
    {uPrimaryColor:"#4c92bd",uSecondaryColor:"#d68aab",uNebulaStrength:1.2,uStarCount:8500,uStarBrightness:3.0,uScale:1.45,uSeed:7.4,uIntensity:1.1},["星雲","暗黒星雲","宇宙","nebula","dust"]),
  celestial("eclipse-corona","Eclipse Corona · 日食の光冠","space",
    "暗い円盤が背景の星を隠し、その周りだけに細い光と不均一なコロナが残る日食の空です。光の輪とにじみを分けて描きます。",5,
    {uPrimaryColor:"#cedaec",uSecondaryColor:"#ffe6b7",uBodySize:6.5,uBodyElevation:24,uNebulaStrength:0.03,uStarCount:3000,uGroundColor:"#010207",uIntensity:1.0},["日食","光冠","eclipse","corona"]),
  makeEntry("astral-ribbons","Astral Ribbons · 天空の光絹","fantasy",
    "星空を横切る半透明の光のリボンです。四枚の曲がった光の帯に細い縁と光沢を付け、ゆっくり形を変えます。",RIBBONS,
    {uPrimaryColor:"#73dbd2",uSecondaryColor:"#c28ded",uRibbonWidth:0.1,uStarCount:2800,uStarBrightness:2.4,uScale:1.2,uSpeed:0.3,uIntensity:1.3},
    ["uRibbonWidth",...STARS,...MOTION,...PALETTE],{cost:"light",tags:["幻想","リボン","光","絹","ribbons"]}),
  makeEntry("celestial-gate","Celestial Gate · 天球の光環","fantasy",
    "星空に三重の光の輪が浮かぶ幻想的な背景です。環の切れ目や細かな目盛りが異なる速さで動き、中央に淡い光がたまります。",GATE,
    {uPrimaryColor:"#efcf87",uSecondaryColor:"#678dbe",uBodyAzimuth:-110,uBodyElevation:28,uBodySize:19,uStarCount:3600,uStarBrightness:2.6,uIntensity:1.5,uSpeed:0.22},
    [...BODY,...STARS,...MOTION,...PALETTE],{cost:"light",tags:["幻想","魔法","天球","輪","gate","astral"]}),
  makeEntry("crystal-vault","Crystal Vault · 結晶の天蓋","fantasy",
    "全天を結晶の面で覆う、ステンドグラスのような背景です。隣り合う面の向きで光沢と色が変わり、境界に淡い光が走ります。",CRYSTAL,
    {uPrimaryColor:"#68b9c5",uSecondaryColor:"#bc7fc2",uZenithColor:"#142b42",uEdgeWidth:0.014,uScale:1.2,uSpeed:0.15,uIntensity:0.85},
    ["uEdgeWidth",...MOTION,...PALETTE.filter((name) => name !== "uHorizonColor")],{cost:"medium",tags:["結晶","ステンドグラス","幾何学","crystal"]}),
  makeEntry("painted-clouds","Painted Clouds · 絵本の雲","stylized",
    "丸い雲の形に二段階の陰影と控えめな輪郭を付けたイラスト調の空です。輪郭を弱めると、柔らかな絵本風の背景になります。",PAINTED,
    {uZenithColor:"#5fadc9",uHorizonColor:"#e5d7c1",uGroundColor:"#b8c8bc",uPrimaryColor:"#fff1d4",uSecondaryColor:"#b5a3bd",uCloudCoverage:0.64,uOutline:0.3,uSunAzimuth:-135,uSunElevation:35,uSunSize:2.6,uScale:1.7,uIntensity:1,uSpeed:0.14,uSeed:9.5},
    ["uCloudCoverage","uOutline","uSunAzimuth","uSunElevation","uSunSize",...MOTION,...PALETTE],{cost:"light",tags:["絵本","イラスト","アニメ","パステル","painted","toon"]}),
  makeEntry("synthwave-horizon","Synthwave Horizon · ネオンの地平線","stylized",
    "横縞の太陽、暗い山並み、下半球のネオングリッドを組み合わせたレトロSFの空です。グリッドは実際の床ではなく背景に描かれます。",SYNTHWAVE,
    {uZenithColor:"#190b38",uHorizonColor:"#8f2267",uGroundColor:"#0f0a25",uPrimaryColor:"#ffc66d",uSecondaryColor:"#f365d8",uBodyAzimuth:-110,uBodyElevation:15,uBodySize:14,uGridStrength:0.8,uRidgeHeight:0.06,uStarCount:1300,uStarBrightness:2.2,uScale:0.85,uSpeed:0.3},
    [...BODY,"uGridStrength","uRidgeHeight",...STARS,...MOTION,...PALETTE,"uGroundColor"],{cost:"light",tags:["レトロ","ネオン","SF","80年代","synthwave","grid"],preview:{azimuth:-110,elevation:9}}),
  makeEntry("prismatic-flow","Prismatic Flow · 真珠色の流れ","abstract",
    "流れる層に真珠色の光沢と薄膜干渉風の色の変化を重ねます。空らしい地平線を持たない、展示や音楽空間向けの抽象背景です。",ABSTRACT,
    {uZenithColor:"#304257",uHorizonColor:"#f4d9cd",uPrimaryColor:"#71b9c1",uSecondaryColor:"#ce91b4",uScale:1.2,uSpeed:0.2,uIntensity:1.0},
    [...MOTION,...PALETTE],{cost:"medium",tags:["抽象","真珠","薄膜","アート","prismatic","iridescent"],defines:{XRIFT_ABSTRACT_MODE:"0"}}),
  makeEntry("ink-marble","Ink Marble · 墨と金の流紋","abstract",
    "暗い墨の流れに、金色の細い境界を重ねた大理石風の全天背景です。ノイズを二段階で曲げて、直線的な繰り返しを抑えます。",ABSTRACT,
    {uZenithColor:"#0e1725",uHorizonColor:"#ccb18a",uPrimaryColor:"#c1d0cd",uSecondaryColor:"#d9ac60",uScale:0.85,uSpeed:0.12,uIntensity:0.8,uSeed:13.0},
    [...MOTION,...PALETTE.filter((name) => name !== "uHorizonColor")],{cost:"medium",tags:["抽象","墨","金","大理石","marble","ink"],defines:{XRIFT_ABSTRACT_MODE:"1"}}),
  makeEntry("submerged-caustics","Submerged Caustics · 水中の光窓","underwater",
    "見上げた先の明るい水面、揺れる光の模様、下へ薄れていく光の筋を描く水中背景です。水面メッシュや水中物体への集光は生成しません。",UNDERWATER,
    {uZenithColor:"#032437",uHorizonColor:"#287f97",uPrimaryColor:"#9de3d7",uSecondaryColor:"#57b7bc",uGroundColor:"#02131f",uCausticStrength:1.4,uShaftStrength:1.6,uScale:1.1,uSpeed:0.35,uIntensity:1.0},
    ["uCausticStrength","uShaftStrength",...MOTION.filter((name) => name !== "uSeed"),...PALETTE],{cost:"light",tags:["水中","海中","光芒","水面","underwater","caustics"],preview:{azimuth:-110,elevation:40}}),
];
