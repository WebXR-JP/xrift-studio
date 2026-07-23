import {
  BufferGeometryLoader,
  Group,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  ObjectLoader,
  Points,
  PointsMaterial,
  type AnimationClip,
  type BufferGeometry,
  type Object3D,
} from "three";
import rhino3dmJsUrl from "rhino3dm/rhino3dm.js?url";
import rhino3dmWasmUrl from "rhino3dm/rhino3dm.wasm?url";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import { TIFFLoader } from "three/examples/jsm/loaders/TIFFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import dracoWasmUrl from "three/examples/jsm/libs/draco/draco_decoder.wasm?url";
import dracoWasmWrapperUrl from "three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url";
import type { ThreeEditorModelFormat } from "./asset-format-registry";
import { convertDracoGeometryToGlb } from "./draco-import";

export type ThreeModelCompanionFile = {
  /** Path relative to the selected model or its Classic project root. */
  relativePath: string;
  bytes: Uint8Array;
  mimeType?: string;
};

export type ConvertThreeModelInput = {
  fileName: string;
  bytes: Uint8Array;
  format: Exclude<ThreeEditorModelFormat, "glb" | "vrm">;
  companionFiles?: readonly ThreeModelCompanionFile[];
};

/**
 * Uses the same model loaders exposed by the Three.js r185 Editor, then stores
 * the result as a self-contained GLB so preview, authoring and publish all use
 * XRift Studio's single, tested model runtime.
 */
export async function convertThreeEditorModelToGlb(
  input: ConvertThreeModelInput,
): Promise<Uint8Array> {
  if (input.format === "drc") return convertDracoGeometryToGlb(input.bytes);

  const resources = createResourceResolver(input.companionFiles ?? []);
  try {
    const object = await parseThreeEditorModel(
      input.bytes,
      input.format,
      resources.manager,
      input.companionFiles ?? [],
    );
    object.name ||= input.fileName;
    normalizeRenderableGeometry(object);
    if (!containsRenderableObject(object)) {
      throw new Error("表示できるMesh、LineまたはPointが見つかりません");
    }

    const { GLTFExporter } = await import(
      "three/examples/jsm/exporters/GLTFExporter.js"
    );
    const animations = collectAnimations(object);
    const exported = await new GLTFExporter().parseAsync(object, {
      binary: true,
      onlyVisible: false,
      animations,
    });
    if (!(exported instanceof ArrayBuffer)) {
      throw new Error("Three GLTFExporterがGLBを返しませんでした");
    }
    return new Uint8Array(exported);
  } finally {
    resources.dispose();
  }
}

