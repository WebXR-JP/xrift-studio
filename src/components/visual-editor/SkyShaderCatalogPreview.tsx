import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BackSide, SphereGeometry, type ShaderMaterial } from "three";
import type { ClassicR3fMaterialShader } from "../../lib/visual-editor";
import { validateClassicR3fMaterialShader } from "../../lib/visual-editor";
import {
  applyTimeUniformValue,
  type MutableUniformValue,
  type TimeUniformSpec,
} from "../../../packages/xrift-studio-runtime/src/shader-time";
import { createClassicR3fMaterial } from "./ProjectModelVisual";

/**
 * Renders a Sky Shader the way the scene does: the real GLSL on a back-facing
 * sky sphere, viewed from inside. The store never shows a drawn stand-in for a
 * sky, so what an author picks is what the world gets.
 *
 * Grid cards render a single still frame. Only the selected preset animates, so
 * a catalog of skies does not turn into several always-running WebGL loops.
 */
export function SkyShaderCatalogPreview({
  shader,
  className = "h-full w-full",
  animated = false,
}: {
  shader: ClassicR3fMaterialShader;
  className?: string;
  animated?: boolean;
}) {
  const diagnostics = useMemo(
    () => validateClassicR3fMaterialShader(shader),
    [shader],
  );

  if (diagnostics.length > 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 px-3 text-center ${className}`}
      >
        <span className="text-[11px] font-semibold text-slate-700">
          Skybox Shaderを表示できません
        </span>
        <span className="mt-1 text-[10px] leading-4 text-slate-500">
          {diagnostics[0]}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-slate-950 ${className}`}
      data-sky-shader-preview={shader.sourceModulePath}
      data-sky-shader-animated={animated}
    >
      <Canvas
        frameloop={animated ? "always" : "demand"}
        dpr={[1, 1.5]}
        // Inside the sky sphere, tilted up so the horizon sits low in frame.
        camera={{ position: [0, 0, 0.01], fov: 62, rotation: [0.34, 0.38, 0] }}
        gl={{ antialias: true, alpha: false }}
      >
        <SkyShaderPreviewDome shader={shader} animated={animated} />
      </Canvas>
    </div>
  );
}

function SkyShaderPreviewDome({
  shader,
  animated,
}: {
  shader: ClassicR3fMaterialShader;
  animated: boolean;
}) {
  const geometry = useMemo(() => new SphereGeometry(1, 48, 32), []);
  const material = useMemo(() => {
    const next = createClassicR3fMaterial(shader, {}, "");
    next.side = BackSide;
    next.depthTest = false;
    next.depthWrite = false;
    next.needsUpdate = true;
    return next;
  }, [shader]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  // A still card should not read as a frozen animation, so it renders the sky
  // a little way into its own timeline rather than at zero.
  useEffect(() => {
    if (!animated) applyPreviewTime(material, 6.5);
  }, [animated, material]);

  useFrame((state) => {
    if (animated) applyPreviewTime(material, state.clock.getElapsedTime());
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

function applyPreviewTime(material: ShaderMaterial, elapsed: number): void {
  const specs = material.userData.xriftTimeUniforms as
    | TimeUniformSpec[]
    | undefined;
  if (!Array.isArray(specs)) return;
  for (const spec of specs) {
    const uniform = material.uniforms[spec.name];
    if (uniform) {
      applyTimeUniformValue(uniform as MutableUniformValue, spec, elapsed);
    }
  }
}
