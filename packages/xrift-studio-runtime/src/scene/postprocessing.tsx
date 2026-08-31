import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  ACESFilmicToneMapping,
  HalfFloatType,
  NoToneMapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector2,
  WebGLRenderTarget,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {
  findXriftSceneRuntimeBridge,
  publishXriftScenePostprocessingBaseline,
  type XriftSceneRuntimeState,
} from "../script/scene-runtime.js";

/**
 * The scene compositor: tone mapping, SSAO, Bloom, and colour grading.
 *
 * One copy, three consumers. The editor viewport mounts it, the external
 * resource store mounts it so a catalog card shows the halo the scene will
 * actually produce, and the compiler ships this same file into a published
 * world as an overlay. Keep it that way: a second copy — a string template in
 * the compiler, say — is how the editor and the published world come to grade
 * colour differently, and nothing fails to warn you.
 */
export type XriftScenePostprocessingSettings = {
  enabled: boolean;
  hdr: {
    enabled: boolean;
    toneMapping: "aces" | "none";
  };
  bloom: {
    enabled: boolean;
    threshold: number;
    strength: number;
    radius: number;
  };
  ao: {
    enabled: boolean;
    radius: number;
    minDistance: number;
    maxDistance: number;
  };
  /**
   * Colour grading, applied last.
   *
   * Exposure and tone mapping decide how much light reaches the frame; grading
   * decides what it looks like once it has. Keeping them apart matters: raising
   * exposure to warm a scene also blows out the highlights, which is the usual
   * reason a world ends up looking washed out rather than warm.
   */
  grading: {
    enabled: boolean;
    /** 1 leaves contrast alone; above 1 deepens shadows around mid grey. */
    contrast: number;
    /** 1 leaves saturation alone; 0 is greyscale. */
    saturation: number;
    /** -1 cools toward blue, +1 warms toward orange. */
    temperature: number;
    /** -1 shifts toward green, +1 toward magenta. */
    tint: number;
  };
  exposure: number;
};

/**
 * Grading in linear-ish display space, after tone mapping.
 *
 * Temperature and tint move along the two axes a white balance control uses,
 * so a scene can be warmed without tinting everything a flat orange. Contrast
 * pivots around mid grey rather than black, so deepening it does not simply
 * darken the whole frame.
 */