async function parseThreeEditorModel(
  bytes: Uint8Array,
  format: ConvertThreeModelInput["format"],
  manager: LoadingManager,
  companionFiles: readonly ThreeModelCompanionFile[],
): Promise<Object3D> {
  const buffer = ownedArrayBuffer(bytes);
  const text = () => new TextDecoder().decode(bytes);

  switch (format) {
    case "3dm": {
      const { Rhino3dmLoader } = await import(
        "three/examples/jsm/loaders/3DMLoader.js"
      );
      const loader = new Rhino3dmLoader(manager);
      loader.setLibraryPath("");
      return new Promise((resolve, reject) =>
        loader.parse(buffer, resolve, reject),
      );
    }
    case "3ds": {
      const { TDSLoader } = await import(
        "three/examples/jsm/loaders/TDSLoader.js"
      );
      return new TDSLoader(manager).parse(buffer, "");
    }
    case "3mf": {
      const { ThreeMFLoader } = await import(
        "three/examples/jsm/loaders/3MFLoader.js"
      );
      return new ThreeMFLoader(manager).parse(buffer);
    }
    case "amf": {
      const { AMFLoader } = await import(
        "three/examples/jsm/loaders/AMFLoader.js"
      );
      return new AMFLoader(manager).parse(buffer);
    }
    case "dae": {
      const { ColladaLoader } = await import(
        "three/examples/jsm/loaders/ColladaLoader.js"
      );
      const result = new ColladaLoader(manager).parse(text(), "");
      if (!result) throw new Error("COLLADA sceneを解析できませんでした");
      return result.scene;
    }
    case "fbx": {
      const { FBXLoader } = await import(
        "three/examples/jsm/loaders/FBXLoader.js"
      );
      return new FBXLoader(manager).parse(buffer, "");
    }
    case "gltf": {
      const { GLTFLoader } = await import(
        "three/examples/jsm/loaders/GLTFLoader.js"
      );
      const { DRACOLoader } = await import(
        "three/examples/jsm/loaders/DRACOLoader.js"
      );
      const { MeshoptDecoder } = await import(
        "three/examples/jsm/libs/meshopt_decoder.module.js"
      );
      const dracoLoader = new DRACOLoader(manager);
      dracoLoader.setDecoderPath({
        js: dracoWasmWrapperUrl,
        wasm: dracoWasmUrl,
      });
      const loader = new GLTFLoader(manager)
        .setDRACOLoader(dracoLoader)
        .setMeshoptDecoder(MeshoptDecoder);
      try {
        const gltf = await new Promise<GLTF>((resolve, reject) =>
          loader.parse(text(), "", resolve, reject),
        );
        attachAnimations(gltf.scene, gltf.animations);
        return gltf.scene;
      } finally {
        dracoLoader.dispose();
      }
    }
    case "json": {
      const json = JSON.parse(text()) as {
        metadata?: { type?: string };
        [key: string]: unknown;
      };
      const type = json.metadata?.type?.toLowerCase();
      if (type === "buffergeometry") {
        return new Mesh(
          new BufferGeometryLoader().parse(json),
          new MeshStandardMaterial(),
        );
      }
      if (type === "object") {
        return new ObjectLoader(manager).parseAsync(json);
      }
      throw new Error(
        "Three.js JSONはmetadata.typeがObjectまたはBufferGeometryである必要があります",
      );
    }
    case "kmz": {
      const { KMZLoader } = await import(
        "three/examples/jsm/loaders/KMZLoader.js"
      );
      const result = new KMZLoader(manager).parse(buffer);
      return result.scene;
    }
    case "ldr":
    case "mpd": {
      const { LDrawLoader } = await import(
        "three/examples/jsm/loaders/LDrawLoader.js"
      );
      const loader = new LDrawLoader(manager);
      loader.setPath("");
      return new Promise((resolve, reject) =>
        loader.parse(text(), resolve, reject),
      );
    }
    case "md2": {
      const { MD2Loader } = await import(
        "three/examples/jsm/loaders/MD2Loader.js"
      );
      const geometry = new MD2Loader().parse(buffer);
      const mesh = new Mesh(geometry, new MeshStandardMaterial());
      attachAnimations(
        mesh,
        (geometry as BufferGeometry & { animations?: AnimationClip[] }).animations,
      );
      return mesh;
    }
    case "obj": {
      const { OBJLoader } = await import(
        "three/examples/jsm/loaders/OBJLoader.js"
      );
      const loader = new OBJLoader(manager);
      const materialLibrary = /^\s*mtllib\s+(.+?)\s*$/im
        .exec(text())?.[1]
        ?.trim();
      if (materialLibrary) {
        const materialFile = findCompanionFile(
          companionFiles,
          materialLibrary,
        );
        if (materialFile) {
          const { MTLLoader } = await import(
            "three/examples/jsm/loaders/MTLLoader.js"
          );
          const materials = new MTLLoader(manager).parse(
            new TextDecoder().decode(materialFile.bytes),
            "",
          );
          materials.preload();
          loader.setMaterials(materials);
        }
      }
      return loader.parse(text());
    }
    case "pcd": {
      const { PCDLoader } = await import(
        "three/examples/jsm/loaders/PCDLoader.js"
      );
      return new PCDLoader(manager).parse(buffer);
    }
    case "ply": {
      const { PLYLoader } = await import(
        "three/examples/jsm/loaders/PLYLoader.js"
      );
      return objectForGeometry(new PLYLoader(manager).parse(buffer));
    }
    case "stl": {
      const { STLLoader } = await import(
        "three/examples/jsm/loaders/STLLoader.js"
      );
      return new Mesh(
        new STLLoader(manager).parse(buffer),
        new MeshStandardMaterial(),
      );
    }
    case "svg": {
      const { SVGLoader } = await import(
        "three/examples/jsm/loaders/SVGLoader.js"
      );
      const loader = new SVGLoader(manager);
      const group = new Group();
      group.scale.set(0.1, -0.1, 0.1);
      let renderOrder = 0;
      for (const path of loader.parse(text()).paths) {
        const fillMaterial = SVGLoader.createFillMaterial(path);
        if (fillMaterial) {
          for (const shape of path.toShapes()) {
            const { ShapeGeometry } = await import("three");
            const mesh = new Mesh(new ShapeGeometry(shape), fillMaterial);
            mesh.renderOrder = renderOrder++;
            group.add(mesh);
          }
        }
        const strokeMaterial = SVGLoader.createStrokeMaterial(path);
        if (strokeMaterial) {
          for (const subPath of path.subPaths) {
            const geometry = SVGLoader.pointsToStroke(
              subPath.getPoints(),
              path.userData.style as Parameters<
                typeof SVGLoader.pointsToStroke
              >[1],
            );
            if (!geometry) continue;
            const mesh = new Mesh(geometry, strokeMaterial);
            mesh.renderOrder = renderOrder++;
            group.add(mesh);
          }
        }
      }
      return group;
    }
    case "usd":
    case "usda":
    case "usdc":
    case "usdz": {
      const { USDLoader } = await import(
        "three/examples/jsm/loaders/USDLoader.js"
      );
      return new Promise((resolve, reject) => {
        try {
          const result = new USDLoader(manager).parse(
            format === "usda" ? text() : buffer,
            "",
            resolve,
            reject,
          );
          // USD without asynchronous texture references returns immediately.
          if (!result) return;
          queueMicrotask(() => resolve(result));
        } catch (error) {
          reject(error);
        }
      });
    }
    case "vox": {
      const { VOXLoader } = await import(
        "three/examples/jsm/loaders/VOXLoader.js"
      );
      return new VOXLoader(manager).parse(buffer).scene;
    }
    case "wrl": {
      const { VRMLLoader } = await import(
        "three/examples/jsm/loaders/VRMLLoader.js"
      );
      return new VRMLLoader(manager).parse(text(), "");
    }
    case "xyz": {
      const { XYZLoader } = await import(
        "three/examples/jsm/loaders/XYZLoader.js"
      );
      const loader = new XYZLoader(manager) as unknown as {
        parse(data: string): BufferGeometry;
      };
      return objectForGeometry(loader.parse(text()), true);
    }
  }
  throw new Error(`${format}のThree.js変換器が見つかりません`);
}

