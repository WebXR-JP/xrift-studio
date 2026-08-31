import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  createPortal,
  useFrame,
  useThree,
  type ThreeElements,
} from "@react-three/fiber";
import {
  EntryLogBoard,
  Grabbable,
  Interactable,
  LiveVideoPlayer,
  Portal,
  ScreenShareDisplay,
  TagBoard,
  TextInput,
  Video180Sphere,
  VideoPlayer,
  VideoScreen,
  useSpawnPointContext,
  type EntryLogBoardProps,
  type GrabbableProps,
  type InteractableProps,
  type PortalProps,
  type ScreenShareDisplayProps,
  type TagBoardProps,
  type TextInputProps,
  type Video180SphereProps,
  type VideoPlayerProps,
  type VideoScreenProps,
} from "@xrift/world-components";
import {
  CuboidCollider,
  MeshCollider,
  Physics,
  RigidBody,
} from "@react-three/rapier";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BoxGeometry,
  Color,
  EquirectangularReflectionMapping,
  AnimationMixer,
  Euler,
  Fog,
  Group,
  HalfFloatType,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Object3D,
  Quaternion,
  RGBAFormat,
  NoToneMapping,
  SRGBColorSpace,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type {
  XriftRuntimeComponent,
  XriftRuntimeEntity,
  XriftRuntimeManifest,
} from "../schema.js";
import {
  disposeXriftLoadResult,
  XriftThreeLoader,
  type XriftLoadResult,
} from "../three/index.js";
import {
  type MutableUniformValue,
  type TimeUniformSpec,
  applyTimeUniformValue,
} from "../shader-time.js";
import {
  XriftScriptParticleEmitter,
  type XriftParticleConfig,
} from "../script/particle.js";
import { XriftAudioSource } from "../script/audio-source.js";
import {
  emitXriftInteraction,
  XriftInteractionTriggerRuntime,
} from "../script/interaction-trigger-runtime.js";
import { XriftSceneRuntime } from "../script/scene-runtime.js";
import { XriftPlayerRuntime } from "../script/player-runtime-host.js";
import { XriftInstanceStateRuntime } from "../script/instance-state-runtime-host.js";
import { planInteractivityAnimationCues } from "../interactivity-adapter.js";
import {
  XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY,
  createXriftAnimationRuntimeBridge,
  type XriftAnimationRuntimeBridge,
} from "../script/animation.js";
import { createXriftAnimationMixerController } from "../script/animation-mixer.js";

export type XriftRuntimePrimitiveProps = ThreeElements["primitive"];

export type XriftRuntimeSceneProps = {
  manifest: string | URL | XriftRuntimeManifest;
  assetBaseUrl?: string;
  fallback?: ReactNode;
  onLoad?: (result: XriftLoadResult) => void;
  onError?: (error: Error) => void;
  /** Enables the Rapier adapter for Collider and direct Rigid Body components. */
  physics?: boolean;
};

export function XriftWorld(props: XriftRuntimeSceneProps) {
  return <XriftRuntimeScene {...props} expectedKind="world" />;
}

export function XriftItem(props: XriftRuntimeSceneProps) {
  return <XriftRuntimeScene {...props} expectedKind="item" />;
}

function XriftRuntimeScene({
  manifest,
  assetBaseUrl,
  fallback = null,
  onLoad,
  onError,
  physics,
  expectedKind,
}: XriftRuntimeSceneProps & { expectedKind: "world" | "item" }) {
  const renderer = useThree((state) => state.gl);
  const loader = useMemo(
    () => new XriftThreeLoader({ assetBaseUrl, renderer }),
    [assetBaseUrl, renderer],
  );
  const [result, setResult] = useState<XriftLoadResult | null>(null);

  useEffect(() => {
    let active = true;
    let loaded: XriftLoadResult | null = null;
    void loader
      .load(manifest)
      .then((next) => {
        if (next.manifest.projectKind !== expectedKind) {
          throw new Error(
            `Runtime project kind is ${next.manifest.projectKind}; expected ${expectedKind}`,
          );
        }
        if (!active) {
          disposeXriftLoadResult(next);
          return;
        }
        loaded = next;
        setResult(next);
        onLoad?.(next);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        onError?.(reason instanceof Error ? reason : new Error(String(reason)));
      });
    return () => {
      active = false;
      if (loaded) disposeXriftLoadResult(loaded);
    };
  }, [expectedKind, loader, manifest, onError, onLoad]);

  if (!result) return fallback;
  const physicsEnabled = physics ?? expectedKind === "world";
  const dynamicBodies = useMemo(
    () => (physicsEnabled ? collectRuntimeDynamicBodyEntries(result) : []),
    [physicsEnabled, result],
  );
  const content = (
    <>
      <primitive object={result.root} />
      <XriftRuntimeSceneEnvironment result={result} />
      <XriftRuntimeOfficialComponentAdapters result={result} />
      <XriftRuntimeMeshVisibility result={result} />
      <XriftRuntimePostprocessing result={result} />
      <XriftRuntimeVegetationWind result={result} />
      <XriftRuntimeAnimations result={result} />
      <XriftRuntimeTimeUniforms result={result} />
      <XriftRuntimeSpawnPointAdapter result={result} />
      <XriftRuntimeParticleAdapters result={result} />
      <XriftRuntimeAudioAdapters result={result} />
      <XriftRuntimeInteractionTriggers result={result} />
    </>
  );
  return physicsEnabled ? (
    <Physics gravity={runtimeGravity(result)} timeStep="vary">
      {content}
      <XriftRuntimePhysicsBodies result={result} dynamicBodies={dynamicBodies} />
    </Physics>
  ) : (
    content
  );
}

type RuntimeSceneEnvironmentSettings = {
  skybox: {
    enabled: boolean;
    iblEnabled: boolean;
    projection: "infinite" | "box" | "dome";
    imageAssetId?: string;
    topColor: string;
    bottomColor: string;
    offset: number;
    exponent: number;
    rotationDegrees: number;
    exposure: number;
    meshPosition: [number, number, number];
    meshRotationDegrees: [number, number, number];
    meshScale: [number, number, number];
    center: [number, number, number];
  };
  fog: { enabled: boolean; color: string; near: number; far: number };
  ambient: { color: string; intensity: number };
  camera: { near: number; far: number; fov: number };
};

const RUNTIME_SKYBOX_VERTEX_SHADER = `
varying vec3 vDirection;
uniform vec3 uCenter;
void main() {
  vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 worldCenter = (modelMatrix * vec4(uCenter, 1.0)).xyz;
  vDirection = worldPosition - worldCenter;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RUNTIME_SKYBOX_FRAGMENT_SHADER = `
