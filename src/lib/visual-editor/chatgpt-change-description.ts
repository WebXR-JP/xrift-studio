import { resolveSceneSettings } from "./scene-settings";
import type { PrototypeVisualProject } from "./prototype-project";
import type { ChatgptWorldPlan } from "./chatgpt-world";
import { normalizeMaterialProperties, type MaterialAsset, type MaterialAssetPatch } from "./asset-manifest";

export type ChatgptSettingDisplay = { label: string; value: string; previousValue?: string; enabled?: boolean; color?: string };

const fields: Record<string, string> = {
  shadowMapType: "Shadow Mapの種類",
  "skybox.enabled": "Skyboxの背景表示", "skybox.iblEnabled": "IBL（画像による照明）",
  "skybox.imageAssetId": "Skybox Texture", "skybox.materialAssetId": "Skybox Shader", "skybox.projection": "Skyboxの投影方法",
  "skybox.topColor": "Skyboxの上空の色", "skybox.bottomColor": "Skyboxの地平線の色",
  "skybox.offset": "Skyboxのオフセット", "skybox.exponent": "Skyboxのグラデーション", "skybox.rotationDegrees": "Skyboxの水平回転",
  "skybox.flipY": "Skyboxの上下反転", "skybox.exposure": "Skyboxの明るさ", "skybox.meshPosition": "Skyboxのメッシュ位置",
  "skybox.meshRotationDegrees": "Skyboxのメッシュ回転", "skybox.meshScale": "Skyboxのメッシュスケール", "skybox.center": "Skyboxの投影中心",
  "fog.enabled": "Fog", "fog.color": "Fogの色", "fog.near": "Fogの開始距離", "fog.far": "Fogの終了距離",
  "ambient.enabled": "Ambient Light", "ambient.color": "Ambient Lightの色", "ambient.intensity": "Ambient Lightの強さ",
  "camera.near": "カメラの最短描画距離", "camera.far": "カメラの最長描画距離", "camera.fov": "カメラの視野角",
  "postprocessing.enabled": "Post Processing", "postprocessing.order": "画面効果の順序", "postprocessing.exposure": "画面全体の露出",
  "postprocessing.hdr.enabled": "HDRレンダリング", "postprocessing.hdr.toneMapping": "Tone Mapping",
  "postprocessing.bloom.enabled": "Bloom", "postprocessing.bloom.threshold": "Bloomのしきい値", "postprocessing.bloom.strength": "Bloomの強さ", "postprocessing.bloom.radius": "Bloomの広がり",
  "postprocessing.ao.enabled": "SSAO", "postprocessing.ao.radius": "SSAOの範囲", "postprocessing.ao.minDistance": "SSAOの最小距離", "postprocessing.ao.maxDistance": "SSAOの最大距離",
  "postprocessing.grading.enabled": "Color Grading", "postprocessing.grading.contrast": "Color Gradingの明暗差", "postprocessing.grading.saturation": "Color Gradingの彩度", "postprocessing.grading.temperature": "Color Gradingの色温度", "postprocessing.grading.tint": "Color Gradingの色かぶり",
  "vegetation.enabled": "風", "vegetation.windStrength": "風の強さ", "vegetation.windSpeed": "風の速度", "vegetation.gustStrength": "突風の強さ", "vegetation.windDirectionDegrees": "風向き",
  "physics.gravity": "重力", "physics.allowInfiniteJump": "無限ジャンプ",
  "editor.backgroundColor": "編集背景の色", "editor.gizmo.size": "ギズモの大きさ", "editor.gizmo.gridVisible": "グリッド表示", "editor.gizmo.gridSize": "グリッドサイズ", "editor.gizmo.gridDivisions": "グリッドの分割数",
  "editor.gizmo.snapEnabled": "スナップ", "editor.gizmo.snapHoldShift": "Shift中のスナップ反転", "editor.gizmo.translateSnap": "移動スナップ", "editor.gizmo.rotateSnapDegrees": "回転スナップ", "editor.gizmo.scaleSnap": "拡縮スナップ",
};
const sections: Record<string, string> = { shadowMapType: "Shadow Map", skybox: "Skybox", fog: "Fog", ambient: "Ambient Light", camera: "カメラ", postprocessing: "画面効果", vegetation: "風", physics: "物理", editor: "編集表示" };
const number = (value: number) => new Intl.NumberFormat("ja-JP", { useGrouping: false, maximumFractionDigits: 4 }).format(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
function leaves(value: unknown, prefix = "", result: Record<string, unknown> = {}) {
  if (record(value)) for (const [key, child] of Object.entries(value)) leaves(child, prefix ? `${prefix}.${key}` : key, result);
  else result[prefix] = value;
  return result;
}
export function chatgptSceneSettingsLabel(patch: Record<string, unknown>): string {
  const labels = [...new Set(Object.keys(leaves(patch)).map(path => fields[path] ?? path))];
  return `${labels.slice(0, 3).join("・")}${labels.length > 3 ? `ほか${labels.length - 3}項目` : ""}を変更`;
}
function format(value: unknown, path: string, bundle?: PrototypeVisualProject): string {
  if (value === undefined || value === null || value === "") return "未設定";
  if (typeof value === "boolean") return path.endsWith("gridVisible") || path === "skybox.enabled" ? value ? "表示" : "非表示" : value ? "有効" : "無効";
  const degrees = path.endsWith("Degrees") || path === "camera.fov" || path === "rotation";
  if (typeof value === "number") return `${number(value)}${degrees ? "°" : ""}`;
  if (Array.isArray(value)) return value.length === 3 && value.every(item => typeof item === "number")
    ? value.map((item, index) => `${["X", "Y", "Z"][index]} ${format(item, path)}`).join(" / ")
    : value.map(item => item === "bloom" ? "Bloom" : item === "grading" ? "Color Grading" : String(item)).join(" → ");
  if (typeof value === "string" && path.endsWith("AssetId")) return bundle?.assets.assets[value]?.name ?? "素材";
  const enums: Record<string, string> = { infinite: "無限遠", box: "Box", dome: "Dome", aces: "ACES", none: "なし", basic: "Basic", pcf: "PCF", pcfSoft: "PCF Soft", vsm: "VSM" };
  return enums[String(value)] ?? String(value);
}

/** Requested fields stay visible even when normalization keeps their old value.
 * Saved results also include dependent fields actually changed by the Editor. */
export function sceneSettingsDisplay(patch: Record<string, unknown>, before?: PrototypeVisualProject, after?: PrototypeVisualProject): ChatgptSettingDisplay[] {
  const requested = leaves(patch);
  const old = before ? leaves(resolveSceneSettings(before.scene.settings)) : {};
  const actual = after ? leaves(Object.fromEntries(Object.entries(resolveSceneSettings(after.scene.settings)).filter(([key]) => own(patch, key)))) : requested;
  const paths = new Set([...Object.keys(requested), ...(after && before ? Object.keys(actual).filter(path => !equal(old[path], actual[path])) : [])]);
  const displayValue = (value: unknown, path: string, bundle?: PrototypeVisualProject) => `${format(value, path, bundle)}${typeof value === "number" && ["fog.near", "fog.far", "camera.near", "camera.far"].includes(path) ? " m" : ""}`;
  return [...paths].filter(path => own(fields, path)).map(path => {
    const value = actual[path];
    return {
      label: fields[path], value: displayValue(value, path, after ?? before),
      ...(before ? { previousValue: displayValue(old[path], path, before) } : {}),
      ...(typeof value === "boolean" ? { enabled: value } : {}),
      ...(typeof value === "string" && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/iu.test(value) ? { color: value } : {}),
    };
  });
}

/** Recover only data from older JSON details; historical before-values are unknown. */
export function sceneSettingsDisplayFromLegacyDetail(detail: string): ChatgptSettingDisplay[] | undefined {
  if (!detail.trim() || detail.length > 8192) return undefined;
  try {
    let patch: unknown;
    if (detail.trim().startsWith("{")) patch = JSON.parse(detail);
    else {
      const pieces = detail.split(/、\s*(?=(?:shadowMapType|skybox|fog|ambient|camera|postprocessing|vegetation|physics|editor)\s*[:：])/u);
      const entries = pieces.map(piece => {
        const match = piece.trim().match(/^(shadowMapType|skybox|fog|ambient|camera|postprocessing|vegetation|physics|editor)\s*[:：]\s*([\s\S]+)$/u);
        if (!match) throw new Error("Not a recorded Scene setting");
        return [match[1], JSON.parse(match[2])] as const;
      });
      patch = Object.fromEntries(entries);
    }
    if (!record(patch) || Object.keys(patch).some(key => !own(sections, key))) return undefined;
    const bounded = (value: unknown, depth = 0): boolean => {
      if (depth > 4) return false;
      if (record(value)) return Object.keys(value).length <= 64 && Object.values(value).every(child => bounded(child, depth + 1));
      if (Array.isArray(value)) return value.length <= 3 && value.every(child => typeof child === "number" && Number.isFinite(child) || typeof child === "string" && child.length <= 80);
      return value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 240;
    };
    if (!bounded(patch)) return undefined;
    const settings = sceneSettingsDisplay(patch);
    return settings.length ? settings : undefined;
  } catch { return undefined; }
}

/** The same normalized values as Inspector, restricted to explicitly requested fields. */
export function chatgptMaterialSettingsDisplay(patch: Record<string, unknown>, beforeMaterial?: MaterialAsset, afterMaterial?: MaterialAsset): ChatgptSettingDisplay[] {
  const proposed = normalizeMaterialProperties(patch as MaterialAssetPatch);
  const next = afterMaterial ? normalizeMaterialProperties(afterMaterial.properties) : proposed;
  const old = beforeMaterial ? normalizeMaterialProperties(beforeMaterial.properties) : undefined;
  const labels: Record<string, string> = { color: "Base Color", roughness: "Roughness", metalness: "Metallic", opacity: "Opacity", emissiveFactor: "Emissive", alphaMode: "Alpha Mode", alphaCutoff: "Alpha Cutoff", doubleSided: "両面表示", vertexColors: "頂点カラー", blending: "ブレンド", depthWrite: "深度の書き込み", alphaToCoverage: "Alpha To Coverage" };
  const requested = new Set<string>();
  for (const key of Object.keys(patch)) {
    if (key !== "pbrMetallicRoughness") requested.add(key);
    else if (record(patch[key])) for (const field of Object.keys(patch[key])) {
      if (field === "baseColorFactor") { requested.add("color"); requested.add("opacity"); }
      else if (field === "roughnessFactor") requested.add("roughness");
      else if (field === "metallicFactor") requested.add("metalness");
    }
  }
  const display = (value: unknown, key: string) => key === "emissiveFactor" && Array.isArray(value) ? value.map((channel, index) => `${["R", "G", "B"][index]} ${number(channel)}`).join(" / ") : format(value, key);
  return [...requested].filter(key => own(labels, key)).map(key => {
    const value = next[key as keyof typeof next];
    return { label: labels[key], value: display(value, key),
      ...(old ? { previousValue: display(old[key as keyof typeof old], key) } : {}),
      ...(typeof value === "boolean" ? { enabled: value } : {}),
      ...(key === "color" && typeof value === "string" && /^#[a-f\d]{6}$/iu.test(value) ? { color: value } : {}),
    };
  });
}

/** Describe requested fields before applying, and actual persisted differences
 * afterwards (including dependent settings such as grid auto-alignment). */
export function describeChatgptSceneSettings(patch: Record<string, unknown>, before?: PrototypeVisualProject, after?: PrototypeVisualProject): string {
  const old = before ? leaves(resolveSceneSettings(before.scene.settings)) : {};
  const next = after ? leaves(Object.fromEntries(Object.entries(resolveSceneSettings(after.scene.settings)).filter(([key]) => key in patch))) : leaves(patch);
  const paths = new Set([...Object.keys(next), ...(after ? Object.keys(old).filter(path => path.split(".")[0] in patch) : [])]);
  const changes = [...paths].filter(path => !equal(old[path], next[path])).map(path => {
    const label = fields[path] ?? path;
    const to = format(next[path], path, after ?? before);
    return before ? `${label}：${format(old[path], path, before)} → ${to}` : `${label}：${to}`;
  });
  return changes.join("、") || `${Object.keys(leaves(patch)).map(path => fields[path] ?? sections[path] ?? path).join("・")}（値の変更なし）`;
}

export function describeChatgptEntityEdit(edit: NonNullable<ChatgptWorldPlan["edits"]>[number], before: PrototypeVisualProject, after?: PrototypeVisualProject): string {
  const original = before.scene.entities[edit.entityId], changed = after?.scene.entities[edit.entityId];
  const oldTransform = original?.components.find(component => component.type === "transform");
  const newTransform = changed?.components.find(component => component.type === "transform");
  const details: string[] = [];
  if (edit.name !== undefined && edit.name !== original?.name) details.push(`名前：${original?.name ?? "Entity"} → ${changed?.name ?? edit.name}`);
  for (const key of ["position", "rotation", "scale"] as const) {
    if (!edit[key]) continue;
    const old = oldTransform?.[key]?.map(value => key === "rotation" ? value * 180 / Math.PI : value);
    const next = newTransform ? newTransform[key].map(value => key === "rotation" ? value * 180 / Math.PI : value) : edit[key];
    if (!equal(old, next)) details.push(`${{ position: "位置", rotation: "回転", scale: "大きさ" }[key]}：${format(old, key)} → ${format(next, key)}`);
  }
  return `${changed?.name ?? edit.name ?? original?.name ?? "Entity"}：${details.join("、") || "値の変更なし"}`;
}
