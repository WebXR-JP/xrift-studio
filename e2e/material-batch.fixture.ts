import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ToastProvider } from "../src/components/Toast";
import { VisualEditorPrototype, type VisualEditorMcpProjectBridge } from "../src/components/visual-editor/VisualEditorPrototype";
import {
  createDefaultMaterialAsset, createTextureAsset, DEFAULT_MODEL_IMPORT_SETTINGS,
  type MaterialTextureInfo, type MaterialAsset, type MaterialAssetPatch,
} from "../src/lib/visual-editor/asset-manifest";
import { createDefaultCustomShader } from "../src/lib/visual-editor/custom-shader-contract";
import { createPrototypeProject, type PrototypeVisualProject } from "../src/lib/visual-editor/prototype-project";
import { assetManifestCodec } from "../src/lib/visual-editor/serialization";
import { installReleaseE2EMock } from "../src/release-e2e/mock-tauri";
import { tauri, type XriftMcpEditorRequestEvent, type XriftMcpEditorResponse } from "../src/lib/tauri";
import "../src/index.css";

let root: Root;
let bridge: VisualEditorMcpProjectBridge | null = null;
let saved: PrototypeVisualProject;
let saveCount = 0;
let mountCount = 0;
let mcpRequestListener: ((request: XriftMcpEditorRequestEvent) => void) | undefined;
let mcpRequestCount = 0;
const mcpResponses = new Map<string, (response: XriftMcpEditorResponse) => void>();

function createBatchProject(): PrototypeVisualProject {
  const bundle = createPrototypeProject("world", "マテリアルの一括変更");
  const info = (index: number): MaterialTextureInfo => ({
    textureAssetId: `batch-texture-${index}`, texCoord: index % 2,
    transform: { offset: [index / 20, index / 30], scale: [index + 1, index + 2], rotation: index / 10 },
  });
  for (let index = 1; index <= 10; index++) {
    bundle.assets.assets[`batch-texture-${index}`] = createTextureAsset({
      id: `batch-texture-${index}`, name: `Batch Texture ${index}`,
      source: { kind: "project", relativePath: `assets/batch-texture-${index}.png` }, importSettings: {},
    })!;
  }
  const common = (first: boolean): MaterialAssetPatch => ({
    pbrMetallicRoughness: {
      baseColorFactor: first ? [0.8, 0.15, 0.25, 0.35] : [0.2, 0.65, 0.85, 0.8],
      baseColorTexture: info(first ? 1 : 2), metallicFactor: first ? 0.15 : 0.65,
      roughnessFactor: first ? 0.4 : 0.9, metallicRoughnessTexture: info(first ? 3 : 4),
    },
    normalTexture: { ...info(first ? 3 : 4), scale: first ? 0.42 : 1.75 },
    emissiveTexture: info(first ? 5 : 6), emissiveFactor: first ? [0.1, 0.2, 0.3] : [0.3, 0.2, 0.1],
    occlusionTexture: { ...info(first ? 7 : 8), strength: first ? 0.3 : 0.8 },
    opacityTexture: info(first ? 9 : 10), opacityChannel: first ? "g" : "b",
    alphaMode: first ? "MASK" : "BLEND", alphaCutoff: first ? 0.32 : 0.68,
    doubleSided: first, vertexColors: !first, depthWrite: first ? "on" : "off",
  });
  const red = createDefaultMaterialAsset({ id: "batch-red", name: "Batch Red", properties: common(true) })!;
  const blue = createDefaultMaterialAsset({ id: "batch-blue", name: "Batch Blue", properties: {
    ...common(false), extensions: { VRMC_materials_mtoon: {
      shadeColorFactor: [0.13, 0.27, 0.41], shadeMultiplyTexture: info(1),
      shadingShiftFactor: -0.25, shadingShiftTexture: { ...info(2), scale: 0.6 },
      matcapFactor: [0.7, 0.6, 0.5], matcapTexture: info(3),
      parametricRimColorFactor: [0.21, 0.43, 0.65], rimMultiplyTexture: info(4),
      outlineWidthMode: "worldCoordinates", outlineWidthFactor: 0.007,
      outlineColorFactor: [0.2, 0.3, 0.4], outlineWidthMultiplyTexture: info(5),
      uvAnimationMaskTexture: info(6), uvAnimationScrollXSpeedFactor: 0.15,
    } },
  } })!;
  const custom: MaterialAsset = { ...createDefaultMaterialAsset({ id: "batch-custom", name: "Batch Custom" })!, shader: createDefaultCustomShader() };
  for (const material of [red, blue, custom]) bundle.assets.assets[material.id] = material;
  bundle.assets.assets["batch-model"] = {
    id: "batch-model", name: "Batch Model", kind: "model", status: "ready",
    source: { kind: "project", relativePath: "assets/batch-model.vrm" },
    importSettings: { ...DEFAULT_MODEL_IMPORT_SETTINGS }, materialSlots: [],
  };
  return bundle;
}

export function mountMaterialBatchEditor(host: HTMLElement): void {
  installReleaseE2EMock();
  saved = createBatchProject();
  saveCount = 0;
  root = createRoot(host);
  renderEditor();
}

/** Mock the native transport; every request runs the actual live Editor bridge. */
export function mountMaterialBatchMcpEditor(host: HTMLElement): void {
  tauri.isAvailable = () => true;
  tauri.onXriftMcpEditorRequest = async (handler) => {
    mcpRequestListener = handler;
    return () => { mcpRequestListener = undefined; };
  };
  tauri.completeXriftMcpRequest = async (response) => {
    mcpResponses.get(response.id)?.(response);
    mcpResponses.delete(response.id);
  };
  mountMaterialBatchEditor(host);
}

export function callMaterialBatchMcp(tool: string, argumentsValue: Record<string, unknown> = {}): Promise<XriftMcpEditorResponse> {
  if (!mcpRequestListener) throw new Error("The live Material MCP bridge is not ready");
  const id = `material-batch-mcp-${++mcpRequestCount}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { mcpResponses.delete(id); reject(new Error(`MCP request ${tool} timed out`)); }, 15_000);
    mcpResponses.set(id, response => { clearTimeout(timeout); resolve(response); });
    mcpRequestListener!({ id, tool, arguments: argumentsValue, clientName: "Material MCP integration fixture" });
  });
}

function renderEditor(): void {
  root.render(createElement(ToastProvider, null, createElement(VisualEditorPrototype, {
    key: ++mountCount, projectKind: "world", projectName: "マテリアルの一括変更",
    initialBundle: saved, onBack: () => {},
    onSave: async (bundle) => {
      const parsed = assetManifestCodec.parse(assetManifestCodec.serialize(bundle.assets));
      if (!parsed.ok) throw new Error("一括変更後の素材を保存できませんでした");
      saved = structuredClone({ ...bundle, assets: parsed.document });
      saveCount++;
    },
    onRegisterMcpProjectBridge: (value) => { bridge = value; },
  })));
}

export function readMaterialBatchState() {
  const live = bridge?.currentBundle() ?? saved;
  return { saveCount, assets: structuredClone(live.assets.assets), savedAssets: structuredClone(saved.assets.assets), mcpBridgeReady: Boolean(bridge && mcpRequestListener) };
}

export function reopenMaterialBatchEditor(): void { renderEditor(); }
