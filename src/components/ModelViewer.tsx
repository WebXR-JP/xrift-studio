import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, Environment, Bounds } from "@react-three/drei";
import { getBackend } from "../lib/backend";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { RefreshCw, Info } from "lucide-react";

type Format = "glb" | "gltf" | "vrm" | "fbx" | "obj" | "drc";

const DRACO_DECODER = "https://www.gstatic.com/draco/v1/decoders/";

let sharedDracoLoader: DRACOLoader | null = null;
function getDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(DRACO_DECODER);
  }
  return sharedDracoLoader;
}

type Props = {
  projectPath: string;
  rel: string;
};

function detectFormat(rel: string): Format | null {
  const l = rel.toLowerCase();
  if (l.endsWith(".glb")) return "glb";
  if (l.endsWith(".gltf")) return "gltf";
  if (l.endsWith(".vrm")) return "vrm";
  if (l.endsWith(".fbx")) return "fbx";
  if (l.endsWith(".obj")) return "obj";
  if (l.endsWith(".drc")) return "drc";
  return null;
}

function joinPath(base: string, rel: string): string {
  const sep = base.includes("\\") ? "\\" : "/";
  const relNative = rel.replace(/[\\/]/g, sep);
  return base.endsWith(sep) ? base + relNative : base + sep + relNative;
}

type Stats = {
  vertices: number;
  triangles: number;
  meshes: number;
  materials: number;
};

function statsOf(object: THREE.Object3D): Stats {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  const materialSet = new Set<THREE.Material>();
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      meshes += 1;
      const geo = mesh.geometry;
      if (geo) {
        const pos = geo.getAttribute("position");
        if (pos) vertices += pos.count;
        if (geo.index) triangles += geo.index.count / 3;
        else if (pos) triangles += pos.count / 3;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m && materialSet.add(m));
    }
  });
  return {
    vertices,
    triangles: Math.round(triangles),
    meshes,
    materials: materialSet.size,
  };
}

function useModel(url: string, format: Format) {
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadCounter, setReloadCounter] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setObject(null);
    setVrm(null);
    (async () => {
      try {
        let obj: THREE.Object3D;
        let vrmInstance: VRM | null = null;
        if (format === "glb" || format === "gltf" || format === "vrm") {
          const loader = new GLTFLoader();
          // Some GLBs include Draco-compressed meshes (KHR_draco_mesh_compression).
          loader.setDRACOLoader(getDracoLoader());
          if (format === "vrm") {
            loader.register((parser) => new VRMLoaderPlugin(parser));
          }
          const gltf = await loader.loadAsync(url);
          if (format === "vrm") {
            const v = gltf.userData.vrm as VRM | undefined;
            if (v) {
              VRMUtils.rotateVRM0(v);
              vrmInstance = v;
              obj = v.scene;
            } else {
              obj = gltf.scene;
            }
          } else {
            obj = gltf.scene;
          }
        } else if (format === "fbx") {
          const loader = new FBXLoader();
          obj = await loader.loadAsync(url);
        } else if (format === "obj") {
          const loader = new OBJLoader();
          obj = await loader.loadAsync(url);
        } else if (format === "drc") {
          const loader = getDracoLoader();
          const geometry = await loader.loadAsync(url);
          if (!geometry.attributes.normal) {
            geometry.computeVertexNormals();
          }
          const material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.1,
            roughness: 0.7,
            flatShading: !geometry.attributes.normal,
          });
          obj = new THREE.Mesh(geometry, material);
        } else {
          throw new Error("unsupported format");
        }
        if (!cancelled) {
          setObject(obj);
          setVrm(vrmInstance);
        }
      } catch (e) {
        if (!cancelled) setError(`${e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, format, reloadCounter]);

  const reload = () => setReloadCounter((c) => c + 1);
  return { object, vrm, error, loading, reload };
}

function Model({ object }: { object: THREE.Object3D }) {
  const ref = useRef<THREE.Group>(null);
  return (
    <group ref={ref}>
      <primitive object={object} />
    </group>
  );
}

export function ModelViewer({ projectPath, rel }: Props) {
  const backend = getBackend();
  const format = useMemo(() => detectFormat(rel), [rel]);
  const fullPath = useMemo(() => joinPath(projectPath, rel), [projectPath, rel]);
  const url = useMemo(() => backend.convertFileSrc(fullPath), [backend, fullPath]);
  const { object, vrm, error, loading, reload } = useModel(url, format ?? "glb");

  const stats = useMemo(() => (object ? statsOf(object) : null), [object]);

  if (!format) {
    return (
      <div className="flex flex-1 items-center justify-center bg-white text-sm text-zinc-400">
        未対応の 3D フォーマット
      </div>
    );
  }

  return (
    <section className="flex flex-1 min-h-0 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700">
            {format}
          </span>
          <span className="text-xs font-medium text-zinc-700">{rel}</span>
          {loading && <span className="text-[10px] text-zinc-400">読み込み中…</span>}
          {vrm && (
            <span className="rounded-md bg-pink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-pink-700">
              VRM {vrm.meta?.metaVersion ?? ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <span className="flex items-center gap-2 text-[11px] text-zinc-500">
              <Info size={10} strokeWidth={2} />
              {stats.meshes} meshes · {stats.vertices.toLocaleString()} verts · {stats.triangles.toLocaleString()} tris · {stats.materials} mats
            </span>
          )}
          <button
            type="button"
            onClick={reload}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            title="再読み込み"
          >
            <RefreshCw size={12} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-gradient-to-b from-zinc-100 to-zinc-200">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <div className="font-medium">3D モデルを読み込めませんでした</div>
              <div className="mt-1 font-mono text-[11px]">{error}</div>
            </div>
          </div>
        )}
        {object && (
          <>
            <Canvas
              shadows
              dpr={[1, 2]}
              camera={{ position: [2.5, 2, 4], fov: 45 }}
              style={{ width: "100%", height: "100%" }}
            >
              <color attach="background" args={[0xf4f4f5]} />
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.2}>
                  <Stage intensity={0.6} environment="city" shadows={false}>
                    <Model object={object} />
                  </Stage>
                </Bounds>
                <Environment preset="city" />
              </Suspense>
              <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
            </Canvas>
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-white/70 px-2 py-1 text-[10px] text-zinc-600 backdrop-blur">
              ドラッグで回転 / ホイールでズーム / 右ドラッグで移動
            </div>
          </>
        )}
      </div>
    </section>
  );
}
