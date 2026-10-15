import type { AudioSourcePatch, ColliderPatch, InteractionTriggerPatch, LightPatch, RigidBodyPatch, TextPatch, ImagePatch, SceneComponent } from "./scene-document";

/** Shared by MCP validation and the Studio ChatGPT authoring catalog. */
/**
 * Declares which Patch fields `update_component` accepts, and fails the build
 * when the Patch type and this list stop agreeing.
 *
 * The allow-list has to exist at runtime, so it cannot be read off the type.
 * That made it a hand-copy of the Patch definition, and a field added to a
 * component without being copied here becomes quietly unsettable through MCP —
 * the same silent-drift failure that already produced one shipped bug in the
 * document validators. Passing the list through here turns that into a compile
 * error naming the field that was left out.
 */

function patchKeysOf<Patch>() {
  return <const Keys extends readonly (keyof Patch)[]>(
    keys: Exclude<keyof Patch, Keys[number]> extends never
      ? Keys
      : {
          error: "update_component is missing a Patch field";
          missing: Exclude<keyof Patch, Keys[number]>;
        },
  ): readonly string[] => keys as readonly string[];
}

export const RIGID_BODY_PATCH_KEYS = patchKeysOf<RigidBodyPatch>()([
  "enabled",
  "bodyType",
  "autoColliders",
  "isTrigger",
  "friction",
  "restitution",
  "gravityScale",
  "linearDamping",
  "angularDamping",
  "canSleep",
  "ccd",
  "lockTranslations",
  "lockRotations",
]);

export const COLLIDER_PATCH_KEYS = patchKeysOf<ColliderPatch>()([
  "collisionModelAssetId",
  "enabled",
  "isTrigger",
  "friction",
  "restitution",
  "center",
  "halfExtents",
  "fitMode",
  "meshMode",
  "bodyType",
  "gravityScale",
  "linearDamping",
  "angularDamping",
  "canSleep",
  "ccd",
  "lockTranslations",
  "lockRotations",
]);

export const LIGHT_PATCH_KEYS = patchKeysOf<LightPatch>()([
  "enabled",
  "lightType",
  "color",
  "intensity",
  "castShadow",
  "targetPosition",
  "mapAssetId",
  "shadowIntensity",
  "shadowStyle",
  "shadowMapSize",
  "shadowMapWidth",
  "shadowMapHeight",
  "shadowRadius",
  "shadowBias",
  "shadowNormalBias",
  "shadowBlurSamples",
  "shadowAutoUpdate",
  "shadowCameraNear",
  "shadowCameraFar",
  "shadowCameraLeft",
  "shadowCameraRight",
  "shadowCameraTop",
  "shadowCameraBottom",
  "shadowFocus",
  "shadowAspect",
  "groundColor",
  "distance",
  "decay",
  "angle",
  "penumbra",
  "width",
  "height",
]);

export const TEXT_PATCH_KEYS = patchKeysOf<TextPatch>()([
  "enabled",
  "text",
  "color",
  "fontSize",
  "maxWidth",
  "anchorX",
  "anchorY",
  "outlineWidth",
  "outlineColor",
  "fontId",
  "fontWeight",
  "fontAssetId",
  "textAlign",
  "lineHeight",
  "letterSpacing",
  "background",
]);

export const IMAGE_PATCH_KEYS = patchKeysOf<ImagePatch>()([
  "enabled",
  "textureAssetId",
  "width",
  "height",
  "anchorX",
  "anchorY",
  "color",
  "opacity",
  "alphaMode",
  "doubleSided",
  "lit",
]);

export const AUDIO_SOURCE_PATCH_KEYS = patchKeysOf<AudioSourcePatch>()([
  "enabled",
  "audioAssetId",
  "volume",
  "loop",
  "autoplay",
  "spatial",
  "refDistance",
  "rolloffFactor",
  "maxDistance",
]);

/**
 * `entityReferences` is deliberately absent.
 *
 * It is derived from the graph the Component points at, not authored, so a
 * caller that could set it would be able to write a list the graph disagrees
 * with. Pointing the Component at another Asset re-derives it instead.
 */
export const INTERACTION_TRIGGER_PATCH_KEYS = patchKeysOf<
  Pick<InteractionTriggerPatch, "enabled" | "interactivityAssetId">
>()(["enabled", "interactivityAssetId"]);


export const COMPONENT_PATCH_KEYS = {
  "rigid-body": RIGID_BODY_PATCH_KEYS,
  collider: COLLIDER_PATCH_KEYS,
  light: LIGHT_PATCH_KEYS,
  text: TEXT_PATCH_KEYS,
  image: IMAGE_PATCH_KEYS,
  "audio-source": AUDIO_SOURCE_PATCH_KEYS,
  "interaction-trigger": INTERACTION_TRIGGER_PATCH_KEYS,
  "vegetation-wind": ["enabled"],
  "particle-emitter": ["enabled", "particleAssetId"],
  "xrift-component": ["enabled", "properties", "assetReferences", "entityReferences"],
  script: ["enabled"],
  transform: ["enabled"],
  mesh: ["enabled", "materialBindings", "castShadow", "receiveShadow", "modelPose", "maxDistance", "renderOrder"],
  "spawn-point": ["enabled"],
  "prefab-instance": ["enabled"],
  animation: [],
} as const satisfies Record<SceneComponent["type"], readonly string[]>;
