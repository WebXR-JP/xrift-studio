import {
  CLASSIC_SHADER_LIMITS,
  resolveClassicShaderVolumeLayout,
  type ClassicShaderVolumeLayoutError,
} from "../../../packages/xrift-studio-runtime/src/classic-shader-contract";
import {
  getTextureAsset,
  getTextureSourceFormat,
  type AssetManifest,
  type TextureAsset,
} from "./asset-manifest";
import type {
  ClassicR3fMaterialShader,
  ClassicR3fShaderUniform,
} from "./custom-shader-contract";
import { isPublishedAsKtx2 } from "./texture-conversion";

/**
 * Which Texture Assets a Custom Shader uniform can read.
 *
 * The Inspector, the MCP tools and the compiler ask this one module, so an
 * Asset offered while authoring is an Asset the published world can draw.
 */

export type ClassicShaderTextureIssue = {
  uniformName: string;
  /** Present when one Asset is the cause. */
  assetId?: string;
  message: string;
};

/** How one Texture Asset reaches a shader. */
export type ClassicShaderTextureFormat =
  /** A decoded 8-bit picture. */
  | "image"
  /** KTX2, kept compressed on the GPU. */
  | "ktx2"
  /** EXR, read as float data. */
  | "float"
  /** HDR, which a uniform cannot read. */
  | "unsupported";

export function classicShaderTextureFormat(
  asset: TextureAsset,
): ClassicShaderTextureFormat {
  const format = getTextureSourceFormat(asset);
  if (format === "exr") return "float";
  if (format === "hdr") return "unsupported";
  return isPublishedAsKtx2(asset) ? "ktx2" : "image";
}

/** True when a `texture` uniform (sampler2D) can read the Asset. */
export function isClassicShaderTextureSource(asset: TextureAsset): boolean {
  return classicShaderTextureFormat(asset) !== "unsupported";
}

/**
 * True when the Asset can be sliced into a volume or used as a cube face.
 * Both are built from decoded pixels, which a compressed or float file does
 * not give.
 */
export function isClassicShaderImageSource(asset: TextureAsset): boolean {
  return classicShaderTextureFormat(asset) === "image";
}

export function describeClassicShaderVolumeLayoutError(
  error: ClassicShaderVolumeLayoutError,
): string {
  switch (error.reason) {
    case "no-size":
      return "画像の大きさを読み取れません";
    case "not-square":
      return `画像は${error.width}×${error.height}で、正方形のスライスが横に並ぶ形ではありません。slicesでスライス数を指定してください`;
    case "slices":
      return "slicesは1以上の整数で指定してください";
    case "width":
      return `画像の幅${error.width}を${error.slices}枚のスライスに等分できません`;
    default:
      return `3Dテクスチャが${error.sliceWidth}×${error.height}×${error.slices}になります。各辺は${error.limit}までにしてください`;
  }
}

function imageSize(asset: TextureAsset): [number, number] | undefined {
  const width = asset.importMetadata?.width;
  const height = asset.importMetadata?.height;
  return typeof width === "number" && typeof height === "number"
    ? [width, height]
    : undefined;
}

function uniformIssues(
  uniformName: string,
  uniform: ClassicR3fShaderUniform,
  assets: AssetManifest,
): ClassicShaderTextureIssue[] {
  const resolve = (
    assetId: string,
  ): TextureAsset | ClassicShaderTextureIssue => {
    const asset = getTextureAsset(assets, assetId);
    return (
      asset ?? {
        uniformName,
        assetId,
        message: `uniform「${uniformName}」が参照するテクスチャ（${assetId}）が見つかりません`,
      }
    );
  };
  const isIssue = (
    value: TextureAsset | ClassicShaderTextureIssue,
  ): value is ClassicShaderTextureIssue => "message" in value;

  if (uniform.kind === "texture") {
    const asset = resolve(uniform.textureAssetId);
    if (isIssue(asset)) return [asset];
    return isClassicShaderTextureSource(asset)
      ? []
      : [
          {
            uniformName,
            assetId: asset.id,
            message: `uniform「${uniformName}」はHDR画像「${asset.name}」を読めません。PNGなどの画像か、浮動小数のデータにはEXRを選んでください`,
          },
        ];
  }
  if (uniform.kind === "texture-3d") {
    const asset = resolve(uniform.textureAssetId);
    if (isIssue(asset)) return [asset];
    if (!isClassicShaderImageSource(asset)) {
      return [
        {
          uniformName,
          assetId: asset.id,
          message: `uniform「${uniformName}」の3Dテクスチャは「${asset.name}」から作れません。KTX2・EXR・HDR以外の画像を選んでください`,
        },
      ];
    }
    const size = imageSize(asset);
    if (!size) return [];
    const { error } = resolveClassicShaderVolumeLayout(
      size[0],
      size[1],
      uniform.slices,
    );
    return error
      ? [
          {
            uniformName,
            assetId: asset.id,
            message: `uniform「${uniformName}」の3Dテクスチャを作れません。${describeClassicShaderVolumeLayoutError(error)}`,
          },
        ]
      : [];
  }
  if (uniform.kind === "texture-cube") {
    const faces = uniform.faces.map((face) => resolve(face.textureAssetId));
    const missing = faces.filter(isIssue);
    if (missing.length > 0) return missing;
    const textures = faces as TextureAsset[];
    const unusable = textures.find((asset) => !isClassicShaderImageSource(asset));
    if (unusable) {
      return [
        {
          uniformName,
          assetId: unusable.id,
          message: `uniform「${uniformName}」のキューブマップに「${unusable.name}」は使えません。KTX2・EXR・HDR以外の画像を選んでください`,
        },
      ];
    }
    const sizes = textures.map(imageSize);
    if (sizes.some((size) => !size)) return [];
    const [width, height] = sizes[0]!;
    return width === height &&
      sizes.every((size) => size![0] === width && size![1] === height)
      ? []
      : [
          {
            uniformName,
            message: `uniform「${uniformName}」のキューブマップは、${CLASSIC_SHADER_LIMITS.cubeFaces}枚とも同じ大きさの正方形の画像にしてください`,
          },
        ];
  }
  return [];
}

/**
 * Every texture uniform of a shader that the published world could not draw,
 * with the reason in the author's words. Empty when all of them can be drawn.
 */
export function findClassicShaderTextureIssues(
  shader: Pick<ClassicR3fMaterialShader, "uniforms">,
  assets: AssetManifest,
): ClassicShaderTextureIssue[] {
  return Object.entries(shader.uniforms).flatMap(([uniformName, uniform]) =>
    uniformIssues(uniformName, uniform, assets),
  );
}
