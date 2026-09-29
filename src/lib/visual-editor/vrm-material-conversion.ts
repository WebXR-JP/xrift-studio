import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import type { GLTFParser } from "three/addons/loaders/GLTFLoader.js";
import { isRecord } from "../json-guards";
import type { GltfDerivedAssetWarning, GltfJson } from "./gltf-derived-assets";

/**
 * Use the same official VRM 0.x conversion as VRMLoaderPlugin. Only this
 * authoring copy changes; the imported .vrm bytes and source hash stay intact.
 */
export async function convertVrm0MaterialsForAuthoring(
  json: GltfJson,
  warnings: GltfDerivedAssetWarning[],
): Promise<GltfJson> {
  const vrm = isRecord(json.extensions?.VRM) ? json.extensions.VRM : undefined;
  if (!Array.isArray(vrm?.materialProperties)) return json;

  const converted = structuredClone(json);
  const materialProperties = (converted.extensions!.VRM as Record<string, unknown>).materialProperties as unknown[];
  const recognized = new Map<number, string>();
  for (const [index, entry] of materialProperties.entries()) {
    const shader = isRecord(entry) && typeof entry.shader === "string" ? entry.shader : undefined;
    if (shader === "VRM/MToon" || shader?.startsWith("VRM/Unlit")) {
      if (converted.materials?.[index]) recognized.set(index, shader);
      else warnings.push({
        code: "vrm0-material-missing",
        message: "VRM 0.x のマテリアル設定に対応する glTF マテリアルがありません",
        fieldPath: `extensions.VRM.materialProperties[${index}]`,
      });
    } else if (shader !== "VRM_USE_GLTFSHADER") {
      warnings.push({
        code: "vrm0-material-shader-unsupported",
        message: `VRM 0.x の ${shader ?? "不明なシェーダー"} は対応する glTF マテリアルとして取り込みます`,
        fieldPath: `extensions.VRM.materialProperties[${index}].shader`,
      });
    }
    // Keep the official converter away from malformed/unsupported records;
    // their original glTF Material is a useful, non-destructive fallback.
    if (!recognized.has(index)) materialProperties[index] = { shader: "VRM_USE_GLTFSHADER" };
  }
  if (!recognized.size) return json;

  try {
    // beforeRoot is deliberately JSON-only: no resources, meshes or browser
    // loader state are needed for this public compatibility plugin hook.
    await new VRMLoaderPlugin({ json: converted } as GLTFParser).materialsV0CompatPlugin.beforeRoot();
  } catch {
    warnings.push({
      code: "vrm0-material-conversion-failed",
      message: "VRM 0.x のマテリアル設定を変換できなかったため、元の glTF マテリアルを取り込みます",
      fieldPath: "extensions.VRM.materialProperties",
    });
    return json;
  }

  for (const index of recognized.keys()) {
    const material = converted.materials![index]!;
    const extensions = isRecord(material.extensions) ? material.extensions : undefined;
    const mtoon = isRecord(extensions?.VRMC_materials_mtoon) ? extensions.VRMC_materials_mtoon : undefined;
    if (!mtoon) continue;
    // The compatibility plugin intentionally accepts legacy RGBA colors for
    // its loader. Persist the normative RGB shape for editable Materials.
    for (const field of ["shadeColorFactor", "parametricRimColorFactor", "outlineColorFactor"] as const) {
      if (Array.isArray(mtoon[field])) mtoon[field] = mtoon[field].slice(0, 3);
    }
    if (Array.isArray(material.emissiveFactor)) {
      const emissive = material.emissiveFactor.slice(0, 3);
      const strength = emissive.every((channel) => typeof channel === "number" && Number.isFinite(channel) && channel >= 0)
        ? Math.max(1, ...emissive as number[])
        : 1;
      material.emissiveFactor = strength > 1 ? emissive.map((channel) => Number(channel) / strength) : emissive;
      // Legacy Unity colors can be HDR. Express their intensity through the
      // standard extension rather than clipping the editable RGB factor.
      if (strength > 1) extensions!.KHR_materials_emissive_strength = { emissiveStrength: strength };
    }
    mtoon.extras = { xriftVrm0CompatShade: true };
  }
  return converted;
}
