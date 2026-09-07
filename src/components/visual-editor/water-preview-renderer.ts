import {
  ACESFilmicToneMapping, Color, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, SRGBColorSpace, Vector2, WebGLRenderer,
  type ShaderMaterial,
} from "three";
import type { ClassicR3fMaterialShader } from "../../lib/visual-editor/custom-shader-contract";
import { windDrivenUniforms, type ResolvedWind } from "../../lib/visual-editor/wind-contract";
import { createClassicR3fMaterial } from "./ProjectModelVisual";

export const WATER_PREVIEW_CAMERA = { position: [8, 5.6, 12] as [number, number, number], fov: 44 };
export const WATER_PREVIEW_TARGET = [0, 0, -10] as const;
export const WATER_PREVIEW_TIME = 12.5;

export function waterPreviewBackground(shader: ClassicR3fMaterialShader): string {
  const color = shader.uniforms.uHorizonColor;
  return color?.kind === "color" ? color.value : "#a7bdcb";
}

/** Shared by the live inspector and the one-context thumbnail renderer. */
export function createWaterPreviewObjects(shader: ClassicR3fMaterialShader, wind: ResolvedWind) {
  const displacement = shader.uniforms.uWaveDisplacement;
  const segments = displacement?.kind === "number" && displacement.value > 0 ? 128 : 1;
  const geometry = new PlaneGeometry(120, 120, segments, segments);
  const material = createClassicR3fMaterial(shader, {}, "water-preview");
  for (const entry of windDrivenUniforms(shader, wind)) {
    const uniform = material.uniforms[entry.name];
    if (uniform) uniform.value = entry.kind === "number" ? entry.value : new Vector2(...entry.value);
  }
  applyWaterPreviewTime(material, WATER_PREVIEW_TIME);
  const surface = new Mesh(geometry, material);
  surface.rotation.x = -Math.PI / 2;
  surface.frustumCulled = false;
  const scene = new Scene();
  scene.background = new Color(waterPreviewBackground(shader));
  scene.add(surface);
  // Neutral sample bed makes opacity and an authored shoreline visible. Not part
  // of the installed material, and not a promise of scene-depth refraction.
  const bedGeometry = new PlaneGeometry(120, 120);
  const bedMaterial = new MeshBasicMaterial({ color: "#7b817a" });
  const bed = new Mesh(bedGeometry, bedMaterial);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -0.8;
  scene.add(bed);
  return {
    scene, material,
    dispose() { geometry.dispose(); material.dispose(); bedGeometry.dispose(); bedMaterial.dispose(); },
  };
}

export function applyWaterPreviewTime(material: ShaderMaterial, elapsed: number): void {
  const uniform = material.uniforms.uTime;
  if (uniform) uniform.value = elapsed;
}

// Static cards must NOT each mount an R3F Canvas. Browsers limit live WebGL
// contexts. 21 cards + an inspector used to evict the editor's own context.
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let renderer: WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();
let consumers = 0;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

export function retainWaterThumbnailRenderer(): () => void {
  consumers++;
  if (releaseTimer !== undefined) clearTimeout(releaseTimer);
  return () => {
    consumers = Math.max(0, consumers-1);
    if (!consumers) releaseTimer = setTimeout(() => {
      if (!consumers && renderer) {
        renderer.dispose(); renderer.forceContextLoss(); renderer = null;
      }
    }, 500);
  };
}

export function requestWaterThumbnail(shader: ClassicR3fMaterialShader, wind: ResolvedWind): Promise<string> {
  const key = JSON.stringify([shader, wind]);
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return Promise.resolve(cached); }
  const existing = pending.get(key);
  if (existing) return existing;
  const task = queue.catch(() => undefined).then(async () => {
    // One card per paint lets search and selection remain responsive.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!consumers) throw new Error("プレビューは閉じられました");
    if (!renderer) {
      renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
      renderer.setPixelRatio(1);
      renderer.setSize(384, 216, false);
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
    }
    const objects = createWaterPreviewObjects(shader, wind);
    const camera = new PerspectiveCamera(WATER_PREVIEW_CAMERA.fov, 16/9, 0.1, 500);
    camera.position.set(...WATER_PREVIEW_CAMERA.position);
    camera.lookAt(...WATER_PREVIEW_TARGET);
    let shaderError: string | undefined;
    renderer.debug.onShaderError = (gl, program) => {
      shaderError = gl.getProgramInfoLog(program) || "GLSLのコンパイルに失敗しました";
    };
    try {
      renderer.render(objects.scene, camera);
      if (shaderError) throw new Error(shaderError);
      if (renderer.getContext().isContextLost()) throw new Error("WebGLコンテキストが失われました");
      const url = renderer.domElement.toDataURL("image/webp", 0.86);
      cache.set(key, url);
      while (cache.size > 64) cache.delete(cache.keys().next().value!);
      return url;
    } finally {
      objects.dispose();
      // The renderer persists, not its per-card render-list references.
      renderer.renderLists.dispose();
    }
  });
  pending.set(key, task);
  void task.then(() => pending.delete(key), () => pending.delete(key));
  queue = task;
  return task;
}
