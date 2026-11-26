/**
 * The foliage shader: one program for a tree's bark and for its leaf cards.
 *
 * A tree model from `scripts/generate-foliage-models.mjs` has two meshes. Both
 * wear the same Material, and the leaves pick their variant by mesh name, so
 * the two halves cannot be given different sway by accident: a branch and the
 * leaves on it move through the same function with the same numbers.
 *
 * What the model supplies per vertex (three's GLTFLoader lower-cases the
 * names of custom glTF attributes):
 * - `_acrown` (vec4): xyz is the outward direction of the crown at the vertex,
 *   w its depth in the crown (0 at the centre, about 1 at the surface).
 * - `_aleaf` (vec4, leaves): xyz is where the card is attached to its twig, w
 *   one random per card in 0..1.
 * - `_acore` (float, bark): 1 on the dark core inside the crown, else 0.
 *
 * What the Scene supplies: the clock, the wind contract and the lighting
 * contract. Nothing here keeps a sun or a wind of its own.
 */

/** Define that turns the program into the leaf-card variant. */
export const FOLIAGE_LEAVES_DEFINE = "FOLIAGE_LEAVES";
/** Mesh names that wear the leaf variant contain this. */
export const FOLIAGE_LEAVES_MESH_NAME = "leaves";

/**
 * Hash and value noise. The same source is compiled into both stages, because
 * the tree's own random comes from the vertex stage and the moss from the
 * fragment stage.
 */
const FOLIAGE_NOISE = `float xriftFoliageHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float xriftFoliageNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = xriftFoliageHash(cell);
  float b = xriftFoliageHash(cell + vec2(1.0, 0.0));
  float c = xriftFoliageHash(cell + vec2(0.0, 1.0));
  float d = xriftFoliageHash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`;

export const FOLIAGE_VERTEX_SHADER = `uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindSpeed;
uniform float uWindTurbulence;
uniform float uSway;
attribute vec4 _acrown;
#ifdef ${FOLIAGE_LEAVES_DEFINE}
uniform float uFlutter;
attribute vec4 _aleaf;
varying vec3 vCrownNormal;
varying float vTint;
#else
attribute float _acore;
varying float vHeight;
varying float vCore;
#endif
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vInside;
varying float vSeed;
#include <fog_pars_vertex>

${FOLIAGE_NOISE}

// A gust front crossing the ground, 0..1. It travels downwind, so a row of
// trees answers it one after another instead of all nodding together.
float xriftFoliageGust(vec2 xz, vec2 wind, float clock) {
  vec2 q = xz * 0.07 - wind * clock * 0.16;
  float n = xriftFoliageNoise(q) * 0.62 + xriftFoliageNoise(q * 2.1 + 13.7) * 0.38;
  return smoothstep(0.3, 0.8, n);
}

// How far a point of the tree is carried downwind. The higher up, the further:
// a trunk barely moves and the top of the crown swings.
vec3 xriftFoliageSway(
  vec3 world, float height, float seed, vec2 wind, float clock, float gust, float amount
) {
  float reach = pow(max(height, 0.0) * 0.16, 1.6);
  float swing = (0.015 + 0.05 * gust) *
    sin(clock * (0.9 + seed * 0.4) + seed * 6.2831 + world.x * 0.05);
  return vec3(wind.x, 0.0, wind.y) * (swing * reach * amount);
}

void main() {
  #ifdef USE_INSTANCING
    mat4 objectMatrix = modelMatrix * instanceMatrix;
  #else
    mat4 objectMatrix = modelMatrix;
  #endif
  // One random per tree, from where it stands. Two copies of one model then
  // differ in colour and in the moment they swing without any setting.
  vSeed = xriftFoliageHash(objectMatrix[3].xz * 0.37 + 0.13);
  // Sway is authored for the model at its own size and grows with the tree.
  float size = length(objectMatrix[1].xyz);

  vec2 wind = length(uWindDirection) > 0.0001 ? normalize(uWindDirection) : vec2(1.0, 0.0);
  // 1 at the Scene's default wind. Still air stops the clock as well as the
  // reach, so nothing creeps when the wind is switched off.
  float pace = max(uWindSpeed, 0.0) * 1.25;
  float clock = uTime * pace;
  float force = min(pace, 3.0);
  float gustiness = clamp(uWindTurbulence / 0.35, 0.0, 2.0);

  #ifdef ${FOLIAGE_LEAVES_DEFINE}
    vec3 pivot = _aleaf.xyz;
    vec4 worldPivot = objectMatrix * vec4(pivot, 1.0);
    float gust = xriftFoliageGust(worldPivot.xz, wind, clock) * gustiness;
    // The card turns about the point where it is attached, so a leaf flutters
    // on its twig instead of sliding off it.
    float phase = _aleaf.w * 6.2831 + dot(worldPivot.xyz, vec3(0.37, 0.21, 0.53));
    vec3 arm = position - pivot;
    float flutter = uFlutter * force * (0.05 + 0.2 * gust) *
      sin(clock * (2.6 + _aleaf.w * 2.4) + phase);
    arm += normal * flutter * length(arm) * 0.5 + cross(arm, vec3(0.0, 1.0, 0.0)) * flutter * 0.25;
    vec4 world = objectMatrix * vec4(pivot + arm, 1.0);
    world.xyz += xriftFoliageSway(world.xyz, pivot.y, vSeed, wind, clock, gust, uSway * force * size);
    vCrownNormal = normalize(mat3(objectMatrix) * _acrown.xyz);
    // The fraction is the card's own tint and the whole part the tree's. Both
    // are equal at a card's four corners, so interpolation leaves them alone.
    vTint = fract(_aleaf.w + vSeed * 0.37) + floor(vSeed * 7.99);
  #else
    vec4 world = objectMatrix * vec4(position, 1.0);
    float gust = xriftFoliageGust(world.xz, wind, clock) * gustiness;
    world.xyz += xriftFoliageSway(world.xyz, position.y, vSeed, wind, clock, gust, uSway * force * size);
    vHeight = position.y;
    vCore = _acore;
  #endif

  vUv = uv;
  vWorld = world.xyz;
  vNormal = normalize(mat3(objectMatrix) * normal);
  vInside = _acrown.w;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const FOLIAGE_FRAGMENT_SHADER = `uniform sampler2D uLeafMap;