uniform sampler2D uTexture;
uniform bool uHasTexture;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uOffset;
uniform float uExponent;
uniform float uExposure;
uniform float uRotation;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  vec3 color;
  if (uHasTexture) {
    vec2 uv = vec2(
      atan(direction.z, direction.x) * 0.15915494309189535 + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) * 0.3183098861837907 + 0.5
    );
    uv.x = fract(uv.x + uRotation * 0.15915494309189535);
    color = texture2D(uTexture, uv).rgb;
  } else {
    float t = clamp(direction.y * 0.5 + 0.5 + uOffset, 0.0, 1.0);
    t = pow(t, max(uExponent, 0.01));
    color = mix(uBottomColor, uTopColor, t);
  }
  gl_FragColor = vec4(color * uExposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function XriftRuntimeSceneEnvironment({ result }: { result: XriftLoadResult }) {
  const { camera, scene } = useThree();
  const settings = useMemo(
    () => resolveRuntimeSceneEnvironmentSettings(result.manifest.scenes[result.manifest.entryScene]?.settings),
    [result],
  );
  const imageTexture = settings.skybox.imageAssetId
    ? result.textures.get(settings.skybox.imageAssetId) ?? null
    : null;
  const hasOfficialSkybox = useMemo(() => {
    let found = false;
    result.root.traverse((object) => {
      if (object.userData.xriftRuntimeSkybox === true) found = true;
    });
    return found;
  }, [result]);
  const ambient = useMemo(() => {
    const light = new AmbientLight(settings.ambient.color, settings.ambient.intensity);
    light.name = "xrift-scene-ambient";
    return light;
  }, [settings.ambient.color, settings.ambient.intensity]);
  const skybox = useMemo(() => {
    if (hasOfficialSkybox) return null;
    if (!settings.skybox.enabled && !settings.skybox.iblEnabled) return null;
    const geometry = createRuntimeSkyGeometry(settings.skybox.projection);
    const material = new ShaderMaterial({
      side: BackSide,
      depthTest: false,
      depthWrite: false,
      vertexShader: RUNTIME_SKYBOX_VERTEX_SHADER,
      fragmentShader: RUNTIME_SKYBOX_FRAGMENT_SHADER,
      uniforms: {
        uTexture: { value: imageTexture },
        uHasTexture: { value: Boolean(imageTexture) },
        uTopColor: { value: new Color(settings.skybox.topColor) },
        uBottomColor: { value: new Color(settings.skybox.bottomColor) },
        uOffset: { value: settings.skybox.offset },
        uExponent: { value: settings.skybox.exponent },
        uExposure: { value: settings.skybox.exposure },
        uRotation: { value: (settings.skybox.rotationDegrees * Math.PI) / 180 },
        uCenter: { value: new Vector3(...settings.skybox.center) },
      },
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = "xrift-scene-skybox";
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    if (settings.skybox.projection === "infinite") {
      mesh.scale.setScalar(100);
    } else {
      mesh.position.fromArray(settings.skybox.meshPosition);
      mesh.rotation.set(
        (settings.skybox.meshRotationDegrees[0] * Math.PI) / 180,
        (settings.skybox.meshRotationDegrees[1] * Math.PI) / 180,
        (settings.skybox.meshRotationDegrees[2] * Math.PI) / 180,
      );
      mesh.scale.fromArray(settings.skybox.meshScale);
    }
    return mesh;
  }, [
    hasOfficialSkybox,
    imageTexture,
    settings.skybox.bottomColor,
    settings.skybox.center,
    settings.skybox.enabled,
    settings.skybox.exponent,
    settings.skybox.exposure,
    settings.skybox.iblEnabled,
    settings.skybox.meshPosition,
    settings.skybox.meshRotationDegrees,
    settings.skybox.meshScale,
    settings.skybox.offset,
    settings.skybox.projection,
    settings.skybox.rotationDegrees,
    settings.skybox.topColor,
  ]);

  useEffect(() => {
    const previousFog = scene.fog;
    const previousEnvironment = scene.environment;
    const previousEnvironmentIntensity = scene.environmentIntensity;
    const previousEnvironmentRotation = scene.environmentRotation.clone();
    const typedCamera = camera as PerspectiveCamera;
    const previousCamera = {
      near: typedCamera.near,
      far: typedCamera.far,
      fov: typedCamera.fov,
    };
    if (settings.fog.enabled) {
      scene.fog = new Fog(settings.fog.color, settings.fog.near, settings.fog.far);
    } else {
      scene.fog = null;
    }
    if (camera instanceof PerspectiveCamera) {
      typedCamera.near = settings.camera.near;
      typedCamera.far = settings.camera.far;
      typedCamera.fov = settings.camera.fov;
      typedCamera.updateProjectionMatrix();
    }
    if (imageTexture && settings.skybox.iblEnabled) {
      imageTexture.mapping = EquirectangularReflectionMapping;
      scene.environment = imageTexture;
      scene.environmentIntensity = settings.skybox.exposure;
      scene.environmentRotation.set(
        0,
        (settings.skybox.rotationDegrees * Math.PI) / 180,
        0,
      );
    } else if (settings.skybox.iblEnabled) {
      scene.environment = null;
    }
    return () => {
      scene.fog = previousFog;
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.environmentRotation.copy(previousEnvironmentRotation);
      if (camera instanceof PerspectiveCamera) {
        typedCamera.near = previousCamera.near;
        typedCamera.far = previousCamera.far;
        typedCamera.fov = previousCamera.fov;
        typedCamera.updateProjectionMatrix();
      }
    };
  }, [camera, imageTexture, scene, settings]);

  useFrame(() => {
    if (skybox && settings.skybox.projection === "infinite") {
      skybox.position.copy(camera.position);
    }
  });

  useEffect(
    () => () => {
      skybox?.geometry.dispose();
      if (skybox?.material instanceof ShaderMaterial) skybox.material.dispose();
    },
    [skybox],
  );

  return (
    <>
      <primitive object={ambient} />
      {skybox ? <primitive object={skybox} /> : null}
    </>
  );
}

function resolveRuntimeSceneEnvironmentSettings(
  value: unknown,
): RuntimeSceneEnvironmentSettings {
  const settings = isRecord(value) ? value : {};
  const skybox = isRecord(settings.skybox) ? settings.skybox : {};
  const fog = isRecord(settings.fog) ? settings.fog : {};
  const ambient = isRecord(settings.ambient) ? settings.ambient : {};
  const camera = isRecord(settings.camera) ? settings.camera : {};
  const imageAssetId =
    typeof skybox.imageAssetId === "string" && skybox.imageAssetId.trim()
      ? skybox.imageAssetId
      : undefined;
  const near = numberOr(camera.near, 0.1, 0.0001);
  const far = Math.max(numberOr(camera.far, 2000, 0.0001), near + 0.0001);
  const fogNear = numberOr(fog.near, 120, 0);
  const fogFar = Math.max(numberOr(fog.far, 600, 0), fogNear + 0.001);
  return {
    skybox: {
      enabled: skybox.enabled !== false,
      iblEnabled: skybox.iblEnabled === true,
      projection:
        skybox.projection === "box" || skybox.projection === "dome"
          ? skybox.projection
          : "infinite",
      ...(imageAssetId ? { imageAssetId } : {}),
      topColor: colorOr(skybox.topColor, "#87ceeb"),
      bottomColor: colorOr(skybox.bottomColor, "#ffffff"),
      offset: numberOr(skybox.offset, 0, -1),
      exponent: numberOr(skybox.exponent, 1, 0.01),
      rotationDegrees: numberOr(skybox.rotationDegrees, 0, -360),
      exposure: numberOr(skybox.exposure, 1, 0),
      meshPosition: vec3Or(skybox.meshPosition, [0, 0, 0]),
      meshRotationDegrees: vec3Or(skybox.meshRotationDegrees, [0, 0, 0]),
      meshScale: vec3Or(skybox.meshScale, [100, 100, 100], 0.001),
      center: vec3Or(skybox.center, [0, 0.01, 0]),
    },
    fog: {
      enabled: fog.enabled !== false,
      color: colorOr(fog.color, "#18181b"),
      near: Math.min(fogNear, fogFar - 0.001),
      far: fogFar,
    },
    ambient: {
      color: colorOr(ambient.color, "#ffffff"),
      intensity: numberOr(ambient.intensity, 0.55, 0),
    },
    camera: { near: Math.min(near, far - 0.0001), far, fov: numberOr(camera.fov, 46, 1) },
  };
}

function createRuntimeSkyGeometry(
  projection: RuntimeSceneEnvironmentSettings["skybox"]["projection"],
) {
  if (projection === "box") {
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    return geometry;
  }
  if (projection === "dome") {
    const geometry = new SphereGeometry(0.5, 50, 50);
    const position = geometry.attributes.position;
    if (!position) return geometry;
    const radius = 0.5;
    const bottomLimit = 0.1;
    const curvatureRadiusSquared = 0.95 * 0.95;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index) / radius;
      let y = position.getY(index) / radius;
      const z = position.getZ(index) / radius;
      if (y < 0) {
        y *= 0.3;
        if (x * x + z * z < curvatureRadiusSquared) y = -bottomLimit;
      }
      position.setY(index, (y + bottomLimit) * radius);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
  return new SphereGeometry(1, 32, 20);
}

type RuntimeOfficialComponentTargets = {
  skyboxes: Object3D[];
  billboards: Object3D[];
  mirrors: Object3D[];
  wrappers: RuntimeOfficialWrapperTarget[];
  leaves: RuntimeOfficialLeafTarget[];
};

type RuntimeOfficialWrapperComponent = Extract<
  XriftRuntimeComponent,
  { type: "xrift-component" }
>;

type RuntimeOfficialWrapperTarget = {
  key: string;
  target: Object3D;
  visual: Object3D;
  components: RuntimeOfficialWrapperComponent[];
};

type RuntimeOfficialLeafTarget = {
  key: string;
  target: Object3D;
  components: RuntimeOfficialWrapperComponent[];
};

function collectRuntimeOfficialComponentTargets(
  result: XriftLoadResult,
): RuntimeOfficialComponentTargets {
  const targets: RuntimeOfficialComponentTargets = {
    skyboxes: [],
    billboards: [],
    mirrors: [],
    wrappers: collectRuntimeOfficialWrapperTargets(result),
    leaves: collectRuntimeOfficialLeafTargets(result),
  };
  result.root.traverse((object) => {
    if (object.userData.xriftRuntimeSkybox === true) targets.skyboxes.push(object);
    if (object.userData.xriftRuntimeBillboardY === true) targets.billboards.push(object);
    if (object.userData.xriftRuntimeMirror) targets.mirrors.push(object);
  });
  return targets;
}

function collectRuntimeOfficialLeafTargets(
  result: XriftLoadResult,
): RuntimeOfficialLeafTarget[] {
  const scene = result.manifest.scenes[result.manifest.entryScene];
  if (!scene) return [];
  return Object.values(scene.entities).flatMap((entity) => {
    const target = result.entities.get(entity.id);
    if (!target) return [];
    const components = entity.components.filter(
      (component): component is RuntimeOfficialWrapperComponent =>
        component.type === "xrift-component" &&
        component.enabled &&
        isRuntimeOfficialLeafSchema(component.schemaId),
    );
    return components.length > 0
      ? [{ key: entity.id, target, components }]
      : [];
  });
}

function collectRuntimeOfficialWrapperTargets(
  result: XriftLoadResult,
): RuntimeOfficialWrapperTarget[] {
  const scene = result.manifest.scenes[result.manifest.entryScene];
  if (!scene) return [];
  return Object.values(scene.entities).flatMap((entity) => {
    const target = result.entities.get(entity.id);
    if (!target) return [];
    const components = entity.components.filter(
      (component): component is RuntimeOfficialWrapperComponent =>
        component.type === "xrift-component" &&
        component.enabled &&
        isRuntimeOfficialWrapperSchema(component.schemaId),
    );
    if (components.length === 0) return [];
    const existing = target.userData.xriftRuntimeOfficialVisualRoot;
    const visual = existing instanceof Object3D ? existing : new Group();
    if (!(existing instanceof Object3D)) {
      visual.name = `official-wrapper-visual:${entity.id}`;
      for (const child of [...target.children]) visual.add(child);
      target.add(visual);
      target.userData.xriftRuntimeOfficialVisualRoot = visual;
    }
    return [{ key: entity.id, target, visual, components }];
  });
}

function XriftRuntimeOfficialComponentAdapters({
  result,
}: {
  result: XriftLoadResult;
}) {
  const { camera, gl } = useThree();
  const targets = useMemo(
    () => collectRuntimeOfficialComponentTargets(result),
    [result],
  );
  const cameraWorldPosition = useMemo(() => new Vector3(), []);
  const targetWorldPosition = useMemo(() => new Vector3(), []);
  const virtualCameraPosition = useMemo(() => new Vector3(), []);
  const cameraForward = useMemo(() => new Vector3(), []);
  const parentPosition = useMemo(() => new Vector3(), []);
  const parentScale = useMemo(() => new Vector3(), []);
  const parentQuaternion = useMemo(() => new Quaternion(), []);
  const parentEuler = useMemo(() => new Euler(), []);
  const mirrorWorldPosition = useMemo(() => new Vector3(), []);

  useFrame(() => {
    for (const skybox of targets.skyboxes) {
      if (!skybox.parent) {
        skybox.position.copy(camera.position);
        continue;
      }
      skybox.parent.worldToLocal(targetWorldPosition.copy(camera.position));
      skybox.position.copy(targetWorldPosition);
    }

    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    for (const billboard of targets.billboards) {
      billboard.getWorldPosition(targetWorldPosition);
      let referencePosition = cameraWorldPosition;
      const dx = cameraWorldPosition.x - targetWorldPosition.x;
      const dz = cameraWorldPosition.z - targetWorldPosition.z;
      if (dx * dx + dz * dz < 0.01) {
        camera.getWorldDirection(cameraForward);
        cameraForward.y = 0;
        if (cameraForward.lengthSq() < 0.01) continue;
        virtualCameraPosition
          .copy(cameraWorldPosition)
          .addScaledVector(cameraForward.normalize(), 1);
        referencePosition = virtualCameraPosition;
      }
      const worldRotationY = Math.atan2(
        referencePosition.x - targetWorldPosition.x,
        referencePosition.z - targetWorldPosition.z,
      );
      if (billboard.parent) {
        billboard.parent.matrixWorld.decompose(
          parentPosition,
          parentQuaternion,
          parentScale,
        );
        parentEuler.setFromQuaternion(parentQuaternion, "YXZ");
        billboard.rotation.y = worldRotationY - parentEuler.y;
      } else {
        billboard.rotation.y = worldRotationY;
      }
    }

    for (const mirrorGroup of targets.mirrors) {
      const reflector = mirrorGroup.userData.xriftRuntimeMirror as
        | {
            visible: boolean;
            getReflectionCamera?: (activeCamera: typeof camera) => {
              layers: { enableAll: () => void };
            };
          }
        | undefined;
      const fallback = mirrorGroup.userData.xriftRuntimeMirrorFallback as
        | { visible: boolean }
        | undefined;
      if (!reflector || !fallback) continue;
      mirrorGroup.getWorldPosition(mirrorWorldPosition);
      const distance = cameraWorldPosition.distanceTo(mirrorWorldPosition);
      const lodDistance =
        typeof mirrorGroup.userData.xriftRuntimeMirrorLodDistance === "number"
          ? mirrorGroup.userData.xriftRuntimeMirrorLodDistance
          : 10;
      const currentlyUsingReflector = mirrorGroup.userData.xriftRuntimeMirrorActive !== false;
      const shouldUseReflector = currentlyUsingReflector
        ? distance <= lodDistance
        : distance <= lodDistance * 0.8;
      if (shouldUseReflector !== currentlyUsingReflector) {
        mirrorGroup.userData.xriftRuntimeMirrorActive = shouldUseReflector;
        reflector.visible = shouldUseReflector;
        fallback.visible = !shouldUseReflector;
      }
      if (reflector.visible) {
        reflector.getReflectionCamera?.(camera)?.layers.enableAll();
        if (gl.xr.isPresenting) {
          for (const eyeCamera of gl.xr.getCamera().cameras) {
            reflector.getReflectionCamera?.(eyeCamera as typeof camera)?.layers.enableAll();
          }
        }
      }
    }
  });
  return (
    <>
      {targets.wrappers.map((target) => (
        <Fragment key={target.key}>
          {createPortal(
            <XriftRuntimeOfficialWrappers
              entityId={target.key}
              components={target.components}
              visual={target.visual}
            />,
            target.target,
          )}
        </Fragment>
      ))}
      {targets.leaves.map((target) => (
        <Fragment key={`leaf:${target.key}`}>
          {createPortal(
            <XriftRuntimeOfficialLeaves components={target.components} />,
            target.target,
          )}
        </Fragment>
      ))}
    </>
  );
}

function XriftRuntimeOfficialWrappers({
  components,
  visual,
  entityId,
}: {
  components: readonly RuntimeOfficialWrapperComponent[];
  visual: Object3D;
  /** Whose interaction this is, so a press reaches that Entity's graphs. */
  entityId: string;
}) {
  const [grabbableTransforms, setGrabbableTransforms] = useState<
    Record<string, GrabbableProps["transform"]>
  >(() =>
    Object.fromEntries(
      components
        .filter((component) => component.schemaId === "xrift.grabbable")
        .map((component) => [component.id, parseRuntimeGrabbableTransform(component.properties.transform)]),
    ),
  );
  const [textValues, setTextValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      components
        .filter((component) => component.schemaId === "xrift.text-input")
        .map((component) => [component.id, stringOr(component.properties.value, "")]),
    ),
  );

  const content = components.reduceRight<ReactNode>(
    (children, component) => {
      const properties = component.properties;
      if (component.schemaId === "xrift.interactable") {
        const props: Omit<InteractableProps, "children" | "onInteract"> = {
          id: stringOr(properties.id, component.id),
          type: "button",
          interactionText:
            typeof properties.interactionText === "string"
              ? properties.interactionText
              : undefined,
          enabled: booleanOr(properties.enabled, true),
        };
        return (
          <Interactable
            {...props}
            // The press has to reach the Entity's own graphs. Without this the
            // published world had an Interactable that registered, highlighted
            // under the crosshair, and then did nothing - the same silence
            // Studio's Play had before it grew a host.
            onInteract={() => emitXriftInteraction(entityId)}
          >
            {children}
          </Interactable>
        );
      }
      if (component.schemaId === "xrift.grabbable") {
        const id = stringOr(properties.id, component.id);
        const props: Omit<GrabbableProps, "children" | "onMove"> = {
          id,
          transform:
            grabbableTransforms[id] ??
            parseRuntimeGrabbableTransform(properties.transform),
          enabled: booleanOr(properties.enabled, true),
        };
        return (
          <Grabbable
            {...props}
            onMove={(next) =>
              setGrabbableTransforms((current) => ({ ...current, [id]: next }))
            }
          >
            {children}
          </Grabbable>
        );
      }
      if (component.schemaId === "xrift.text-input") {
        const id = stringOr(properties.id, component.id);
        const props: Omit<TextInputProps, "children" | "onSubmit"> = {
          id,
          placeholder:
            typeof properties.placeholder === "string"
              ? properties.placeholder
              : undefined,
          maxLength:
            typeof properties.maxLength === "number" &&
            Number.isFinite(properties.maxLength)
              ? properties.maxLength
              : undefined,
          value: textValues[id] ?? stringOr(properties.value, ""),
          interactionText:
            typeof properties.interactionText === "string"
              ? properties.interactionText
              : undefined,
          disabled: booleanOr(properties.disabled, false),
        };
        return (
          <TextInput
            {...props}
            onSubmit={(value) =>
              setTextValues((current) => ({ ...current, [id]: value }))
            }
          >
            {children}
          </TextInput>
        );
      }
      return children;
    },
    <primitive object={visual} />,
  );
  return content;
}

function isRuntimeOfficialWrapperSchema(schemaId: string): boolean {
  return (
    schemaId === "xrift.interactable" ||
    schemaId === "xrift.grabbable" ||
    schemaId === "xrift.text-input"
  );
}

function isRuntimeOfficialLeafSchema(schemaId: string): boolean {
  return (
    schemaId === "xrift.video-screen" ||
    schemaId === "xrift.video-player" ||
    schemaId === "xrift.live-video-player" ||
    schemaId === "xrift.video-180-sphere" ||
    schemaId === "xrift.screen-share-display" ||
    schemaId === "xrift.tag-board" ||
    schemaId === "xrift.entry-log-board" ||
    schemaId === "xrift.portal"
  );
}

function XriftRuntimeOfficialLeaves({
  components,
}: {
  components: readonly RuntimeOfficialWrapperComponent[];
}) {
  return (
    <>
      {components.map((component) => {
        const properties = component.properties;
        switch (component.schemaId) {
          case "xrift.video-screen":
            return (
              <VideoScreen
                key={component.id}
                {...(properties as unknown as VideoScreenProps)}
              />
            );
          case "xrift.video-player":
            return (
              <VideoPlayer
                key={component.id}
                {...(properties as unknown as VideoPlayerProps)}
              />
            );
          case "xrift.live-video-player":
            return (
              <LiveVideoPlayer
                key={component.id}
                {...(properties as unknown as ComponentProps<typeof LiveVideoPlayer>)}
              />
            );
          case "xrift.video-180-sphere":
            return (
              <Video180Sphere
                key={component.id}
                {...(properties as unknown as Video180SphereProps)}
              />
            );
          case "xrift.screen-share-display":
            return (
              <ScreenShareDisplay
                key={component.id}
                {...(properties as unknown as ScreenShareDisplayProps)}
              />
            );
          case "xrift.tag-board":
            return (
              <TagBoard
                key={component.id}
                {...(properties as unknown as TagBoardProps)}
              />
            );
          case "xrift.entry-log-board":
            return (
              <EntryLogBoard
                key={component.id}
                {...(properties as unknown as EntryLogBoardProps)}
              />
            );
          case "xrift.portal": {
            const portalProps = properties as unknown as PortalProps;
            return (
              <Portal
                key={component.id}
                {...portalProps}
                instanceId={stringOr(portalProps.instanceId, "")}
              />
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}

function parseRuntimeGrabbableTransform(
  value: unknown,
): GrabbableProps["transform"] {
  const transform = isRecord(value) ? value : {};
  const position = objectVec3(transform.position, { x: 0, y: 0, z: 0 });
  const rotation = objectVec3(transform.rotation, { x: 0, y: 0, z: 0 });
  const scale =
    typeof transform.scale === "number" && Number.isFinite(transform.scale)
      ? transform.scale
      : 1;
  return { position, rotation, scale };
}

function objectVec3(
  value: unknown,
  fallback: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const object = isRecord(value) ? value : {};
  return {
    x: typeof object.x === "number" && Number.isFinite(object.x) ? object.x : fallback.x,
    y: typeof object.y === "number" && Number.isFinite(object.y) ? object.y : fallback.y,
    z: typeof object.z === "number" && Number.isFinite(object.z) ? object.z : fallback.z,
  };
}

function colorOr(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Runs the Scene's Interaction Trigger graphs.
 *
 * `runtime.json` used to be data with no behaviour: the compiler refused to
 * stage a Scene with a trigger, because the manifest could carry the graph but
 * nothing on this side read it, and publishing a world whose buttons silently
 * did nothing was worse than refusing. This is the other half - the graph runs
 * here exactly as it runs in Studio's Play, through the same component.
 *
 * The Scene and player bridges are mounted alongside, once, because a graph's
 * actions reach them by looking on the Three.js scene: without them a graph
 * that fades the screen or teleports the player would find nothing there.
 */
function XriftRuntimeInteractionTriggers({ result }: { result: XriftLoadResult }) {
  const scene = result.manifest.scenes[result.manifest.entryScene];
  const triggers = useMemo(() => {
    if (!scene) return [];
    return Object.values(scene.entities).flatMap((entity) => {
      const target = result.entities.get(entity.id);
      if (!target) return [];
      return entity.components.flatMap((component, order) => {
        if (component.type !== "interaction-trigger" || !component.enabled) {
          return [];
        }
        return [
          createPortal(
            <XriftInteractionTriggerRuntime
              key={`${entity.id}:${component.id}`}
              entityId={entity.id}
              graph={component.graph}
              componentId={component.id}
              order={order}
            />,
            target,
          ),
        ];
      });
    });
  }, [result, scene]);
  if (triggers.length === 0) return null;
  return (
    <>
      <XriftSceneRuntime />
      <XriftPlayerRuntime />
      <XriftInstanceStateRuntime />
      {triggers}
    </>
  );
}

function XriftRuntimeParticleAdapters({ result }: { result: XriftLoadResult }) {
  const portals = useMemo(() => {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene) return [];
    return Object.values(scene.entities).flatMap((entity) => {
      const target = result.entities.get(entity.id);
      if (!target) return [];
      return entity.components.flatMap((component) => {
        if (component.type !== "particle-emitter" || !component.enabled) {
          return [];
        }
        const asset = result.manifest.assets[component.particleAssetId];
        if (!asset || asset.kind !== "particle") return [];
        const config = parseRuntimeParticleConfig(asset.properties);
        if (!config) return [];
        return [
          createPortal(
            <XriftScriptParticleEmitter
              key={`${entity.id}:${component.id}`}
              config={config}
              color="#ffffff"
              opacity={1}
            />,
            target,
          ),
        ];
      });
    });
  }, [result]);
  return <>{portals}</>;
}

function XriftRuntimeAudioAdapters({ result }: { result: XriftLoadResult }) {
  const portals = useMemo(() => {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene) return [];
    return Object.values(scene.entities).flatMap((entity) => {
      const target = result.entities.get(entity.id);
      if (!target) return [];
      return entity.components.flatMap((component) => {
        if (component.type !== "audio-source" || !component.enabled) return [];
        const asset = component.audioAssetId
          ? result.manifest.assets[component.audioAssetId]
          : undefined;
        if (!asset || asset.kind !== "audio") return [];
        return [
          createPortal(
            <XriftAudioSource
              key={`${entity.id}:${component.id}`}
              componentId={component.id}
              audioAssetId={asset.id}
              assetUrl={new URL(asset.url, result.assetBaseUrl).toString()}
              sourceStatus="available"
              enabled={component.enabled}
              volume={numberOr(component.volume, 1, 0)}
              loop={component.loop}
              autoplay={component.autoplay}
              spatial={component.spatial}
              refDistance={numberOr(component.refDistance, 1, 0)}
              rolloffFactor={numberOr(component.rolloffFactor, 1, 0)}
              maxDistance={numberOr(component.maxDistance, 10000, 0)}
            />,
            target,
          ),
        ];
      });
    });
  }, [result]);
  return <>{portals}</>;
}

function parseRuntimeParticleConfig(
  value: Record<string, unknown>,
): XriftParticleConfig | null {
  const range = (candidate: unknown, fallback: [number, number]) => {
    if (!isRecord(candidate)) return { min: fallback[0], max: fallback[1] };
    return {
      min: numberOr(candidate.min, fallback[0], 0),
      max: numberOr(candidate.max, fallback[1], 0),
    };
  };
  const vec3 = (candidate: unknown, fallback: [number, number, number]) =>
    vec3Or(candidate, fallback);
  const color4 = (candidate: unknown, fallback: [number, number, number, number]) =>
    Array.isArray(candidate) &&
    candidate.length === 4 &&
    candidate.every(
      (entry) => typeof entry === "number" && Number.isFinite(entry),
    )
      ? [
          candidate[0] as number,
          candidate[1] as number,
          candidate[2] as number,
          candidate[3] as number,
        ] as [number, number, number, number]
      : fallback;
  const emission = isRecord(value.emission) ? value.emission : {};
  const shape = isRecord(value.shape) ? value.shape : { type: "point" };
  const renderer = isRecord(value.renderer) ? value.renderer : {};
  const shapeType = shape.type;
  const resolvedShape: XriftParticleConfig["shape"] =
    shapeType === "sphere"
      ? { type: "sphere", radius: numberOr(shape.radius, 0.5, 0) }
      : shapeType === "cone"
        ? {
            type: "cone",
            radius: numberOr(shape.radius, 0.25, 0),
            angle: numberOr(shape.angle, 25, 0),
          }
        : shapeType === "box"
          ? { type: "box", size: vec3(shape.size, [1, 1, 1]) }
          : { type: "point" };
  const bursts = Array.isArray(emission.bursts)
    ? emission.bursts.flatMap((burst) => {
        if (!isRecord(burst)) return [];
        return [
          {
            time: numberOr(burst.time, 0, 0),
            count: numberOr(burst.count, 0, 0),
            cycles: numberOr(burst.cycles, 1, 0),
            interval: numberOr(burst.interval, 0, 0),
          },
        ];
      })
    : [];
  return {
    maxParticles: Math.max(
      1,
      Math.min(10_000, Math.floor(numberOr(value.maxParticles, 256, 0))),
    ),
    duration: Math.max(0.01, numberOr(value.duration, 5, 0)),
    looping: value.looping !== false,
    prewarm: value.prewarm === true,
    simulationSpace: value.simulationSpace === "world" ? "world" : "local",
    startDelay: range(value.startDelay, [0, 0]),
    startLifetime: range(value.startLifetime, [1, 2]),
    startSpeed: range(value.startSpeed, [0.5, 1]),
    startSize: range(value.startSize, [0.08, 0.16]),
    startRotation: range(value.startRotation, [0, Math.PI * 2]),
    gravity: vec3(value.gravity, [0, -0.35, 0]),
    emission: {
      rateOverTime: Math.max(0, numberOr(emission.rateOverTime, 24, 0)),
      bursts,
    },
    shape: resolvedShape,
    colorOverLifetime: {
      start: color4(
        isRecord(value.colorOverLifetime)
          ? value.colorOverLifetime.start
          : undefined,
        [1, 0.8, 0.3, 1],
      ),
      end: color4(
        isRecord(value.colorOverLifetime)
          ? value.colorOverLifetime.end
          : undefined,
        [1, 0.1, 0.02, 0],
      ),
    },
    sizeOverLifetime: range(value.sizeOverLifetime, [1, 0.15]),
    velocityOverLifetime: {
      linear: vec3(
        isRecord(value.velocityOverLifetime)
          ? value.velocityOverLifetime.linear
          : undefined,
        [0, 0, 0],
      ),
      orbital: vec3(
        isRecord(value.velocityOverLifetime)
          ? value.velocityOverLifetime.orbital
          : undefined,
        [0, 0, 0],
      ),
    },
    renderer: {
      mode:
        renderer.mode === "stretched-billboard"
          ? "stretched-billboard"
          : "billboard",
      blending: renderer.blending === "normal" ? "normal" : "additive",
      sortMode:
        renderer.sortMode === "distance" ||
        renderer.sortMode === "youngest" ||
        renderer.sortMode === "oldest"
          ? renderer.sortMode
          : "none",
      castShadow: renderer.castShadow === true,
      receiveShadow: renderer.receiveShadow === true,
    },
  };
}

function XriftRuntimeSpawnPointAdapter({ result }: { result: XriftLoadResult }) {
  const { setSpawnPoint } = useSpawnPointContext();
  const published = useRef(false);
  const spawnPoint = useMemo(() => {
    const marker = result.spawnPoints.values().next().value as
      | Object3D
      | undefined;
    if (!marker) return null;
    result.root.updateMatrixWorld(true);
    const position = new Vector3();
    const quaternion = new Quaternion();
    marker.getWorldPosition(position);
    marker.getWorldQuaternion(quaternion);
    const yaw = new Euler().setFromQuaternion(quaternion, "YXZ").y;
    return {
      position: [position.x, position.y, position.z] as [number, number, number],
      yaw: ((yaw * 180) / Math.PI + 360) % 360,
    };
  }, [result]);

  useEffect(() => {
    published.current = false;
  }, [spawnPoint]);

  useFrame(() => {
    if (!spawnPoint || published.current) return;
    setSpawnPoint(spawnPoint);
    published.current = true;
  });
  return null;
}

type RuntimeColliderEntry = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  boxes: Array<{
    center: [number, number, number];
    halfExtents: [number, number, number];
    rotation: [number, number, number];
    sensor: boolean;
    friction: number;
    restitution: number;
  }>;
  mesh: Object3D | null;
  meshType: "hull" | "trimesh";
  meshSensor: boolean;
  meshFriction: number;
  meshRestitution: number;
};

type RuntimeDynamicBodyEntry = RuntimeColliderEntry & {
  bodyType: "fixed" | "dynamic" | "kinematicPosition" | "kinematicVelocity";
  autoColliders: "none" | "ball" | "cuboid" | "hull" | "trimesh";
  sensor: boolean;
  friction: number;
  restitution: number;
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  canSleep: boolean;
  ccd: boolean;
  lockTranslations: boolean;
  lockRotations: boolean;
  source: Object3D;
  visual: Object3D;
};

function XriftRuntimePhysicsBodies({
  result,
  dynamicBodies,
}: {
  result: XriftLoadResult;
  dynamicBodies: readonly RuntimeDynamicBodyEntry[];
}) {
  const entries = useMemo(() => collectRuntimeColliderEntries(result), [result]);
  useEffect(
    () => () => {
      for (const entry of dynamicBodies) {
        entry.source.visible = true;
        entry.visual.visible = true;
        disposeRuntimePhysicsClone(entry.mesh);
        entry.visual.removeFromParent();
      }
    },
    [dynamicBodies],
  );
  return (
    <>
      {entries.map((entry) => (
        <RigidBody
          key={entry.id}
          type="fixed"
          colliders={false}
          position={entry.position}
          rotation={entry.rotation}
          sensor={entry.mesh ? entry.meshSensor : false}
          friction={entry.mesh ? entry.meshFriction : undefined}
          restitution={entry.mesh ? entry.meshRestitution : undefined}
        >
          {entry.mesh ? (
            <group scale={entry.scale}>
              <MeshCollider type={entry.meshType}>
                <primitive object={entry.mesh} />
              </MeshCollider>
            </group>
          ) : null}
          {entry.boxes.map((box, index) => (
            <CuboidCollider
              key={`${entry.id}:box:${index}`}
              args={box.halfExtents}
              position={box.center}
              rotation={box.rotation}
              sensor={box.sensor}
              friction={box.friction}
              restitution={box.restitution}
            />
          ))}
        </RigidBody>
      ))}
      {dynamicBodies.map((entry) => (
        <XriftRuntimeDynamicBody key={`dynamic:${entry.id}`} entry={entry} />
      ))}
    </>
  );
}

function XriftRuntimeDynamicBody({
  entry,
}: {
  entry: RuntimeDynamicBodyEntry;
}) {
  const hasExplicitCollider = entry.mesh !== null || entry.boxes.length > 0;
  const autoCollider =
    hasExplicitCollider || entry.autoColliders === "none"
      ? false
      : entry.autoColliders === "trimesh"
        ? "hull"
        : entry.autoColliders;
  return (
    <RigidBody
      type={entry.bodyType}
      colliders={autoCollider}
      position={entry.position}
      rotation={entry.rotation}
      sensor={entry.sensor}
      friction={entry.friction}
      restitution={entry.restitution}
      gravityScale={entry.gravityScale}
      linearDamping={entry.linearDamping}
      angularDamping={entry.angularDamping}
      canSleep={entry.canSleep}
      ccd={entry.ccd}
      lockTranslations={entry.lockTranslations}
      lockRotations={entry.lockRotations}
    >
      <primitive object={entry.visual} />
      {entry.mesh ? (
        <group scale={entry.scale}>
          <MeshCollider type={entry.meshType}>
            <primitive object={entry.mesh} />
          </MeshCollider>
        </group>
      ) : null}
      {entry.boxes.map((box, index) => (
        <CuboidCollider
          key={`${entry.id}:dynamic-box:${index}`}
            args={box.halfExtents}
            position={box.center}
            rotation={box.rotation}
          sensor={box.sensor}
          friction={box.friction}
          restitution={box.restitution}
        />
      ))}
    </RigidBody>
  );
}

function collectRuntimeDynamicBodyEntries(
  result: XriftLoadResult,
): RuntimeDynamicBodyEntry[] {
  const scene = result.manifest.scenes[result.manifest.entryScene];
  if (!scene) return [];
  result.root.updateMatrixWorld(true);
  const entries: RuntimeDynamicBodyEntry[] = [];
  for (const entity of Object.values(scene.entities)) {
    if (!entity.enabled) continue;
    const source = result.entities.get(entity.id);
    if (!source || source.parent !== result.root) continue;
    if (hasDescendantRigidBody(entity.id, scene)) continue;
    const rigidBody = entity.components.find(
      (component): component is Extract<XriftRuntimeComponent, { type: "rigid-body" }> =>
        component.type === "rigid-body" && component.enabled,
    );
    const colliders = entity.components.filter(
      (component): component is Extract<XriftRuntimeComponent, { type: "collider" }> =>
        component.type === "collider" && component.enabled,
    );
    const legacyDynamicCollider = colliders.find(
      (component) => component.bodyType !== undefined && component.bodyType !== "fixed",
    );
    const bodyType = rigidBody?.bodyType ?? legacyDynamicCollider?.bodyType;
    if (
      bodyType !== "fixed" &&
      bodyType !== "dynamic" &&
      bodyType !== "kinematicPosition" &&
      bodyType !== "kinematicVelocity"
    ) {
      continue;
    }
    if (bodyType === "fixed" && !rigidBody) continue;
    source.updateWorldMatrix(true, false);
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    source.matrixWorld.decompose(position, quaternion, scale);
    const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
    const worldScale: [number, number, number] = [
      Math.abs(scale.x),
      Math.abs(scale.y),
      Math.abs(scale.z),
    ];
    const ownedColliders = collectRuntimeOwnedColliders(entity, scene, result);
    const ownerInverse = new Matrix4().copy(source.matrixWorld).invert();
    const boxes = ownedColliders.flatMap(({ entity: colliderEntity, component: collider }) => {
      if (collider.shape !== "box") return [];
      const center = vec3Or(collider.center, [0, 0, 0]);
      const halfExtents = vec3Or(collider.halfExtents, [0.5, 0.5, 0.5]);
      const colliderSource = result.entities.get(colliderEntity.id) ?? source;
      colliderSource.updateWorldMatrix(true, false);
      const relative = new Matrix4().multiplyMatrices(
        ownerInverse,
        colliderSource.matrixWorld,
      );
      const relativePosition = new Vector3();
      const relativeQuaternion = new Quaternion();
      const relativeScale = new Vector3();
      relative.decompose(relativePosition, relativeQuaternion, relativeScale);
      const localCenter = new Vector3(...center).applyMatrix4(relative);
      localCenter.multiply(new Vector3(...worldScale));
      const localRotation = new Euler().setFromQuaternion(relativeQuaternion, "XYZ");
      return [
        {
          center: [localCenter.x, localCenter.y, localCenter.z] as [number, number, number],
          halfExtents: [
            halfExtents[0] * Math.abs(relativeScale.x) * worldScale[0],
            halfExtents[1] * Math.abs(relativeScale.y) * worldScale[1],
            halfExtents[2] * Math.abs(relativeScale.z) * worldScale[2],
          ] as [number, number, number],
          rotation: [localRotation.x, localRotation.y, localRotation.z] as [
            number,
            number,
            number,
          ],
          sensor: collider.isTrigger === true,
          friction: numberOr(collider.friction, 0.8, 0),
          restitution: numberOr(collider.restitution, 0.1, 0),
        },
      ];
    });
    const meshColliders = ownedColliders.filter(
      ({ component }) => component.shape === "mesh",
    );
    const meshCollider = meshColliders[0]?.component;
    const meshParts = meshColliders.flatMap(({ entity: colliderEntity }) => {
      const colliderSource = result.entities.get(colliderEntity.id);
      if (!colliderSource || !containsMesh(colliderSource)) return [];
      colliderSource.updateWorldMatrix(true, false);
      const relative = new Matrix4().multiplyMatrices(
        ownerInverse,
        colliderSource.matrixWorld,
      );
      const clone = colliderSource.clone(true);
      const relativePosition = new Vector3();
      const relativeQuaternion = new Quaternion();
      const relativeScale = new Vector3();
      relative.decompose(relativePosition, relativeQuaternion, relativeScale);
      clone.position.copy(relativePosition);
      clone.quaternion.copy(relativeQuaternion);
      clone.scale.copy(relativeScale);
      prepareColliderClone(clone, true);
      return [clone];
    });
    const mesh = meshParts.length === 0 ? null : new Group();
    if (mesh) mesh.add(...meshParts);
    const visual = source.clone(true);
    visual.position.set(0, 0, 0);
    visual.quaternion.identity();
    visual.scale.copy(scale);
    source.visible = false;
    entries.push({
      id: entity.id,
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      scale: worldScale,
      boxes,
      mesh,
      meshType:
        bodyType === "fixed" &&
        meshColliders.some(({ component }) => component.meshMode !== "convex")
          ? "trimesh"
          : "hull",
      meshSensor: meshCollider?.isTrigger === true,
      meshFriction: numberOr(meshCollider?.friction, 0.8, 0),
      meshRestitution: numberOr(meshCollider?.restitution, 0.1, 0),
      bodyType,
      autoColliders: rigidBody?.autoColliders ?? "none",
      sensor: rigidBody?.isTrigger ?? meshCollider?.isTrigger === true,
      friction: numberOr(rigidBody?.friction ?? meshCollider?.friction, 0.8, 0),
      restitution: numberOr(rigidBody?.restitution ?? meshCollider?.restitution, 0.1, 0),
      gravityScale: numberOr(rigidBody?.gravityScale ?? legacyDynamicCollider?.gravityScale, 1, 0),
      linearDamping: numberOr(rigidBody?.linearDamping ?? legacyDynamicCollider?.linearDamping, 0, 0),
      angularDamping: numberOr(rigidBody?.angularDamping ?? legacyDynamicCollider?.angularDamping, 0, 0),
      canSleep: booleanOr(legacyDynamicCollider?.canSleep, rigidBody?.canSleep ?? true),
      ccd: booleanOr(legacyDynamicCollider?.ccd, rigidBody?.ccd ?? false),
      lockTranslations: booleanOr(
        legacyDynamicCollider?.lockTranslations,
        rigidBody?.lockTranslations ?? false,
      ),
      lockRotations: booleanOr(
        legacyDynamicCollider?.lockRotations,
        rigidBody?.lockRotations ?? false,
      ),
      source,
      visual,
    });
  }
  return entries;
}

function collectRuntimeOwnedColliders(
  owner: XriftRuntimeEntity,
  scene: NonNullable<XriftRuntimeManifest["scenes"][string]>,
  result: XriftLoadResult,
): Array<{
  entity: XriftRuntimeEntity;
  component: Extract<XriftRuntimeComponent, { type: "collider" }>;
}> {
  return Object.values(scene.entities).flatMap((candidate) => {
    if (!candidate.enabled || !isDescendantEntity(candidate.id, owner.id, scene)) {
      return [];
    }
    if (candidate.id !== owner.id && hasBodyBoundaryBetween(candidate.id, owner.id, scene)) {
      return [];
    }
    const source = result.entities.get(candidate.id);
    if (!source) return [];
    return candidate.components.flatMap((component) => {
      if (
        component.type !== "collider" ||
        !component.enabled ||
        (candidate.id !== owner.id && !isFixedCollider(component))
      ) {
        return [];
      }
      return [{ entity: candidate, component }];
    });
  });
}

function hasBodyBoundaryBetween(
  entityId: string,
  ownerId: string,
  scene: NonNullable<XriftRuntimeManifest["scenes"][string]>,
): boolean {
  let current = scene.entities[entityId];
  while (current && current.id !== ownerId) {
    if (current.id !== entityId && hasEnabledBody(current)) return true;
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return false;
}

function hasEnabledBody(entity: XriftRuntimeEntity): boolean {
  return (
    entity.components.some(
      (component) => component.type === "rigid-body" && component.enabled,
    ) ||
    entity.components.some(
      (component) =>
        component.type === "collider" &&
        component.enabled &&
        component.bodyType !== undefined &&
        component.bodyType !== "fixed",
    )
  );
}

function hasDescendantRigidBody(
  ownerId: string,
  scene: NonNullable<XriftRuntimeManifest["scenes"][string]>,
): boolean {
  return Object.values(scene.entities).some(
    (candidate) =>
      candidate.id !== ownerId &&
      isDescendantEntity(candidate.id, ownerId, scene) &&
      candidate.components.some(
        (component) => component.type === "rigid-body" && component.enabled,
      ),
  );
}

function isDescendantEntity(
  entityId: string,
  ancestorId: string,
  scene: NonNullable<XriftRuntimeManifest["scenes"][string]>,
): boolean {
  let current = scene.entities[entityId];
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parentId ? scene.entities[current.parentId] : undefined;
  }
  return false;
}

function disposeRuntimePhysicsClone(object: Object3D | null): void {
  if (!object) return;
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) material.dispose();
  });
}

function collectRuntimeColliderEntries(
  result: XriftLoadResult,
): RuntimeColliderEntry[] {
  const scene = result.manifest.scenes[result.manifest.entryScene];
  if (!scene) return [];
  result.root.updateMatrixWorld(true);
  const entries: RuntimeColliderEntry[] = [];
  for (const entity of Object.values(scene.entities)) {
    if (!entity.enabled) continue;
    const hasRigidBody = entity.components.some(
      (component) => component.type === "rigid-body" && component.enabled,
    );
    if (hasRigidBody) continue;
    if (findAncestorRigidBody(entity.id, scene)) continue;
    const colliders = entity.components.filter(
      (component): component is Extract<XriftRuntimeComponent, { type: "collider" }> =>
        component.type === "collider" && component.enabled && isFixedCollider(component),
    );
    if (colliders.length === 0) continue;
    const source = result.entities.get(entity.id);
    if (!source) continue;
    source.updateWorldMatrix(true, false);
    const position = new Vector3();
    const quaternion = new Quaternion();
    const scale = new Vector3();
    source.matrixWorld.decompose(position, quaternion, scale);
    const rotation = new Euler().setFromQuaternion(quaternion, "XYZ");
    const worldScale: [number, number, number] = [
      Math.abs(scale.x),
      Math.abs(scale.y),
      Math.abs(scale.z),
    ];
    const boxes = colliders.flatMap((collider) => {
      if (collider.shape !== "box") return [];
      const center = vec3Or(collider.center, [0, 0, 0]);
      const halfExtents = vec3Or(collider.halfExtents, [0.5, 0.5, 0.5]);
      return [
        {
          center: [
            center[0] * worldScale[0],
            center[1] * worldScale[1],
            center[2] * worldScale[2],
          ] as [number, number, number],
          halfExtents: [
            halfExtents[0] * worldScale[0],
            halfExtents[1] * worldScale[1],
            halfExtents[2] * worldScale[2],
          ] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          sensor: collider.isTrigger === true,
          friction: numberOr(collider.friction, 0.8, 0),
          restitution: numberOr(collider.restitution, 0.1, 0),
        },
      ];
    });
    const meshCollider = colliders.find((collider) => collider.shape === "mesh");
    let meshSource: Object3D | null = null;
    if (meshCollider) {
      if (containsMesh(source)) {
        meshSource = source.clone(true);
      } else if (entity.modelNode) {
        // A shared-Model node draws nothing itself; its collider geometry
        // lives under the Model root's loaded object.
        meshSource = cloneModelNodeGeometry(result, entity.modelNode);
      }
    }
    const mesh = meshSource ? prepareColliderClone(meshSource) : null;
    entries.push({
      id: entity.id,
      position: [position.x, position.y, position.z],
      rotation: [rotation.x, rotation.y, rotation.z],
      scale: worldScale,
      boxes,
      mesh,
      meshType:
        meshCollider?.meshMode === "convex" ? "hull" : "trimesh",
      meshSensor: meshCollider?.isTrigger === true,
      meshFriction: numberOr(meshCollider?.friction, 0.8, 0),
      meshRestitution: numberOr(meshCollider?.restitution, 0.1, 0),
    });
  }
  return entries;
}

function isFixedCollider(
  component: Extract<XriftRuntimeComponent, { type: "collider" }>,
): boolean {
  return component.bodyType === undefined || component.bodyType === "fixed";
}

function findAncestorRigidBody(
  entityId: string,
  scene: NonNullable<XriftRuntimeManifest["scenes"][string]>,
): XriftRuntimeEntity | undefined {
  let current = scene.entities[entityId];
  while (current?.parentId) {
    current = scene.entities[current.parentId];
    if (
      current?.components.some(
        (component) => component.type === "rigid-body" && component.enabled,
      )
    ) {
      return current;
    }
  }
  return undefined;
}

function containsMesh(object: Object3D): boolean {
  let found = false;
  object.traverse((child) => {
    if (child instanceof Mesh) found = true;
  });
  return found;
}

/**
 * Collider geometry for a Mesh Collider on a shared-Model node: the node's
 * subtree cloned out of the Model root's loaded object, minus descendants
 * that are glTF nodes of their own — their colliders are their own
 * Entities' business. The proxy Entity's world transform places the result,
 * so the clone's own Transform is discarded by prepareColliderClone.
 */
function cloneModelNodeGeometry(
  result: XriftLoadResult,
  modelNode: {
    modelAssetId: string;
    modelEntityId: string;
    sourceNodeIndex: number;
  },
): Object3D | null {
  const modelRoot = result.entities.get(modelNode.modelEntityId);
  if (!modelRoot) return null;
  let node: Object3D | null = null;
  modelRoot.traverse((candidate) => {
    if (
      !node &&
      candidate.userData.xriftSourceNodeIndex === modelNode.sourceNodeIndex
    ) {
      node = candidate;
    }
  });
  if (!node) return null;
  const clone = (node as Object3D).clone(true);
  const strays: Object3D[] = [];
  clone.traverse((child) => {
    if (
      child !== clone &&
      typeof child.userData.xriftSourceNodeIndex === "number"
    ) {
      strays.push(child);
    }
  });
  for (const stray of strays) stray.removeFromParent();
  return containsMesh(clone) ? clone : null;
}

function prepareColliderClone(object: Object3D, preserveRootTransform = false): Object3D {
  if (!preserveRootTransform) {
    object.position.set(0, 0, 0);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);
  }
  // A node the Model pose hides (visible: false) is out of the world's sight
  // and out of its physics: drop it before visibility is forced back on for
  // Rapier's sweep below.
  const hidden: Object3D[] = [];
  object.traverse((child) => {
    if (child !== object && !child.visible) hidden.push(child);
  });
  for (const child of hidden) child.removeFromParent();
  object.traverse((child) => {
    child.visible = true;
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
    if (Array.isArray(materials)) {
      for (const material of materials) material.visible = false;
    } else {
      materials.visible = false;
    }
    child.material = materials;
  });
  return object;
}

function runtimeGravity(result: XriftLoadResult): [number, number, number] {
  const settings = result.manifest.scenes[result.manifest.entryScene]?.settings;
  const physics = isRecord(settings?.physics) ? settings.physics : null;
  const gravity = numberOr(physics?.gravity, 9.81, 0);
  return [0, -gravity, 0];
}

function vec3Or(
  value: unknown,
  fallback: [number, number, number],
  minimum = Number.NEGATIVE_INFINITY,
): [number, number, number] {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isFinite(entry) &&
        entry >= minimum,
    )
    ? [value[0] as number, value[1] as number, value[2] as number]
    : fallback;
}

function XriftRuntimePostprocessing({ result }: { result: XriftLoadResult }) {
  const { camera, gl, scene, size } = useThree();
  const settings = result.manifest.scenes[result.manifest.entryScene]?.settings;
  const postprocessing = isRecord(settings?.postprocessing)
    ? settings.postprocessing
    : null;
  const bloom = isRecord(postprocessing?.bloom)
    ? postprocessing.bloom
    : null;
  const hdr = isRecord(postprocessing?.hdr) ? postprocessing.hdr : null;
  const ao = isRecord(postprocessing?.ao) ? postprocessing.ao : null;
  const enabled = postprocessing?.enabled === true;
  const bloomEnabled = bloom?.enabled === true;
  const hdrEnabled = hdr?.enabled !== false;
  const toneMapping = hdr?.toneMapping === "none" ? "none" : "aces";
  const pipeline = useMemo(() => {
    const renderTarget = hdrEnabled
      ? new WebGLRenderTarget(size.width, size.height, {
          type: HalfFloatType,
          format: RGBAFormat,
          depthBuffer: true,
          stencilBuffer: false,
        })
      : undefined;
    const composer = new EffectComposer(gl, renderTarget);
    const renderPass = new RenderPass(scene, camera);
    const aoPass = new SSAOPass(scene, camera, size.width, size.height);
    const bloomPass = new UnrealBloomPass(new Vector2(size.width, size.height), 0.12, 0.18, 8);
    composer.addPass(renderPass);
    composer.addPass(aoPass);
    composer.addPass(bloomPass);
    return { composer, aoPass, bloomPass };
  }, [camera, gl, hdrEnabled, scene]);

  useEffect(() => {
    pipeline.composer.setSize(size.width, size.height);
  }, [pipeline, size.height, size.width]);

  useEffect(() => {
    const previousToneMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    const previousOutputColorSpace = gl.outputColorSpace;
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping = toneMapping === "none" ? NoToneMapping : ACESFilmicToneMapping;
    gl.toneMappingExposure = numberOr(postprocessing?.exposure, 0.85, 0);
    return () => {
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousExposure;
      gl.outputColorSpace = previousOutputColorSpace;
    };
  }, [gl, postprocessing?.exposure, toneMapping]);

  useEffect(() => {
    pipeline.bloomPass.enabled = enabled && bloomEnabled;
    pipeline.bloomPass.threshold = numberOr(bloom?.threshold, 8, 0);
    pipeline.bloomPass.strength = numberOr(bloom?.strength, 0.12, 0);
    pipeline.bloomPass.radius = numberOr(bloom?.radius, 0.18, 0);
    pipeline.aoPass.enabled = enabled && ao?.enabled === true;
    pipeline.aoPass.kernelRadius = numberOr(ao?.radius, 8, 0.1);
    pipeline.aoPass.minDistance = numberOr(ao?.minDistance, 0.005, 0);
    pipeline.aoPass.maxDistance = Math.max(
      numberOr(ao?.maxDistance, 0.1, 0.001),
      numberOr(ao?.minDistance, 0.005, 0) + 0.001,
    );
  }, [ao, bloom, bloomEnabled, enabled, pipeline]);

  useEffect(
    () => () => {
      pipeline.composer.dispose();
    },
    [pipeline],
  );

  useFrame(() => {
    if (enabled) {
      pipeline.composer.render();
    } else {
      // This callback owns the render priority, so explicitly fall back to
      // the normal renderer when the scene disables postprocessing.
      gl.render(scene, camera);
    }
  }, 1);
  return null;
}

type RuntimeMeshVisibilityTarget = {
  object: Object3D;
  maxDistance: number;
  worldPosition: Vector3;
};

function collectRuntimeMeshVisibilityTargets(
  result: XriftLoadResult,
): RuntimeMeshVisibilityTarget[] {
  const scene = result.manifest.scenes[result.manifest.entryScene];
  if (!scene) return [];
  const targets: RuntimeMeshVisibilityTarget[] = [];
  for (const entity of Object.values(scene.entities)) {
    const entityRoot = result.entities.get(entity.id);
    if (!entityRoot) continue;
    for (const component of entity.components) {
      if (
        component.type !== "mesh" ||
        !component.enabled ||
        component.maxDistance === undefined ||
        !Number.isFinite(component.maxDistance)
      ) {
        continue;
      }
      const object = entityRoot.children.find(
        (candidate) =>
          candidate.userData.xriftStudioComponentId === component.id,
      );
      if (!object) continue;
      targets.push({
        object,
        maxDistance: component.maxDistance,
        worldPosition: new Vector3(),
      });
    }
  }
  return targets;
}

/** Applies Mesh maxDistance every frame so Editor/Play/Classic share one cutoff. */
function XriftRuntimeMeshVisibility({ result }: { result: XriftLoadResult }) {
  const targets = useMemo(
    () => collectRuntimeMeshVisibilityTargets(result),
    [result],
  );
  const cameraPosition = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldPosition(cameraPosition);
    for (const target of targets) {
      target.object.getWorldPosition(target.worldPosition);
      const visible =
        cameraPosition.distanceTo(target.worldPosition) <= target.maxDistance;
      if (target.object.visible !== visible) target.object.visible = visible;
    }
  });
  return null;
}

