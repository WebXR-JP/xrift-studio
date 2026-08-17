import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { DoubleSide, PlaneGeometry, Vector2, type ShaderMaterial } from "three";
import type {
  ClassicR3fMaterialShader,
  ResolvedWind,
} from "../../lib/visual-editor";
import {
  validateClassicR3fMaterialShader,
  windDrivenUniforms,
} from "../../lib/visual-editor";
import {
  applyTimeUniformValue,
  type MutableUniformValue,
  type TimeUniformSpec,
} from "../../../packages/xrift-studio-runtime/src/shader-time";
import { createClassicR3fMaterial } from "./ProjectModelVisual";

/**
 * Renders a Water preset the way a scene does: the real GLSL on a horizontal
 * plane, seen from a low angle so the Fresnel edge and the wave normals are
 * both readable. The store never shows a drawn stand-in for a material.
 */
export function WaterShaderCatalogPreview({
  shader,
  wind,
  className = "h-full w-full",
  animated = false,
}: {
  shader: ClassicR3fMaterialShader;
  /** The scene's wind, so the store preview moves like the world will. */
  wind: ResolvedWind;
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
          Water Shaderを表示できません
        </span>
        <span className="mt-1 text-[10px] leading-4 text-slate-500">
          {diagnostics[0]}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-slate-900 ${className}`}
      data-water-shader-preview={shader.sourceModulePath}
    >
      <Canvas
        frameloop={animated ? "always" : "demand"}
        dpr={[1, 1.5]}
        camera={{ position: [0, 1.15, 4.2], fov: 42 }}
        gl={{ antialias: true, alpha: false }}
      >
        <WaterPreviewSurface shader={shader} wind={wind} animated={animated} />
      </Canvas>
    </div>
  );
}

function WaterPreviewSurface({
  shader,
  wind,
  animated,
}: {
  shader: ClassicR3fMaterialShader;
  wind: ResolvedWind;
  animated: boolean;
}) {
  // Large enough that the far edge reaches a grazing angle, which is where
  // water actually reads as water.
  const geometry = useMemo(() => new PlaneGeometry(90, 90, 1, 1), []);
  const material = useMemo(() => {
    const next = createClassicR3fMaterial(shader, {}, "");
    next.side = DoubleSide;
    next.needsUpdate = true;
    return next;
  }, [shader]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    for (const entry of windDrivenUniforms(shader, wind)) {
      const uniform = material.uniforms[entry.name];
      if (!uniform) continue;
      if (entry.kind === "number") {
        uniform.value = entry.value;
        continue;
      }
      const current = uniform.value;
      if (current instanceof Vector2) {
        current.set(entry.value[0], entry.value[1]);
      } else {
        uniform.value = new Vector2(entry.value[0], entry.value[1]);
      }
    }
    material.needsUpdate = true;
  }, [material, shader, wind]);
  // A still card should not read as frozen water, so it samples a moment part
  // way into the wave motion rather than time zero.
  useEffect(() => {
    if (!animated) applyPreviewTime(material, 12.5);
  }, [animated, material]);

  useFrame((state) => {
    if (animated) applyPreviewTime(material, state.clock.getElapsedTime());
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    />
  );
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
