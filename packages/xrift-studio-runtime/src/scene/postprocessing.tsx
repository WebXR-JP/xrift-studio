import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
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

export function ScenePostprocessing({
  settings,
}: {
  settings: XriftScenePostprocessingSettings;
}) {
  const { camera, gl, scene, size } = useThree();
  const hdrEnabled = settings.hdr.enabled;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl, hdrEnabled, scene]);

  useEffect(() => {
    pipeline.composer.setSize(size.width, size.height);
  }, [pipeline, size.height, size.width]);

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

  useEffect(() => {
    pipeline.bloomPass.enabled = settings.enabled && settings.bloom.enabled;
    pipeline.bloomPass.threshold = settings.bloom.threshold;
    pipeline.bloomPass.strength = settings.bloom.strength;
    pipeline.bloomPass.radius = settings.bloom.radius;
    pipeline.aoPass.enabled = settings.enabled && settings.ao.enabled;
    pipeline.aoPass.kernelRadius = settings.ao.radius;
    pipeline.aoPass.minDistance = settings.ao.minDistance;
    pipeline.aoPass.maxDistance = Math.max(
      settings.ao.maxDistance,
      settings.ao.minDistance + 0.001,
    );
    pipeline.gradingPass.enabled =
      settings.enabled && settings.grading.enabled;
    const uniforms = pipeline.gradingPass.uniforms as Record<
      string,
      { value: number } | undefined
    >;
    const setGrading = (name: string, value: number) => {
      const uniform = uniforms[name];
      if (uniform) uniform.value = value;
    };
    setGrading("uContrast", settings.grading.contrast);
    setGrading("uSaturation", settings.grading.saturation);
    setGrading("uTemperature", settings.grading.temperature);
    setGrading("uTint", settings.grading.tint);
  }, [pipeline, settings]);

  useEffect(
    () => () => {
      pipeline.composer.dispose();
    },
    [pipeline],
  );

  useFrame(() => {
    if (settings.enabled) {
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
