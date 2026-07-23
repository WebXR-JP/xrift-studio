import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box3,
  Group,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  OPEN_BRUSH_CATALOG_GALLERY_URL,
  prepareOpenBrushGltfSource,
  type OpenBrushCatalogEntry,
} from "../../lib/visual-editor";
import { loadOpenBrushPreviewMaterial } from "../../lib/visual-editor/open-brush-preview-loader";
import { WebGlThumbnailCapture } from "./WebGlThumbnailCapture";

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

let galleryScenePromise: Promise<Group> | null = null;

export function OpenBrushCatalogPreview({
  entry,
  className = "h-full w-full",
  compact = false,
  captureKey,
  onCapture,
  onCaptureError,
}: {
  entry: OpenBrushCatalogEntry;
  className?: string;
  compact?: boolean;
  captureKey?: string;
  onCapture?: (dataUrl: string) => void;
  onCaptureError?: (message: string) => void;
}) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const handleLoadState = useCallback(
    (state: LoadState) => {
      setLoadState(state);
      if (state.status === "error") onCaptureError?.(state.message);
    },
    [onCaptureError],
  );

  return (
    <div
      className={`relative overflow-hidden bg-slate-950 ${className}`}
      data-open-brush-catalog-preview={entry.brushGuid}
    >
      <Canvas
        frameloop={compact ? "demand" : "always"}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.15, 2.7], fov: 34 }}
        gl={{
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: Boolean(onCapture),
          powerPreference: "high-performance",
        }}
      >
        <color attach="background" args={["#0f172a"]} />
        <ambientLight intensity={1.25} />
        <directionalLight position={[2.5, 3, 4]} intensity={2.8} />
        <directionalLight
          position={[-2, -1, 1]}
          intensity={0.8}
          color="#c4b5fd"
        />
        <OpenBrushStroke
          entry={entry}
          animated={!compact}
          onLoadState={handleLoadState}
        />
        {captureKey && onCapture ? (
          <WebGlThumbnailCapture
            captureKey={captureKey}
            ready={loadState.status === "ready"}
            onCapture={onCapture}
            onError={onCaptureError}
          />
        ) : null}
        {!compact ? (
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            enablePan={false}
            minDistance={1.4}
            maxDistance={5}
          />
        ) : null}
      </Canvas>
      {!compact ? (
        <>
          <span
            className={`pointer-events-none absolute left-2 top-2 rounded border px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur ${
              loadState.status === "ready"
                ? "border-emerald-300/50 bg-emerald-950/75 text-emerald-100"
                : loadState.status === "error"
                  ? "border-rose-300/50 bg-rose-950/80 text-rose-100"
                  : "border-white/20 bg-slate-950/70 text-slate-200"
            }`}
          >
            {loadState.status === "ready"
              ? "three-icosa 実ストローク"
              : loadState.status === "error"
                ? "shader読込失敗"
                : "ブラシを再構築中"}
          </span>
          <span className="pointer-events-none absolute inset-x-2 bottom-1.5 text-center text-[9px] text-slate-300/80">
            ドラッグで回転 · ホイールでズーム
          </span>
        </>
      ) : null}
      {!compact && loadState.status === "error" ? (
        <div className="absolute inset-x-2 bottom-7 rounded border border-rose-300/40 bg-rose-950/90 p-2 text-[10px] leading-4 text-rose-100 backdrop-blur">
          {loadState.message}
        </div>
      ) : null}
    </div>
  );
}

function OpenBrushStroke({
  entry,
  animated,
  onLoadState,
}: {
  entry: OpenBrushCatalogEntry;
  animated: boolean;
  onLoadState: (state: LoadState) => void;
}) {
  const [preview, setPreview] = useState<Group | null>(null);
  const previewRef = useRef<Group | null>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    let active = true;
    let ownedMaterials: Material[] = [];
    setPreview(null);
    previewRef.current = null;
    onLoadState({ status: "loading" });
    void Promise.all([
      loadOpenBrushGalleryScene(),
      loadOpenBrushPreviewMaterial(
        entry.brushName,
        entry.shader.brushBaseUrl,
      ),
    ])
      .then(([gallery, sourceMaterial]) => {
        if (!active) return;
        const sourceNode = gallery.getObjectByName(entry.sourceNodeName);
        if (!sourceNode) {
          throw new Error(`${entry.label}の代表ストロークが見つかりません`);
        }
        const stroke = sourceNode.clone(true);
        const material = sourceMaterial.clone();
        ownedMaterials = [material];
        stroke.traverse((object) => {
          if (object instanceof Mesh) object.material = material;
        });
        const fitted = fitStroke(stroke);
        previewRef.current = fitted;
        setPreview(fitted);
        onLoadState({ status: "ready" });
        invalidate();
      })
      .catch((error: unknown) => {
        if (!active) return;
        onLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      active = false;
      previewRef.current = null;
      ownedMaterials.forEach((material) => material.dispose());
    };
  }, [entry, invalidate, onLoadState]);

  useFrame((_, delta) => {
    if (animated && previewRef.current) {
      previewRef.current.rotation.y += Math.min(delta, 0.05) * 0.22;
    }
  });

  return preview ? <primitive object={preview} dispose={null} /> : null;
}

async function loadOpenBrushGalleryScene(): Promise<Group> {
  if (galleryScenePromise) return galleryScenePromise;
  galleryScenePromise = fetch(OPEN_BRUSH_CATALOG_GALLERY_URL, {
    cache: "force-cache",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Open Brush galleryを読み込めませんでした (${response.status})`);
      }
      const source = prepareOpenBrushGltfSource(
        new Uint8Array(await response.arrayBuffer()),
        "glb",
      );
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(source, window.location.href);
      return gltf.scene;
    })
    .catch((error: unknown) => {
      galleryScenePromise = null;
      throw error;
    });
  return galleryScenePromise;
}

function fitStroke(source: Object3D): Group {
  const centered = new Group();
  centered.add(source);
  source.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(source);
  if (bounds.isEmpty()) throw new Error("Open Brush strokeに描画可能な形状がありません");
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  centered.position.copy(center).multiplyScalar(-1);
  const fitted = new Group();
  fitted.add(centered);
  fitted.scale.setScalar(1.65 / Math.max(size.x, size.y, size.z, 0.001));
  fitted.position.y = -0.05;
  return fitted;
}
