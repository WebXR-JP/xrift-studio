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
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { SceneSettings } from "../../lib/visual-editor";

/**
 * The scene compositor: tone mapping, SSAO, and Bloom.
 *
 * The editor viewport and the external resource store both mount this so a
 * catalog card shows the same halo the scene will. Bloom is the whole point of
 * an emissive Material, and a card that drew it any other way would be
 * advertising something the author is not about to get.
 */
export function ScenePostprocessing({
  settings,
}: {
  settings: SceneSettings["postprocessing"];
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
    gl.toneMapping = settings.hdr.toneMapping === "none"
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
