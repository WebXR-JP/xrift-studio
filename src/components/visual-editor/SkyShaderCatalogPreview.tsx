import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackSide, Color, SphereGeometry, Vector2, Vector3, Vector4, type ShaderMaterial } from "three";
import type { ClassicR3fMaterialShader } from "../../lib/visual-editor";
import { validateClassicR3fMaterialShader } from "../../lib/visual-editor";
import {
  applyTimeUniformValue,
  type MutableUniformValue,
  type TimeUniformSpec,
} from "../../../packages/xrift-studio-runtime/src/shader-time";
import { createClassicR3fMaterial } from "./ProjectModelVisual";

type View = { azimuth: number; elevation: number };
type Props = {
  shader: ClassicR3fMaterialShader;
  className?: string;
  animated?: boolean;
  /** Grid cards are pre-rendered from this exact catalog revision. */
  thumbnailId?: string;
  label?: string;
  preview?: View;
};

/** Cards must not allocate a WebGL context each. Only the detail pane mounts
 * a live Canvas; a missing thumbnail shows an explicit fallback, not a new GL.
 */
export function SkyShaderCatalogPreview(props: Props) {
  return props.thumbnailId
    ? <SkyShaderThumbnail id={props.thumbnailId} label={props.label ?? props.thumbnailId} className={props.className} />
    : <SkyShaderLivePreview {...props} />;
}

function SkyShaderThumbnail({ id, label, className = "h-full w-full" }: { id: string; label: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id]);
  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className}`} data-sky-shader-thumbnail={id}>
      {failed ? (
        <div className="flex h-full flex-col items-center justify-center px-3 text-center text-[10px] text-slate-300">
          <span>サムネイルを読み込めません</span>
          <span className="mt-1">選択してライブ表示で確認してください</span>
        </div>
      ) : (
        <img
          src={`${import.meta.env.BASE_URL}visual-editor/sky-shaders/v3/${id}.webp`}
          alt={`${label}のGLSL描画サムネイル`}
          loading="lazy"
          decoding="async"
          width={640}
          height={400}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function authoredView(shader: ClassicR3fMaterialShader, preview?: View): View {
  if (preview) return preview;
  // Legacy presets place their sun/moon in different directions.
  const u = shader.uniforms;
  const sun = u.uSunAzimuth;
  const moon = u.uMoonAzimuth;
  const moonStrength = u.uMoonStrength;
  const azimuth = moonStrength?.kind === "number" && moonStrength.value > 0 && moon?.kind === "number"
    ? moon.value : sun?.kind === "number" ? sun.value : -110;
  return { azimuth, elevation: 20 };
}

function SkyShaderLivePreview({ shader, className = "h-full w-full", animated = false, label = "Skybox Shader", preview }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; view: View } | null>(null);
  const [view, setView] = useState<View>(() => authoredView(shader, preview));
  const [paused, setPaused] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [renderError, setRenderError] = useState<string | null>(null);
  const diagnostics = useMemo(() => validateClassicR3fMaterialShader(shader), [shader]);
  const running = animated && !paused && onScreen && pageVisible;
  const reportError = useCallback((message: string) => setRenderError(message), []);

  useEffect(() => {
    setView(authoredView(shader, preview));
    setRenderError(null);
    // Uniform edits should not snap the user's view back to its starting pose.
  }, [shader.sourceModulePath, preview?.azimuth, preview?.elevation]);
  useEffect(() => setRenderError(null), [shader.vertexShader, shader.fragmentShader]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => { if (media.matches) setPaused(true); };
    const visibility = () => setPageVisible(!document.hidden);
    media.addEventListener("change", reduced);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", reduced);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.01 });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [renderError]);

  if (diagnostics.length > 0 || renderError) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-100 px-3 text-center ${className}`} role="alert">
        <span className="text-[11px] font-semibold text-slate-700">Skybox Shaderを表示できません</span>
        <span className="mt-1 text-[10px] leading-4 text-slate-500">{diagnostics[0] ?? renderError}</span>
        {renderError && <button type="button" className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs" onClick={() => setRenderError(null)}>プレビューを再試行</button>}
      </div>
    );
  }

  return (
    <div
      ref={host}
      className={`relative overflow-hidden bg-slate-950 ${className}`}
      data-sky-shader-preview={shader.sourceModulePath}
      data-sky-shader-animated={running}
      tabIndex={0}
      role="group"
      aria-label={`${label}のプレビュー。ドラッグまたは矢印キーで見回せます`}
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        drag.current = { x: event.clientX, y: event.clientY, view };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        setView({
          azimuth: start.view.azimuth - (event.clientX - start.x) * 0.25,
          elevation: Math.max(-85, Math.min(85, start.view.elevation + (event.clientY - start.y) * 0.25)),
        });
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !event.key.startsWith("Arrow")) return;
        event.preventDefault();
        const step = event.shiftKey ? 15 : 5;
        setView((current) => ({
          azimuth: current.azimuth + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
          elevation: Math.max(-85, Math.min(85, current.elevation + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0))),
        }));
      }}
    >
      <Canvas
        frameloop={running ? "always" : "demand"}
        dpr={1}
        camera={{ position: [0, 0, 0], fov: 62, near: 0.05, far: 10 }}
        gl={{ antialias: true, alpha: false }}
        fallback={<div className="p-4 text-xs text-slate-200">WebGLを利用できません。ブラウザの描画設定を確認してください。</div>}
      >
        <SkyShaderPreviewDome shader={shader} running={running} view={view} onError={reportError} />
      </Canvas>
      <div className="absolute bottom-2 right-2 flex gap-1">
        {animated && <button type="button" onClick={() => setPaused((value) => !value)} aria-pressed={!paused} className="rounded border border-white/25 bg-slate-950/75 px-2 py-1 text-[10px] text-white hover:bg-slate-800">{paused ? "再生" : "一時停止"}</button>}
        <button type="button" onClick={() => setView(authoredView(shader, preview))} className="rounded border border-white/25 bg-slate-950/75 px-2 py-1 text-[10px] text-white hover:bg-slate-800">視点を戻す</button>
      </div>
    </div>
  );
}