const XRIFT_COLOR_GRADING_SHADER = {
  uniforms: {
    tDiffuse: { value: null as unknown },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uTemperature: { value: 0 },
    uTint: { value: 0 },
  },
  vertexShader: `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `uniform sampler2D tDiffuse;
uniform float uContrast;
uniform float uSaturation;
uniform float uTemperature;
uniform float uTint;
varying vec2 vUv;

void main() {
  vec4 texel = texture2D(tDiffuse, vUv);
  vec3 color = texel.rgb;

  // White balance: warm lifts red and drops blue, tint trades green against
  // magenta. Scaled small so the full range stays usable rather than extreme.
  color.r += uTemperature * 0.10;
  color.b -= uTemperature * 0.10;
  color.g += uTint * -0.10;
  color.r += uTint * 0.05;
  color.b += uTint * 0.05;

  // Contrast around mid grey, so raising it does not just darken the frame.
  color = (color - 0.5) * uContrast + 0.5;

  // Saturation against perceived luminance, so a desaturated frame keeps the
  // brightness relationships it had.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, uSaturation);

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
}`,
};

/**
 * The compositor settings after this viewer's own graph writes.
 *
 * A behavior graph can turn the passes on and off for whoever pressed the
 * button — that is the point of「画質を上げる」— so the authored settings are a
 * starting point rather than the answer. `null` in the bridge means the viewer
 * never touched that field, which is why this merges instead of replacing.
 */
function mergeSceneOverrides(
  settings: XriftScenePostprocessingSettings,
  state: XriftSceneRuntimeState | null,
): XriftScenePostprocessingSettings {
  if (!state) return settings;
  if (
    state.postprocessing === null &&
    state.bloom === null &&
    state.bloomStrength === null &&
    state.bloomRadius === null &&
    state.bloomThreshold === null &&
    state.ao === null &&
    state.grading === null
  ) {
    return settings;
  }
  return {
    ...settings,
    enabled: state.postprocessing ?? settings.enabled,
    bloom: {
      enabled: state.bloom ?? settings.bloom.enabled,
      strength: state.bloomStrength ?? settings.bloom.strength,
      radius: state.bloomRadius ?? settings.bloom.radius,
      threshold: state.bloomThreshold ?? settings.bloom.threshold,
    },
    ao: { ...settings.ao, enabled: state.ao ?? settings.ao.enabled },
    grading: {
      ...settings.grading,
      enabled: state.grading ?? settings.grading.enabled,
    },
  };
}

export function ScenePostprocessing({
  settings,
}: {
  settings: XriftScenePostprocessingSettings;
}) {
  const { camera, gl, scene, size } = useThree();
  const hdrEnabled = settings.hdr.enabled;
  /**
   * The composer, built the first frame anything actually needs it.
   *
   * A world whose Scene has post effects off still mounts this component, so a
   * Script or a behavior graph can turn them on for one viewer. Building the
   * HDR target and the SSAO buffer up front would make every such world pay for
   * passes nobody asked for — on exactly the devices this feature exists to
   * protect.
   */
  const buildPipeline = useMemo(() => {
    return () => {
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
    const bloomPass = new UnrealBloomPass(
      new Vector2(size.width, size.height),
      settings.bloom.strength,
      settings.bloom.radius,
      settings.bloom.threshold,
    );
    const gradingPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uContrast: { value: 1 },
        uSaturation: { value: 1 },
        uTemperature: { value: 0 },
        uTint: { value: 0 },
      },
      vertexShader: XRIFT_COLOR_GRADING_SHADER.vertexShader,
      fragmentShader: XRIFT_COLOR_GRADING_SHADER.fragmentShader,
    });
    composer.addPass(renderPass);
    composer.addPass(aoPass);
    composer.addPass(bloomPass);
    // Last: grading judges the finished frame, including the bloom it picked up.
    composer.addPass(gradingPass);
    return { composer, aoPass, bloomPass, gradingPass };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, hdrEnabled, scene]);
  const pipelineRef = useRef<ReturnType<typeof buildPipeline> | null>(null);

  /**
   * The settings currently written into the passes.
   *
   * `mergeSceneOverrides` returns the authored object unchanged while no graph
   * has written anything, so identity is enough to skip the reconfigure in the
   * common case — which is every frame of a world nobody has changed.
   */
  const appliedRef = useRef<XriftScenePostprocessingSettings | null>(null);

  // A rebuilt factory means the renderer, camera, scene or HDR target changed,
  // so whatever was built for the old one no longer belongs to this Canvas.
  useEffect(() => {
    const previous = pipelineRef.current;
    pipelineRef.current = null;
    appliedRef.current = null;
    previous?.composer.dispose();
  }, [buildPipeline]);

  useEffect(() => {
    pipelineRef.current?.composer.setSize(size.width, size.height);
  }, [size.height, size.width]);

  // Edited Scene settings are a new object the frame comparison would
  // otherwise accept as already applied.
  useEffect(() => {
    appliedRef.current = null;
  }, [settings]);

  // What a graph's toggle flips away from. Only the compositor knows it.
  useEffect(
    () =>
      publishXriftScenePostprocessingBaseline(scene, {
        enabled: settings.enabled,
        bloom: settings.bloom.enabled,
        bloomStrength: settings.bloom.strength,
        bloomRadius: settings.bloom.radius,
        bloomThreshold: settings.bloom.threshold,
        ao: settings.ao.enabled,
        grading: settings.grading.enabled,
      }),
    [scene, settings],
  );

  useEffect(() => {
    const previousToneMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    const previousOutputColorSpace = gl.outputColorSpace;
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping =
      settings.hdr.toneMapping === "none"
        ? NoToneMapping
        : ACESFilmicToneMapping;
    gl.toneMappingExposure = settings.exposure;
    return () => {
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousExposure;
      gl.outputColorSpace = previousOutputColorSpace;
    };
  }, [gl, settings.exposure, settings.hdr.toneMapping]);

  /**
   * The passes are configured per frame rather than in an effect, because a
   * graph can change them at any moment and the bridge is not React state. The
   * work is a handful of assignments; building the pipeline stays in `useMemo`.
   */
  const configure = (
    pipeline: NonNullable<typeof pipelineRef.current>,
    active: XriftScenePostprocessingSettings,
  ): void => {
    pipeline.bloomPass.enabled = active.enabled && active.bloom.enabled;
    pipeline.bloomPass.threshold = active.bloom.threshold;
    pipeline.bloomPass.strength = active.bloom.strength;
    pipeline.bloomPass.radius = active.bloom.radius;
    pipeline.aoPass.enabled = active.enabled && active.ao.enabled;
    pipeline.aoPass.kernelRadius = active.ao.radius;
    pipeline.aoPass.minDistance = active.ao.minDistance;
    pipeline.aoPass.maxDistance = Math.max(
      active.ao.maxDistance,
      active.ao.minDistance + 0.001,
    );
    pipeline.gradingPass.enabled = active.enabled && active.grading.enabled;
    const uniforms = pipeline.gradingPass.uniforms as Record<
      string,
      { value: number } | undefined
    >;
    const setGrading = (name: string, value: number) => {
      const uniform = uniforms[name];
      if (uniform) uniform.value = value;
    };
    setGrading("uContrast", active.grading.contrast);
    setGrading("uSaturation", active.grading.saturation);
    setGrading("uTemperature", active.grading.temperature);
    setGrading("uTint", active.grading.tint);
  };

  useEffect(
    () => () => {
      pipelineRef.current?.composer.dispose();
      pipelineRef.current = null;
    },
    [],
  );

  useFrame(() => {
    // Re-read every frame: a graph writes into the bridge, not into React
    // state, so nothing re-renders when a viewer turns the passes on.
    const bridge = findXriftSceneRuntimeBridge(scene);
    const active = mergeSceneOverrides(settings, bridge?.read() ?? null);
    if (active.enabled && !pipelineRef.current) {
      pipelineRef.current = buildPipeline();
      pipelineRef.current.composer.setSize(size.width, size.height);
      appliedRef.current = null;
    }
    const pipeline = pipelineRef.current;
    if (pipeline && appliedRef.current !== active) {
      appliedRef.current = active;
      configure(pipeline, active);
    }
    if (active.enabled && pipeline) {
      pipeline.composer.render();
    } else {
      // A positive-priority frame callback takes over R3F's default render
      // loop. Keep the viewport live when postprocessing is disabled instead
      // of leaving the last composited frame on screen.
      gl.render(scene, camera);
    }
  }, 1);
  return null;
}