uniform sampler2D uBarkMap;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
uniform float uFill;
uniform vec3 uLeafTint;
uniform float uInnerShade;
#ifdef ${FOLIAGE_LEAVES_DEFINE}
uniform float uAlphaCutoff;
uniform float uTranslucency;
uniform float uCrownShading;
uniform float uColorVariation;
varying vec3 vCrownNormal;
varying float vTint;
#else
uniform vec3 uBarkTint;
uniform vec3 uMossColor;
uniform float uMoss;
uniform float uBump;
varying float vHeight;
varying float vCore;
#endif
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vInside;
varying float vSeed;
#include <fog_pars_fragment>

${FOLIAGE_NOISE}

// A standard Material returns albedo / pi of what a light sends. Doing the
// same here is what lets a tree stand beside a PBR object under one light
// without one of them looking lit by a different sun.
const float XRIFT_FOLIAGE_INVERSE_PI = 0.31830988618;

vec3 xriftFoliageSun() {
  return uSunColor * max(uSunIntensity, 0.0) * XRIFT_FOLIAGE_INVERSE_PI;
}

// Light from the sky. A Scene lit only through its skybox hands this shader no
// sun and no ambient at all, and foliage that answered only to those would be
// black against lit ground, so the Material keeps a fill of its own.
vec3 xriftFoliageSky(vec3 n) {
  vec3 sky = uAmbientColor * max(uAmbientIntensity, 0.0) * XRIFT_FOLIAGE_INVERSE_PI +
    mix(vec3(1.0), uSunColor, 0.6) * max(uFill, 0.0);
  return sky * mix(0.55, 1.0, n.y * 0.5 + 0.5);
}