function SkyShaderPreviewDome({ shader, running, view, onError }: {
  shader: ClassicR3fMaterialShader; running: boolean; view: View; onError: (message: string) => void;
}) {
  const { camera, invalidate, gl } = useThree();
  const elapsed = useRef(6.5);
  const geometry = useMemo(() => new SphereGeometry(1, 48, 32), []);
  const programKey = `${shader.sourceModulePath}\n${shader.vertexShader}\n${shader.fragmentShader}\n${JSON.stringify(shader.variants)}`;
  const material = useMemo(() => {
    const next = createClassicR3fMaterial(shader, {}, "");
    next.side = BackSide;
    next.depthTest = false;
    next.depthWrite = false;
    next.needsUpdate = true;
    return next;
    // A slider must update uniforms, not dispose/recompile the program.
  }, [programKey]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    elapsed.current = 6.5;
    applyPreviewTime(material, elapsed.current);
    invalidate();
  }, [material, invalidate]);
  useEffect(() => {
    for (const [name, authored] of Object.entries(shader.uniforms)) {
      const uniform = material.uniforms[name];
      if (!uniform || name === shader.animatedTimeUniform) continue;
      if (authored.kind === "number") uniform.value = authored.value;
      else if (authored.kind === "color" && uniform.value instanceof Color) uniform.value.set(authored.value);
      else if (authored.kind === "vector" && (uniform.value instanceof Vector2 || uniform.value instanceof Vector3 || uniform.value instanceof Vector4)) uniform.value.fromArray(authored.value);
    }
    invalidate();
  }, [shader.uniforms, shader.animatedTimeUniform, material, invalidate]);
  useEffect(() => {
    const az = view.azimuth * Math.PI / 180;
    const el = view.elevation * Math.PI / 180;
    camera.lookAt(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    invalidate();
  }, [camera, invalidate, view.azimuth, view.elevation]);
  useEffect(() => {
    const previous = gl.debug.onShaderError;
    gl.debug.onShaderError = (context, program, vertex, fragment) => {
      const message = [context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)].filter(Boolean).join(" ").slice(0, 360);
      queueMicrotask(() => onError(message || "GLSLのコンパイルに失敗しました。MaterialのShaderを確認してください。"));
    };
    const lost = () => onError("WebGLの描画コンテキストを失いました。再試行してください。");
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      gl.debug.onShaderError = previous;
      gl.domElement.removeEventListener("webglcontextlost", lost);
    };
  }, [gl, onError]);

  useFrame((_state, delta) => {
    if (!running) return;
    elapsed.current += Math.min(delta, 0.1);
    applyPreviewTime(material, elapsed.current);
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

function applyPreviewTime(material: ShaderMaterial, elapsed: number): void {
  const specs = material.userData.xriftTimeUniforms as TimeUniformSpec[] | undefined;
  if (!Array.isArray(specs)) return;
  for (const spec of specs) {
    const uniform = material.uniforms[spec.name];
    if (uniform) applyTimeUniformValue(uniform as MutableUniformValue, spec, elapsed);
  }
}