function objectForGeometry(
  geometry: BufferGeometry,
  forcePoints = false,
): Object3D {
  if (!forcePoints && geometry.index !== null) {
    return new Mesh(geometry, new MeshStandardMaterial({ vertexColors: geometry.hasAttribute("color") }));
  }
  return new Points(
    geometry,
    new PointsMaterial({
      size: 0.01,
      vertexColors: geometry.hasAttribute("color"),
    }),
  );
}

function normalizeRenderableGeometry(object: Object3D): void {
  object.traverse((candidate) => {
    const mesh = candidate as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.hasAttribute("normal")) mesh.geometry.computeVertexNormals();
  });
}

function containsRenderableObject(object: Object3D): boolean {
  let found = false;
  object.traverse((candidate) => {
    if (
      (candidate as Mesh).isMesh ||
      (candidate as Points).isPoints ||
      (candidate as Object3D & { isLine?: boolean }).isLine
    ) {
      found = true;
    }
  });
  return found;
}

function collectAnimations(object: Object3D): AnimationClip[] {
  const clips: AnimationClip[] = [];
  const seen = new Set<string>();
  object.traverse((candidate) => {
    for (const clip of candidate.animations ?? []) {
      const key = `${clip.uuid}:${clip.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      clips.push(clip);
    }
  });
  return clips;
}

function attachAnimations(
  object: Object3D,
  animations: readonly AnimationClip[] | undefined,
): void {
  if (!animations?.length) return;
  object.animations.push(...animations);
}

function createResourceResolver(files: readonly ThreeModelCompanionFile[]): {
  manager: LoadingManager;
  dispose: () => void;
} {
  const objectUrls: string[] = [];
  const normalized = new Map<string, ThreeModelCompanionFile>();
  for (const file of files) {
    const path = normalizeLookupPath(file.relativePath);
    if (!path) continue;
    normalized.set(path, file);
    const parts = path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const suffix = parts.slice(index).join("/");
      if (!normalized.has(suffix)) normalized.set(suffix, file);
    }
  }
  const manager = new LoadingManager();
  manager.addHandler(/\.tga(?:[?#].*)?$/i, new TGALoader(manager));
  manager.addHandler(/\.tiff?(?:[?#].*)?$/i, new TIFFLoader(manager));
  manager.setURLModifier((url) => {
    const lookup = normalizeLookupPath(url);
    if (lookup.endsWith("rhino3dm.js")) return rhino3dmJsUrl;
    if (lookup.endsWith("rhino3dm.wasm")) return rhino3dmWasmUrl;
    const file = normalized.get(lookup);
    if (!file) return url;
    const objectUrl = URL.createObjectURL(
      new Blob([ownedArrayBuffer(file.bytes)], {
        type: file.mimeType ?? "application/octet-stream",
      }),
    );
    objectUrls.push(objectUrl);
    return objectUrl;
  });
  return {
    manager,
    dispose: () => objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url)),
  };
}

function normalizeLookupPath(value: string): string {
  let normalized = value.replace(/\\/g, "/").split(/[?#]/, 1)[0] ?? "";
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep malformed source text for a deterministic failed lookup.
  }
  normalized = normalized.replace(/^(?:\.\.\/|\.\/|\/)+/, "");
  return normalized.normalize("NFC");
}

function findCompanionFile(
  files: readonly ThreeModelCompanionFile[],
  requestedPath: string,
): ThreeModelCompanionFile | undefined {
  const lookup = normalizeLookupPath(requestedPath).toLowerCase();
  return files.find((file) => {
    const candidate = normalizeLookupPath(file.relativePath).toLowerCase();
    return candidate === lookup || candidate.endsWith(`/${lookup}`);
  });
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