// albedo: the surface colour. sunShade: how much of the key light reaches the
// surface (the crown shades its own inside). ao: how much of the sky does.
// wrap: how far light bends round the form. through: light coming through a
// leaf from behind.
vec3 xriftFoliageLight(
  vec3 albedo, vec3 n, vec3 view, float sunShade, float ao, float wrap,
  float gloss, float specular, vec3 through
) {
  vec3 light = uSunDirection / max(length(uSunDirection), 0.0001);
  vec3 sun = xriftFoliageSun();
  float facing = dot(n, light);
  float diffuse = max((facing + wrap) / (1.0 + wrap), 0.0);
  vec3 color = albedo * (sun * diffuse * sunShade + xriftFoliageSky(n) * ao);
  vec3 halfway = normalize(light + view);
  float power = exp2(gloss * 10.0 + 1.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(view, halfway), 0.0), 5.0);
  color += sun * specular * fresnel * pow(max(dot(n, halfway), 0.0), power) *
    (power + 2.0) * 0.125 * sunShade * step(0.0, facing);
  float behind = pow(max(dot(-view, light), 0.0), 4.0);
  color += through * sun * behind * sunShade;
  return color;
}

#ifndef ${FOLIAGE_LEAVES_DEFINE}
// Relief from the height in the picture's alpha. The slope is measured on the
// picture, one screen pixel apart, and turned into world space with the
// surface's own derivatives, so no normal map and no tangents are needed.
vec3 xriftFoliageRelief(
  vec2 uv, vec2 duv1, vec2 duv2, vec3 dp1, vec3 dp2, vec3 n, float scale
) {
  vec3 dp2perp = cross(dp2, n);
  vec3 dp1perp = cross(n, dp1);
  float det = dot(dp1, dp2perp);
  if (abs(det) < 1e-12 || scale <= 0.0) return n;
  vec3 alongU = (dp2perp * duv1.x + dp1perp * duv2.x) / det;
  vec3 alongV = (dp2perp * duv1.y + dp1perp * duv2.y) / det;
  float spacing = max(1.0 / 512.0, max(length(duv1), length(duv2)));
  float here = texture2D(uBarkMap, uv).a;
  float nextU = texture2D(uBarkMap, uv + vec2(spacing, 0.0)).a;
  float nextV = texture2D(uBarkMap, uv + vec2(0.0, spacing)).a;
  return normalize(n - (alongU * (nextU - here) + alongV * (nextV - here)) / spacing * scale);
}
#endif

