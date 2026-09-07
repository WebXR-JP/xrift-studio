import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClassicR3fMaterialShader } from "../../lib/visual-editor/custom-shader-contract";
import { validateClassicR3fMaterialShader } from "../../lib/visual-editor/custom-shader-contract";
import type { ResolvedWind } from "../../lib/visual-editor/wind-contract";
import {
  WATER_PREVIEW_CAMERA, WATER_PREVIEW_TARGET, WATER_PREVIEW_TIME,
  applyWaterPreviewTime, createWaterPreviewObjects, requestWaterThumbnail,
  retainWaterThumbnailRenderer, waterPreviewBackground,
} from "./water-preview-renderer";

/** Real GLSL, one shared snapshot context for cards and one live detail Canvas. */
export function WaterShaderCatalogPreview({ shader, wind, className = "h-full w-full", animated = false, paused = false }: {
  shader: ClassicR3fMaterialShader;
  wind: ResolvedWind;
  className?: string;
  animated?: boolean;
  paused?: boolean;
}) {
  const diagnostics = useMemo(() => validateClassicR3fMaterialShader(shader), [shader]);
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setDocumentVisible(!document.hidden); setReducedMotion(media.matches); };
    update();
    document.addEventListener("visibilitychange", update);
    media.addEventListener("change", update);
    return () => { document.removeEventListener("visibilitychange", update); media.removeEventListener("change", update); };
  }, []);
  useEffect(() => animated ? undefined : retainWaterThumbnailRenderer(), [animated]);
  useEffect(() => {
    if (animated || !visible || diagnostics.length > 0) return;
    let active = true;
    setError(null); setImage(null);
    void requestWaterThumbnail(shader, wind).then(
      (url) => { if (active) setImage(url); },
      (reason) => { if (active) setError(reason instanceof Error ? reason.message : "WebGLを確認してください"); },
    );
    return () => { active = false; };
  }, [animated, visible, shader, wind, diagnostics.length, retry]);

  useEffect(() => { if (animated) setError(null); }, [animated, shader]);

  const problem = diagnostics[0] ?? error;
  const running = visible && documentVisible && !paused && !reducedMotion;
  return (
    <div ref={host} className={`relative overflow-hidden bg-slate-100 ${className}`}
      data-water-shader-preview={shader.sourceModulePath}>
      {problem ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-slate-600" role="status">
          <span className="text-[11px] font-semibold">Water Shaderを表示できません</span>
          <span className="line-clamp-2 text-[10px]">{problem}</span>
          {!diagnostics.length && animated ? <span className="text-[10px]">別のプリセットを選び直してください。</span> : null}
          {!diagnostics.length && !animated ? <span className="text-[10px]">カードを選ぶと詳細で確認できます。</span> : null}
        </div>
      ) : animated ? (
        <Canvas frameloop={running ? "always" : "demand"} dpr={1}
          camera={{ ...WATER_PREVIEW_CAMERA, near: 0.1, far: 500 }} gl={{ antialias: true, alpha: false }}
          onCreated={({ camera, gl }) => {
            camera.lookAt(...WATER_PREVIEW_TARGET);
            gl.debug.onShaderError = (_context, _program, vertex, fragment) => {
              const context = gl.getContext();
              setError(context.getShaderInfoLog(vertex) || context.getShaderInfoLog(fragment) || "GLSLのコンパイルに失敗しました");
            };
          }} fallback={<span className="text-xs text-slate-600">WebGL対応ブラウザで確認してください。</span>}>
          <color attach="background" args={[waterPreviewBackground(shader)]} />
          <WaterPreviewSurface shader={shader} wind={wind} running={running} />
        </Canvas>
      ) : image ? (
        <img src={image} alt="水面シェーダーの実描画プレビュー" className="h-full w-full object-cover" draggable={false}
          onError={() => { setImage(null); if (retry < 1) setRetry(retry+1); else setError("画像を再表示できませんでした"); }} />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-slate-500" role="status">
          {visible ? "水面を描画中…" : "プレビュー"}
        </div>
      )}
    </div>
  );
}

function WaterPreviewSurface({ shader, wind, running }: {
  shader: ClassicR3fMaterialShader; wind: ResolvedWind; running: boolean;
}) {
  const objects = useMemo(() => createWaterPreviewObjects(shader, wind), [shader, wind]);
  const elapsed = useRef(WATER_PREVIEW_TIME);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => { applyWaterPreviewTime(objects.material, elapsed.current); invalidate(); }, [objects, invalidate]);
  useEffect(() => () => objects.dispose(), [objects]);
  useFrame((_state, delta) => {
    // Pauses do not jump on resume, and hidden tabs do not accumulate a huge delta.
    if (running) elapsed.current += Math.min(delta, 0.1);
    applyWaterPreviewTime(objects.material, elapsed.current);
  });
  return <primitive object={objects.scene} />;
}