type RuntimeVegetationTarget = {
  object: Object3D;
  position: Vector3;
  rotation: Euler;
  phase: number;
  componentEnabled: boolean;
};

function collectRuntimeVegetationTargets(
  result: XriftLoadResult,
): RuntimeVegetationTarget[] {
  const scene = result.manifest.scenes[result.manifest.entryScene];
  if (!scene) return [];
  const targets: RuntimeVegetationTarget[] = [];
  const seen = new Set<Object3D>();
  for (const entity of Object.values(scene.entities)) {
    const root = result.entities.get(entity.id);
    if (!root) continue;
    const component = entity.components.find(
      (candidate) => candidate.type === "vegetation-wind",
    );
    if (!component || !component.enabled) continue;
    root.traverse((object) => {
      if (!(object instanceof Mesh) || seen.has(object)) return;
      seen.add(object);
      const position = object.position.clone();
      const rotation = object.rotation.clone();
      let phase = 0;
      for (const character of `${entity.id}:${object.uuid}`) {
        phase = (phase * 31 + character.charCodeAt(0)) % 628;
      }
      targets.push({
        object,
        position,
        rotation,
        phase: phase / 100,
        componentEnabled: component.enabled,
      });
    });
  }
  return targets;
}

function XriftRuntimeVegetationWind({ result }: { result: XriftLoadResult }) {
  const targets = useMemo(() => collectRuntimeVegetationTargets(result), [result]);
  const sceneSettings = result.manifest.scenes[result.manifest.entryScene]?.settings;
  const vegetation = isRecord(sceneSettings?.vegetation)
    ? sceneSettings.vegetation
    : null;
  const enabled = vegetation?.enabled === true;
  const windStrength = numberOr(vegetation?.windStrength, 0.08, 0);
  const windSpeed = numberOr(vegetation?.windSpeed, 0.8, 0);
  const gustStrength = numberOr(vegetation?.gustStrength, 0.35, 0);

  useFrame((state) => {
    if (!enabled || targets.length === 0) return;
    const elapsed = state.clock.getElapsedTime();
    for (const target of targets) {
      if (!target.componentEnabled) continue;
      const wave =
        Math.sin(elapsed * windSpeed + target.phase) * 0.7 +
        Math.sin(elapsed * windSpeed * 0.37 + target.phase * 1.7) *
          gustStrength;
      target.object.position.copy(target.position);
      target.object.position.x += wave * windStrength * 0.03;
      target.object.position.y +=
        Math.cos(elapsed * windSpeed * 0.63 + target.phase) *
        windStrength *
        0.01;
      target.object.rotation.copy(target.rotation);
      target.object.rotation.z += wave * windStrength * 0.35;
      target.object.rotation.x += wave * windStrength * 0.16;
    }
  });
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? value
    : fallback;
}

