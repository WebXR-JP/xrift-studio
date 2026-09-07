/** Shared, texture-free GLSL for the built-in and extended sky libraries.
 * All output is linear-light; each fragment owns tone mapping and sRGB output.
 * Sampling uses directions rather than equirectangular UVs to avoid a wrap seam.
 */
export const SKY_VERTEX_SHADER = `uniform vec3 uCenter;
varying vec3 vDirection;

void main() {
  vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 worldCenter = (modelMatrix * vec4(uCenter, 1.0)).xyz;
  vDirection = worldPosition - worldCenter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Hashes, value noise, star cells and the Y rotation shared by every preset. */
export const SKY_COMMON_GLSL = `const float XRIFT_SKY_TAU = 6.28318530718;
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
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
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
  // Project to the dominant cube face. Stars live on a 2D surface, not in
  // volume cells (the old volume grid discarded most of the requested stars).
  vec3 a = abs(direction);
  vec2 face;
  float faceId;
  if (a.x >= a.y && a.x >= a.z) {
    face = direction.yz / max(a.x, 0.0001);
    faceId = direction.x >= 0.0 ? 0.0 : 1.0;
  } else if (a.y >= a.z) {
    face = direction.xz / max(a.y, 0.0001);
    faceId = direction.y >= 0.0 ? 2.0 : 3.0;
  } else {
    face = direction.xy / max(a.z, 0.0001);
    faceId = direction.z >= 0.0 ? 4.0 : 5.0;
  }
  vec2 p = face * scale;
  // Derivatives must precede the non-uniform star-cell branch.
  float pixel = max(length(fwidth(p)) * 0.5, 0.0001);
  float probability = clamp(count / (24.0 * scale * scale), 0.0, 1.0);
  vec3 cell = vec3(floor(p), faceId * 31.0 + scale);
  vec3 rnd = xriftSkyHash33(cell);
  if (rnd.x >= probability || count <= 0.0) return 0.0;
  vec2 center = 0.2 + 0.6 * xriftSkyHash33(cell + 19.19).xy;
  float dist = length(fract(p) - center);
  float authoredRadius = clamp(size * (0.45 + 0.55 * rnd.z), 0.005, 0.18);
  float radius = max(authoredRadius, pixel);
  float energy = min(1.0, authoredRadius * authoredRadius / (pixel * pixel));
  float core = exp(-dist * dist / max(radius * radius, 0.00001) * 2.6);
  float halo = exp(-dist * dist / max(radius * radius, 0.00001) * 0.65) * 0.16;
  // Setting the speed to zero disables twinkling, not just time advancement.
  float twinkle = mix(1.0, 0.88 + 0.12 * sin(time * twinkleSpeed *
    (0.5 + rnd.z) + rnd.y * XRIFT_SKY_TAU), step(0.0001, twinkleSpeed));
  return (core + halo) * energy * (0.45 + 1.55 * rnd.y * rnd.y) * twinkle;
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
  float aa = max(fwidth(direction.y - silhouette), 0.0015);
  return 1.0 - smoothstep(silhouette - aa, silhouette + aa, direction.y);
}

/** Disc coverage in x and the surrounding glow in y, for a sun or a moon. */
vec2 xriftSkyCelestial(
  vec3 direction,
  vec3 bodyDirection,
  float angularRadius,
  float glowFalloff
) {
  // Chord distance is stable near the disc centre; acos(dot) loses precision.
  float angle = length(direction - bodyDirection);
  float radius = 2.0 * sin(max(angularRadius, 0.0002) * 0.5);
  float aa = max(fwidth(angle), 0.00008);
  float disc = 1.0 - smoothstep(radius - aa, radius + aa, angle);
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

