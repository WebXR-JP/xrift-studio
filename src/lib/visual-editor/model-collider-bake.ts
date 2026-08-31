import { tauri } from "../tauri";
import {
  DEFAULT_MODEL_IMPORT_SETTINGS,
  type AssetManifest,
  type ModelAsset,
  type ModelBoundsMetadata,
} from "./asset-manifest";
import {
  createAssetImportTransactionId,
  describeAssetImportFailure,
} from "./asset-import-transaction";
import { decimatePrimitive } from "./model-decimation";
import {
  assetBytesToDataUrl,
  copyAssetBytes,
  processedAssetPath,
  readProjectAssetBytes,
  sha256Hex,
} from "./texture-processing";

/**
 * 当たり判定だけを軽量化して、見た目から切り離す。
 *
 * 当たり判定に見た目の細かさは要らない。海岸の地面は78,166三角形あるが、
 * 歩くだけならその1割で足りる。見た目のMeshを削ると質感まで落ちるので、
 * 削るのは当たり側だけにして、重いMeshをそのまま使えるようにする。
 *
 * 焼き出すのは位置と索引だけのGLB一枚で、Material・Texture・Animation・
 * 法線・UVは持たない。当たり判定はどれも使わないし、持たないぶん小さい。
 */

export type ColliderBakeResult =
  | { ok: false; message: string }
  | {
      ok: true;
      manifest: AssetManifest;
      assetId: string;
      triangles: { before: number; after: number };
      byteLength: number;
    };

export const COLLIDER_BAKE_RATIOS = [0.5, 0.25, 0.1, 0.05] as const;

/**
 * Model一つのNode一つから、軽量な当たり判定用Modelを作ってManifestへ足す。
 * 元のModelには触らない。
 */
export async function bakeNodeColliderModel(
  projectPath: string,
  manifest: AssetManifest,
  input: {
    modelAssetId: string;
    sourceNodeIndex: number;
    ratio: number;
    nodeName: string;
    /** 作り直しのときは、前回のAsset idを渡すと同じ枠を使い回す。 */
    existingAssetId?: string;
    createAssetId: () => string;
  },
): Promise<ColliderBakeResult> {
  const source = manifest.assets[input.modelAssetId];
  if (source?.kind !== "model") {
    return { ok: false, message: "元になるModel Assetが見つかりませんでした。" };
  }
  if (source.source.kind !== "project") {
    return {
      ok: false,
      message: "プロジェクト内に保存されたModelだけ当たり判定を焼き出せます。",
    };
  }

  try {
    const [core, extensions] = await Promise.all([
      import("@gltf-transform/core"),
      import("@gltf-transform/extensions"),
    ]);
    const sourceBytes = await readProjectAssetBytes(
      projectPath,
      source.source.relativePath,
    );
    const io = new core.WebIO().registerExtensions(extensions.ALL_EXTENSIONS);
    const document = await io.readBinary(copyAssetBytes(sourceBytes));
    const node = document.getRoot().listNodes()[input.sourceNodeIndex];
    const mesh = node?.getMesh();
    if (!mesh) {
      return {
        ok: false,
        message: "選んだNodeにMeshがないため、当たり判定を作れません。",
      };
    }

    // 位置と索引だけを写す。当たり判定はMaterialも法線もUVも見ない。
    const baked = new core.Document();
    const buffer = baked.createBuffer();
    const bakedMesh = baked.createMesh("collision");
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;
      const positions = new Float32Array(position.getCount() * 3);
      const element: number[] = [0, 0, 0];
      for (let index = 0; index < position.getCount(); index += 1) {
        position.getElement(index, element);
        positions[index * 3] = element[0];
        positions[index * 3 + 1] = element[1];
        positions[index * 3 + 2] = element[2];
      }
      const sourceIndices = primitive.getIndices()?.getArray();
      const indices = sourceIndices
        ? Uint32Array.from(sourceIndices)
        : Uint32Array.from({ length: position.getCount() }, (_, i) => i);
      bakedMesh.addPrimitive(
        baked
          .createPrimitive()
          .setAttribute(
            "POSITION",
            baked
              .createAccessor()
              .setType("VEC3")
              .setArray(positions)
              .setBuffer(buffer),
          )
          .setIndices(
            baked
              .createAccessor()
              .setType("SCALAR")
              .setArray(indices)
              .setBuffer(buffer),
          ),
      );
    }
    if (bakedMesh.listPrimitives().length === 0) {
      return {
        ok: false,
        message: "選んだNodeから当たり判定に使える面が取れませんでした。",
      };
    }
    baked
      .createScene()
      .addChild(baked.createNode(input.nodeName).setMesh(bakedMesh));

    let before = 0;
    let after = 0;
    for (const primitive of bakedMesh.listPrimitives()) {
      const result = await decimatePrimitive(baked, primitive, input.ratio);
      before += result.before;
      after += result.after;
    }

    const bytes = copyAssetBytes(await io.writeBinary(baked));
    const assetId = input.existingAssetId ?? input.createAssetId();
    const sourceHash = await sha256Hex(bytes);
    const relativePath = processedAssetPath(assetId, sourceHash, "glb");
    await tauri.commitVisualAssetImport(
      projectPath,
      createAssetImportTransactionId("collider-bake"),
      [
        {
          relativePath,
          dataUrl: await assetBytesToDataUrl(bytes, "model/gltf-binary"),
        },
      ],
    );

    const bounds = boundsOfDocument(baked);
    const asset: ModelAsset = {
      id: assetId,
      name: `${input.nodeName} の当たり判定`,
      kind: "model",
      status: "ready",
      folderId: source.folderId ?? null,
      source: { kind: "project", relativePath },
      sourceHash,
      importSettings: {
        ...DEFAULT_MODEL_IMPORT_SETTINGS,
        scale: source.importSettings.scale,
        generateColliders: false,
      },
      materialSlots: [],
      importMetadata: {
        sourceFormat: "glb",
        sourceFileName: relativePath.split("/").pop(),
        byteLength: bytes.byteLength,
        nodeCount: 1,
        meshCount: 1,
        primitiveCount: bakedMesh.listPrimitives().length,
        bounds,
        animations: [],
        extensionsUsed: [],
        extensionsRequired: [],
        nodes: [
          {
            sourceNodeIndex: 0,
            name: input.nodeName,
            childSourceNodeIndices: [],
            meshIndex: 0,
            sourceMaterialIndices: [],
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            bounds: { min: bounds.min, max: bounds.max },
          },
        ],
      },
    };

    return {
      ok: true,
      manifest: { ...manifest, assets: { ...manifest.assets, [assetId]: asset } },
      assetId,
      triangles: { before, after },
      byteLength: bytes.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      message: `当たり判定を焼き出せませんでした。${describeAssetImportFailure(error)}`,
    };
  }
}

function boundsOfDocument(
  document: import("@gltf-transform/core").Document,
): ModelBoundsMetadata {
  let min: [number, number, number] = [Infinity, Infinity, Infinity];
  let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const element: number[] = [0, 0, 0];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;
      for (let index = 0; index < position.getCount(); index += 1) {
        position.getElement(index, element);
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], element[axis]);
          max[axis] = Math.max(max[axis], element[axis]);
        }
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    min = [0, 0, 0];
    max = [0, 0, 0];
  }
  const size: [number, number, number] = [
    max[0] - min[0],
    max[1] - min[1],
    max[2] - min[2],
  ];
  return {
    min,
    max,
    center: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
    size,
    boundingSphereRadius: Math.hypot(size[0], size[1], size[2]) / 2,
  };
}
