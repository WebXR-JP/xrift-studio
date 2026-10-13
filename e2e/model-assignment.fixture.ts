import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { createAssetImportPlan, commitAssetImportPlan, type AssetImportWritePayload } from "../src/lib/visual-editor/asset-import";
import { createStarterVisualProject } from "../src/lib/visual-editor/starter-templates";
import { createEmptyEntity } from "../src/lib/visual-editor/editor-session";
import { createBoxColliderComponent } from "../src/lib/visual-editor/scene-document";
import { serializeVisualProjectDocuments } from "../src/lib/visual-editor/persistence";
import { tauri, type ExternalStoreInstallResult, type XriftMcpEditorResponse } from "../src/lib/tauri";

let analysisGate: { promise: Promise<void>; release: () => void; entered: boolean } | undefined;
let mcpInstallResult: XriftMcpEditorResponse | undefined;
let storeInstallCount = 0;
export function pauseModelStoreAnalysis() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  analysisGate = { promise, release, entered: false };
}
export function resumeModelStoreAnalysis() { analysisGate?.release(); }
export function modelStoreAuditState() { return { analysisEntered: analysisGate?.entered ?? false, storeInstallCount, mcpInstallResult }; }
export function recordModelStoreMcpInstall(result: Promise<XriftMcpEditorResponse>) {
  void result.then(value => { mcpInstallResult = value; });
}

async function dataUrl(payload: AssetImportWritePayload): Promise<string> {
  if (payload.encoding === "data-url") return payload.dataUrl;
  const bytes = new Uint8Array(payload.bytes.byteLength); bytes.set(payload.bytes);
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject;
    reader.readAsDataURL(new Blob([bytes.buffer], { type: "model/gltf-binary" }));
  });
}

/** Real GLB export/import/render; only project disk and catalog transport are memory fixtures. */
export async function prepareModelAssignmentFixture() {
  const files = new Map<string, string>();
  const bundle = createStarterVisualProject("world", "blank", "model-assignment-isolated");
  const added = createEmptyEntity(bundle.scene, null, "モデルを付けるEntity");
  if (!added) throw new Error("fixture Entity unavailable");
  bundle.scene = added.scene;
  const entity = bundle.scene.entities[added.entityId];
  const transform = entity.components.find(component => component.type === "transform")!;
  transform.position = [1, 2, 3]; transform.rotation = [0, 0.2, 0]; transform.scale = [1.2, 1.1, 0.9];
  entity.components.push(createBoxColliderComponent("fixture-auto-collider", { fitMode: "auto", friction: 0.65 }));
  const child = createEmptyEntity(bundle.scene, entity.id, "手動の子");
  if (!child) throw new Error("fixture child unavailable"); bundle.scene = child.scene;
  const ids: string[] = [];
  let storeInstall: ExternalStoreInstallResult | undefined;
  for (const [index, name] of ["Small Model", "Wide Model"].entries()) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(index ? 4 : 1, 2, 1), new THREE.MeshStandardMaterial({ color: index ? "#2266ee" : "#ee4422" }));
    const bytes = await new GLTFExporter().parseAsync(mesh, { binary: true }) as ArrayBuffer;
    const plan = await createAssetImportPlan({ fileName: `model-${index}.glb`, bytes, existingManifest: bundle.assets });
    if (!plan.canCommit || !plan.asset) throw new Error(JSON.stringify(plan.diagnostics));
    bundle.assets = await commitAssetImportPlan(bundle.assets, plan, async request => {
      for (const write of request.writes) files.set(write.relativePath, await dataUrl(write.payload));
    });
    bundle.assets.assets[plan.asset.id] = { ...bundle.assets.assets[plan.asset.id], name };
    ids.push(plan.asset.id);
    if (index === 1) {
      const relativePath = "assets/imported/external/poly-haven/model-assignment-fixture/model.glb";
      files.set(relativePath, await dataUrl({ encoding: "bytes", bytes: new Uint8Array(bytes) }));
      storeInstall = { providerId: "poly-haven", providerName: "Poly Haven", externalId: "model-assignment-fixture", name: "Store Model", assetKind: "model", resolution: "1k",
        files: [{ role: "model", relativePath, byteLength: bytes.byteLength, sha256: plan.sourceHash, format: "glb" }], authors: ["検証用"], assetUrl: "https://example.invalid/model", licenseName: "検証用素材", licenseUrl: "" };
    }
    mesh.geometry.dispose(); mesh.material.dispose();
  }
  const originalRead = tauri.readProjectFileDataUrl;
  tauri.readProjectFileDataUrl = async (path, relativePath) => {
    if (analysisGate && relativePath.includes("external/poly-haven/model-assignment-fixture")) { analysisGate.entered = true; await analysisGate.promise; }
    return files.get(relativePath) ?? originalRead(path, relativePath);
  };
  tauri.listExternalStoreAssets = async providerId => providerId === "poly-haven" ? [{ providerId, externalId: "model-assignment-fixture", name: "Store Model", description: "検証用の実GLB", category: "model", tags: [], thumbnailUrl: "", assetKind: "model", downloadCount: 0, authors: ["検証用"], assetUrl: "https://example.invalid/model", licenseName: "検証用素材", licenseUrl: "" }] : [];
  tauri.getExternalStoreAssetOptions = async (providerId, externalId) => ({ providerId, externalId, assetKind: "model", resolutions: [{ id: "1k", label: "検証用GLB", byteLength: 1024, fileCount: 1, formats: [] }] });
  tauri.installExternalStoreAsset = async () => {
    storeInstallCount++;
    if (!storeInstall) throw new Error("fixture source unavailable");
    return structuredClone(storeInstall);
  };
  const request = serializeVisualProjectDocuments({ project: bundle.project, scenes: { [bundle.scene.sceneId]: bundle.scene }, assets: bundle.assets, prefabs: bundle.prefabs });
  const project = await tauri.createVisualProject((await tauri.runtimePaths()).projectsRoot, "model-assignment-isolated", request);
  return { project, entityId: entity.id, childId: child.entityId, modelIds: ids, originalTransform: structuredClone(transform) };
}