void main() {
  vec3 toEye = cameraPosition - vWorld;
  float eyeDistance = length(toEye);
  vec3 view = toEye / max(eyeDistance, 0.0001);
  vec3 color;

  #ifdef ${FOLIAGE_LEAVES_DEFINE}
    vec4 leaf = texture2D(uLeafMap, vUv);
    // Cut out, not blended: leaves sort themselves by depth and cost no
    // transparent pass.
    if (leaf.a < uAlphaCutoff) discard;
    // A photographed leaf carries its own shine and a pale rim from the
    // cut-out. Both would be lit a second time here.
    float brightness = dot(leaf.rgb, vec3(0.3, 0.59, 0.11));
    leaf.rgb *= mix(1.0, 0.55, smoothstep(0.18, 0.45, brightness));
    leaf.rgb *= mix(0.55, 1.0, smoothstep(0.5, 0.92, leaf.a));
    // No two sprigs and no two trees are the same green: some cards yellow a
    // little, and a whole tree leans blue-green or warm.
    float cardTint = fract(vTint);
    float treeTint = floor(vTint) / 7.0;
    // A photograph of a leaf in daylight is brighter and yellower than the
    // leaf's own colour, which is what a light has to be multiplied with.
    vec3 albedo = leaf.rgb * vec3(0.8, 0.74, 0.6) * uLeafTint;
    albedo *= mix(vec3(1.0), mix(vec3(0.8, 0.9, 0.85), vec3(1.12, 1.0, 0.6), cardTint * cardTint), uColorVariation);
    albedo *= mix(vec3(1.0), mix(vec3(0.84, 0.95, 1.0), vec3(1.12, 1.04, 0.8), treeTint), uColorVariation);

    vec3 cardNormal = normalize(vNormal);
    if (!gl_FrontFacing) cardNormal = -cardNormal;
    vec3 crownNormal = normalize(vCrownNormal);
    // Lit as part of a round crown rather than as a flat card, or every card
    // would catch the light at its own angle and the tree would sparkle.
    vec3 n = normalize(mix(cardNormal, crownNormal, clamp(uCrownShading, 0.0, 1.0)));
    // Deep in the crown neither the sky nor the sun reaches a leaf.
    float depth = smoothstep(0.2, 1.0, vInside);
    float ao = mix(1.0 - uInnerShade, 1.0, depth);
    float sunShade = mix(1.0 - uInnerShade * 0.75, 1.0, depth);
    vec3 through = albedo * vec3(1.3, 1.35, 0.4) * smoothstep(0.45, 1.0, vInside) *
      uTranslucency * smoothstep(0.6, 0.9, leaf.a);
    color = xriftFoliageLight(albedo, n, view, sunShade, ao, 0.4, 0.5, 0.1, through);
  #else
    // Screen derivatives are taken before the branch: inside it they are
    // undefined on the pixels next to the other branch.
    vec2 duv1 = dFdx(vUv);
    vec2 duv2 = dFdy(vUv);
    vec3 dp1 = dFdx(vWorld);
    vec3 dp2 = dFdy(vWorld);
    vec3 n = normalize(vNormal);
    if (vCore > 0.5) {
      // The crown's core: the mass of leaves behind the cards. The leaf
      // picture is laid on it darkly, so a gap between cards shows deep
      // foliage, not sky.
      vec3 facing = abs(n);
      vec2 coreUv = facing.y > max(facing.x, facing.z)
        ? vWorld.xz
        : (facing.x > facing.z ? vWorld.zy : vWorld.xy);
      vec4 leaf = texture2D(uLeafMap, coreUv * 0.8 + vSeed);
      vec3 inner = mix(vec3(0.02, 0.032, 0.01), leaf.rgb * uLeafTint * 0.45,
        smoothstep(0.3, 0.7, leaf.a));
      vec3 light = uSunDirection / max(length(uSunDirection), 0.0001);
      float wrapped = max((dot(n, light) + 0.6) / 1.6, 0.0);
      color = inner * (xriftFoliageSky(n) * 0.55 + xriftFoliageSun() * wrapped * 0.2);
    } else {
      vec4 bark = texture2D(uBarkMap, vUv);
      // Moss where water stays: on faces that look up, at the damp foot of the
      // trunk, and on the side turned away from the sun.
      vec3 light = uSunDirection / max(length(uSunDirection), 0.0001);
      float upward = smoothstep(0.1, 0.75, n.y) * 0.7 + (1.0 - smoothstep(0.2, 1.6, vHeight)) * 0.55;
      vec2 level = vec2(length(n.xz), length(light.xz));
      float away = level.x > 0.001 && level.y > 0.001
        ? max(-dot(n.xz / level.x, light.xz / level.y), 0.0) * 0.25
        : 0.0;
      float patches = xriftFoliageNoise(vUv * vec2(1.7, 0.7) + vSeed * 17.0) * 0.65 +
        xriftFoliageNoise(vUv * vec2(4.3, 1.9) + 7.1) * 0.35;
      // Thin branches up in the crown dry quickly; the trunk and the big
      // limbs below it are where moss stays.
      float mossMask = smoothstep(0.42, 0.74, patches * 0.75 + (upward + away) * 0.5) * uMoss *
        mix(0.35, 1.0, smoothstep(0.8, 1.3, vInside));
      vec3 moss = uMossColor * mix(0.6, 1.25, xriftFoliageNoise(vUv * 5.6));
      vec3 albedo = mix(bark.rgb * uBarkTint * mix(0.8, 1.0, vSeed), moss, mossMask);
      // The relief fades with distance, where it would only be noise.
      vec3 relief = xriftFoliageRelief(vUv, duv1, duv2, dp1, dp2, n,
        0.018 * uBump * (1.0 - smoothstep(3.0, 12.0, eyeDistance)));
      // Branches inside the crown see little sky, and the foot of the trunk
      // stands in the tree's own shade.
      float inside = mix(1.0 - uInnerShade * 0.85, 1.0, smoothstep(0.25, 1.05, vInside));
      float ao = inside * mix(0.55, 1.0, smoothstep(0.0, 0.8, vHeight));
      color = xriftFoliageLight(albedo, relief, view, inside, ao, 0.1, 0.25, 0.08, vec3(0.0));
    }
  #endif

  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
