import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { Color, type MeshBasicMaterial } from "three";
import { ScenePostprocessing, type XriftScenePostprocessingSettings } from "../packages/xrift-studio-runtime/src/scene/postprocessing";
import { SceneScreenshotCapture, type SceneScreenshotRequest } from "../src/components/visual-editor/SceneScreenshotCapture";
import { createEditorCanvasEvents } from "../src/lib/visual-editor/canvas-events";
import { createDefaultMaterialAsset, createTextureAsset, type AssetManifest } from "../src/lib/visual-editor/asset-manifest";
import { useMaterialPreviewRenderSync, useMaterialPreviewTextures } from "../src/components/visual-editor/material-texture-preview";
import { tauri } from "../src/lib/tauri";

type Mode = "plain" | "bloom" | "grading";
type Capture = { ok: true; dataUrl: string } | { ok: false; message: string };
const settings = (mode: Mode): XriftScenePostprocessingSettings => ({ enabled: mode !== "plain", exposure: 1,
  hdr: { enabled: true, toneMapping: "none" },
  bloom: { enabled: mode === "bloom", threshold: 0.1, strength: 2.5, radius: 0.5 },
  ao: { enabled: true, radius: 8, minDistance: 0.005, maxDistance: 0.1 },
  grading: { enabled: mode === "grading", contrast: 1, saturation: 0, temperature: 0, tint: 0 } });

let changeMode: (mode: Mode) => void;
let changeTexture: (id: number) => void;
let request: (value: SceneScreenshotRequest) => void;
let close: (() => void) | undefined;
let captureId = 0;
let captures = 0;
const reads = new Map<number, { resolve: (value: string) => void; reject: (error: Error) => void }>();

function Subject({ textureId }: { textureId: number }) {
  const assets = useMemo<AssetManifest>(() => {
    const texture = createTextureAsset({ id: `review-texture-${textureId}`, name: "Review Texture", source: { kind: "project", relativePath: `review-${textureId}.png` }, importSettings: {} })!;
    texture.sourceHash = String(textureId).padStart(64, "0");
    return { schemaVersion: "0.1.0", assets: textureId ? { [texture.id]: texture } : {} };
  }, [textureId]);
  const material = useMemo(() => createDefaultMaterialAsset({ id: "review-material", name: "Review Material",
    properties: { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], ...(textureId ? { baseColorTexture: { textureAssetId: `review-texture-${textureId}`, texCoord: 0 } } : {}) } } })!, [textureId]);
  const textures = useMaterialPreviewTextures(material, assets, "C:/isolated-review-rendering");
  const materialRef = useRef<MeshBasicMaterial>(null);
  useMaterialPreviewRenderSync(materialRef, textures);
  return <group userData={{ authoringEntityId: "subject", renderedEntityId: "subject", xriftModelSourceHash: "fixture", xriftModelLoadState: "ready" }}>
    <mesh><boxGeometry args={[1, 1, 1]} /><meshBasicMaterial ref={materialRef} color={textureId ? "#ffffff" : new Color(4, 0.03, 0.03)} map={textures.baseColorMap} /></mesh>
  </group>;
}

function Content() {
  const [mode, setMode] = useState<Mode>("plain");
  const [textureId, setTextureId] = useState(0);
  const [capture, setCapture] = useState<SceneScreenshotRequest | null>(null);
  const invalidate = useThree(state => state.invalidate);
  changeMode = setMode; changeTexture = setTextureId; request = setCapture;
  useEffect(() => { invalidate(); }, [capture, invalidate, mode, textureId]);
  return <><color attach="background" args={["#000000"]} /><Subject textureId={textureId} />
    <ScenePostprocessing settings={settings(mode)} /><SceneScreenshotCapture request={capture} onComplete={() => setCapture(null)} /></>;
}

export async function mountReviewFixture() {
  captures = 0; captureId = 0; reads.clear();
  const previousRead = tauri.readImageDataUrl;
  tauri.readImageDataUrl = async (_root, path) => {
    const id = Number(/review-(\d+)\.png/u.exec(path)?.[1]);
    if (!id) return previousRead(_root, path);
    return new Promise<string>((resolve, reject) => reads.set(id, { resolve, reject }));
  };
  const host = document.createElement("div"); host.style.cssText = "width:512px;height:512px"; document.body.append(host);
  const root = createRoot(host);
  root.render(<Canvas events={createEditorCanvasEvents} frameloop="demand" dpr={1} camera={{ position: [0, 0, 4], near: 0.1, far: 100 }}><Content /></Canvas>);
  close = () => { root.unmount(); host.remove(); tauri.readImageDataUrl = previousRead; };
  while (!request) await new Promise(resolve => setTimeout(resolve, 20));
}

export async function captureReview(mode: Mode = "plain"): Promise<Capture> {
  changeMode(mode);
  return new Promise(resolve => request({ id: ++captureId,
    modelView: { entityId: "subject", sourceHash: "fixture", direction: [1, 0.65, 1] },
    onCapture: dataUrl => { captures++; resolve({ ok: true, dataUrl }); }, onError: message => resolve({ ok: false, message }) }));
}
export function setReviewTexture(id: number) { changeTexture(id); }
export function pendingReviewReads() { return [...reads.keys()]; }
export function capturedReviewCount() { return captures; }
export function releaseReviewTexture(id: number, fail = false) {
  const read = reads.get(id); if (!read) throw new Error(`Texture ${id} has not started`); reads.delete(id);
  if (fail) { read.reject(new Error("isolated Texture fixture failure")); return; }
  const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
  const context = canvas.getContext("2d")!; context.fillStyle = "#00ff00"; context.fillRect(0, 0, 8, 8);
  read.resolve(canvas.toDataURL("image/png"));
}
export async function frameMetrics(dataUrl: string) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d")!; context.drawImage(bitmap, 0, 0); bitmap.close();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let lit = 0, chroma = 0, green = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
    if (Math.max(r, g, b) > 10) lit++;
    chroma += Math.max(r, g, b) - Math.min(r, g, b);
    if (g > r + 30 && g > b + 30) green++;
  }
  return { lit, chroma, green };
}
export function unmountReviewFixture() { close?.(); close = undefined; }
