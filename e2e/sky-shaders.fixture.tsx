import { createRoot } from "react-dom/client";
import { ACESFilmicToneMapping, BackSide, Mesh, PerspectiveCamera, Scene, SphereGeometry, SRGBColorSpace, WebGLRenderer } from "three";
import { SkyShaderStore } from "../src/components/visual-editor/SkyShaderStore";
import { createClassicR3fMaterial } from "../src/components/visual-editor/ProjectModelVisual";
import { SKY_SHADER_CATALOG, SKY_SHADER_CATALOG_REVISION } from "../src/lib/visual-editor/sky-shader-catalog";
import { SKY_SHADER_QUALITY_OPTIONS, withSkyShaderQuality } from "../src/lib/visual-editor/sky-shader-quality";

let settle: ((fail: boolean) => void) | undefined;
export let installedDefines: Record<string, string | number | boolean> = {};
export function finishInstall(fail: boolean) { settle?.(fail); }
export function mountSkyStore() {
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;display:flex;background:white";
  document.body.append(host);
  createRoot(host).render(<SkyShaderStore onAdd={(entry, _values, applyToSky) => {
    installedDefines = entry.shader.variants[0].defines;
    return new Promise((resolve, reject) => {
      settle = fail => fail ? reject(new Error("Test install failed")) : resolve({ alreadyInstalled: false, appliedToSky: applyToSky });
    });
  }} />);
}

export async function renderSkyCatalog(capture: boolean) {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setPixelRatio(1);
  const geometry = new SphereGeometry(1, 48, 32);
  const camera = new PerspectiveCamera(62, 1.6, 0.05, 10);
  let failure: string | undefined;
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    failure = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].join("\n");
  };
  let count = 0;
  const images: { id: string; data: string; shaderHash: string }[] = [];
  try {
    for (const entry of SKY_SHADER_CATALOG) {
      const u = entry.shader.uniforms;
      const azimuth = entry.preview?.azimuth ?? (u.uMoonStrength?.kind === "number" && u.uMoonStrength.value > 0 && u.uMoonAzimuth?.kind === "number" ? u.uMoonAzimuth.value : u.uSunAzimuth?.kind === "number" ? u.uSunAzimuth.value : -110);
      const elevation = entry.preview?.elevation ?? 20;
      const az = azimuth * Math.PI / 180, el = elevation * Math.PI / 180;
      camera.lookAt(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
      for (const option of SKY_SHADER_QUALITY_OPTIONS) {
        renderer.setSize(capture && option.id === "balanced" ? 640 : 160, capture && option.id === "balanced" ? 400 : 100, false);
        const material = createClassicR3fMaterial(withSkyShaderQuality(entry.shader, option.id), {}, "");
        material.side = BackSide; material.depthTest = false; material.depthWrite = false;
        if (material.uniforms.uTime) material.uniforms.uTime.value = 6.5;
        const scene = new Scene();
        scene.add(new Mesh(geometry, material));
        try {
          renderer.render(scene, camera);
          if (failure) throw new Error(`${entry.id}/${option.id}: ${failure}`);
          const gl = renderer.getContext();
          const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          if (!pixels.some((value, index) => index % 4 !== 3 && value > 0)) throw new Error(`${entry.id}/${option.id}: black output`);
          if (capture && option.id === "balanced") {
            const data = renderer.domElement.toDataURL("image/webp", 0.88);
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(entry.shader)));
            const shaderHash = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, "0")).join("");
            images.push({ id: entry.id, data, shaderHash });
          }
          count++;
        } finally { material.dispose(); renderer.renderLists.dispose(); }
      }
    }
  } finally { geometry.dispose(); renderer.dispose(); renderer.forceContextLoss(); }
  return { count, images, revision: SKY_SHADER_CATALOG_REVISION };
}