function XriftRuntimeTimeUniforms({ result }: { result: XriftLoadResult }) {
  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    result.root.traverse((object) => {
      const mesh = object as Mesh;
      const material = mesh.material as ShaderMaterial | undefined;
      const specs = material?.userData?.xriftTimeUniforms as
        | TimeUniformSpec[]
        | undefined;
      if (!Array.isArray(specs) || !material) return;
      for (const spec of specs) {
        const uniform = material.uniforms[spec.name];
        if (uniform) {
          applyTimeUniformValue(uniform as MutableUniformValue, spec, elapsed);
        }
      }
    });
  });
  return null;
}

function XriftRuntimeAnimations({ result }: { result: XriftLoadResult }) {
  /**
   * One mixer per Entity, not one per clip.
   *
   * A behavior graph can pause, seek or switch the clip an Entity is playing,
   * and that only has a meaning when every clip on that Entity shares a mixer:
   * with one mixer per clip, "switch to clip 2" would leave clip 1 running on
   * its own timeline.
   */
  const entries = useMemo(() => {
    const scene = result.manifest.scenes[result.manifest.entryScene];
    if (!scene) return [];
    return Object.values(scene.entities).flatMap((entity) => {
      const target = result.entities.get(entity.id);
      const clips = result.animationClipsByEntity.get(entity.id) ?? [];
      if (!target || clips.length === 0) return [];
      /*
       * What plays, and how, comes only from the graph.
       *
       * v1 removed the Animation Component: one Component could name one clip,
       * and a Model whose motion is split across dozens of them had no way to
       * say "all of these". So loop and speed are per cue rather than per
       * Entity, and an Entity with clips gets a mixer whether or not anything
       * has started one yet — a graph can start a clip at any moment.
       */
      const cues = planInteractivityAnimationCues(
        result.interactionAnimationCuesByEntity.get(entity.id) ?? [],
      ).flatMap((plan) => {
        const clip = clips[plan.index];
        return clip ? [{ clip, ...plan }] : [];
      });
      return [
        {
          entityId: entity.id,
          target,
          clips,
          cues,
          mixer: new AnimationMixer(target),
          bridge: null as XriftAnimationRuntimeBridge | null,
        },
      ];
    });
  }, [result]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const entry of entries) {
      for (const cue of entry.cues) {
        const action = entry.mixer.clipAction(cue.clip);
        action.reset();
        action.clampWhenFinished = !cue.loop;
        action.setLoop(cue.loop ? LoopRepeat : LoopOnce, cue.loop ? Infinity : 1);
        action.timeScale = cue.speed;
        if (cue.startTime > 0) action.time = cue.startTime;
        // `flow/setDelay` becomes mixer-clock scheduling rather than a timer, so
        // the wait stays in step with the same clock that advances the clip.
        if (cue.delaySeconds > 0) {
          action.startAt(entry.mixer.time + cue.delaySeconds);
        }
        action.play();
      }
      // A bridge for every Entity that has clips. What it should play is not
      // known here — a graph can start any clip at any moment — so the bridge
      // carries no clip of its own and no owner id, and the cues above have
      // already started whatever begins with the world.
      const bridge = createXriftAnimationRuntimeBridge({
        componentId: "",
        clipNames: entry.clips.map((clip) => clip.name),
        clipIndex: 0,
        autoplay: false,
        speed: 1,
        loop: false,
      });
      const controller = createXriftAnimationMixerController({
        mixer: entry.mixer,
        clips: entry.clips,
        clipIndex: 0,
        loop: false,
        speed: 1,
      });
      const disconnect = bridge.connect(controller);
      const holder = entry.target.userData as Record<string, unknown>;
      holder[XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY] = bridge;
      entry.bridge = bridge;
      cleanups.push(() => {
        disconnect();
        controller.dispose();
        delete holder[XRIFT_ANIMATION_RUNTIME_USER_DATA_KEY];
        entry.bridge = null;
      });
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
      for (const entry of entries) {
        entry.mixer.stopAllAction();
        entry.mixer.uncacheRoot(entry.mixer.getRoot());
      }
    };
  }, [entries]);

  useFrame((_, delta) => {
    for (const entry of entries) {
      entry.mixer.update(Math.min(delta, 0.1));
      entry.bridge?.sample();
    }
  });

  return null;
}
