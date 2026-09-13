import { executeXriftMcpEditorTool, type XriftMcpEditorContext } from "../../mcp-editor-tools";
import { createPrototypeProject } from "../../prototype-project";
import { BUILTIN_ASSET_IDS } from "../../builtin-asset-ids";
import { applySpatialCaptureToScene } from "./apply-to-scene";
import { buildSpatialConversionPlan } from "./semantic-conversion";
import { Euler, Quaternion } from "three";
import { quaternionToEuler, localOffsetPosition } from "./spatial-transform";
import { getTransform } from "../../scene-document";
import { spatialSurfaceGeometryToGlb } from "./spatial-mesh-glb";
import { rankSemanticPrefabs } from "./semantic-prefab-resolver";
import { migrateSpatialCapture, createSpatialCapture } from "./spatial-capture";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export function runSpatialCaptureFixture(): void {
  const bundle = createPrototypeProject("world", "spatial-fixture");
  const capture = createSpatialCapture({
    captureId: "fixture-room",
    createdAt: new Date(0).toISOString(),
    source: { transport: "openxr", runtime: "fixture" },
    referenceSpace: "local-floor",
    surfaces: [
      {
        id: "wall-1",
        kind: "plane",
        semanticLabel: "wall",
        pose: { position: [0, 1.25, -2], rotation: [0, 0, 0, 1] },
        bounds: { min: [-2, 0, 0], max: [2, 2.5, 0.01] },
      },
      {
        id: "table-1",
        kind: "bounded-object",
        semanticLabel: "table",
        pose: { position: [1, 0.75, 0], rotation: [0, 0, 0, 1] },
        bounds: { min: [-0.6, -0.05, -0.4], max: [0.6, 0.05, 0.4] },
      },
    ],
  });
  // An invalid frame must be rejected before any asset is written.
  for (const invalid of [
    { ...capture, schemaVersion: "999.0.0" },
    { ...capture, coordinateSystem: "left-handed" },
    { ...capture, surfaces: [{ ...capture.surfaces[0], pose: { position: [NaN, 0, 0], rotation: [0, 0, 0, 1] } }] },
    { ...capture, surfaces: [{ ...capture.surfaces[0], mesh: { vertices: [0, 0, 0], indices: [0, 1, 2] } }] },
    { ...capture, surfaces: [capture.surfaces[0], capture.surfaces[0]] },
  ]) {
    let rejected = false;
    try { migrateSpatialCapture(invalid); } catch { rejected = true; }
    assert(rejected, "invalid capture must be rejected");
  }
  const q = new Quaternion().setFromEuler(new Euler(0.4, 0.6, -0.7, "XYZ"));
  const e = quaternionToEuler([q.x, q.y, q.z, q.w]);
  assert(q.angleTo(new Quaternion().setFromEuler(new Euler(...e, "XYZ"))) < 1e-7, "rotation must preserve mixed-axis XYZ orientation");
  const ranked = rankSemanticPrefabs(capture.surfaces[1]!, [
    { id: "chair", name: "chair", semanticLabels: ["chair"], nominalSize: [1.2, 0.1, 0.8] },
    { id: "table", name: "table", semanticLabels: ["TABLE"], nominalSize: [1.4, 0.75, 0.8] },
  ]);
  assert(ranked.length === 1 && ranked[0]?.id === "table", "size must not select a different semantic");
  const position = localOffsetPosition({ ...capture.surfaces[1]!, pose: { position: [3, 2, 1], rotation: [0, 0, 0, 1], scale: [2, 2, 2] } }, [1, -0.5, 0]);
  assert(position.join() === "5,1,1", "local bounds offsets must be scaled and transformed");
  const concave = { ...capture.surfaces[0]!, boundary: { points: [[0,0,0],[2,0,0],[2,0,1],[1,0,1],[1,0,2],[0,0,2]] as [number,number,number][] } };
  const bytes = spatialSurfaceGeometryToGlb(concave, capture)!;
  const view = new DataView(bytes.buffer);
  assert(view.getUint32(0, true) === 0x46546c67 && view.getUint32(8, true) === bytes.length, "valid GLB header");
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)));
  assert(gltf.nodes[0].extras.captureId === capture.captureId, "GLB provenance must survive");
  const binStart = 28 + jsonLength;
  const offset = binStart + gltf.bufferViews[1].byteOffset;
  let area = 0;
  for (let i = 0; i < gltf.accessors[1].count; i += 3) {
    const [a,b,c] = [0,1,2].map(j => concave.boundary.points[view.getUint16(offset + (i+j)*2,true)]!);
    area += Math.abs((b![0]-a![0])*(c![2]-a![2])-(b![2]-a![2])*(c![0]-a![0])) / 2;
  }
  assert(Math.abs(area-3)<1e-8, "concave room area must not be filled across its notch");
  const context: XriftMcpEditorContext = { bundle, sceneSelection: null, assetSelection: null, editorMode: "edit", importBusy: false, revision: 4, saveStatus: "saved" };
  const args = { projectId: bundle.project.projectId, sceneId: bundle.scene.sceneId, expectedRevision: 4, capture, materialAssetId: BUILTIN_ASSET_IDS.material.slate };
  const preview = executeXriftMcpEditorTool(context, { id: "spatial-plan", tool: "plan_spatial_capture", arguments: { capture } });
  assert(!preview.changed && preview.bundle === bundle, "planning must not mutate the project");
  const write = executeXriftMcpEditorTool(context, { id: "spatial-write", tool: "apply_spatial_capture", arguments: args });
  assert(write.changed && write.result.revisionAfter === 5, "MCP placement advances revision");
  let staleRejected = false;
  try { executeXriftMcpEditorTool(context, { id: "stale", tool: "apply_spatial_capture", arguments: { ...args, expectedRevision: 3 } }); } catch { staleRejected = true; }
  assert(staleRejected, "stale MCP writes must be refused");
  const plan = buildSpatialConversionPlan(capture, []);
  assert(plan.length === 2, "capture should produce two conversion actions");
  const applied = applySpatialCaptureToScene(bundle.scene, bundle.assets, capture, {
    materialAssetId: BUILTIN_ASSET_IDS.material.slate,
    rules: [],
  });
  assert(applied.createdEntityIds.length === 2, "capture should create two entities");
  const proxyCapture = createSpatialCapture({
    ...capture,
    surfaces: [capture.surfaces[0]!, {
      ...concave,
      id: "offset-plane",
      pose: { position: [3, 2, 1], rotation: [0, 0, 0, 1], scale: [2, 1, 3] },
      bounds: undefined,
    }],
  });
  const proxies = applySpatialCaptureToScene(bundle.scene, bundle.assets, proxyCapture, { materialAssetId: BUILTIN_ASSET_IDS.material.slate });
  const wall = getTransform(proxies.scene.entities[proxies.createdEntityIds[0]!]!);
  const polygon = getTransform(proxies.scene.entities[proxies.createdEntityIds[1]!]!);
  assert(wall?.scale.join() === "4,2.5,0.01", "bounds-only wall height must not be flattened to the plane normal");
  assert(polygon?.position.join() === "5,2,4", "polygon proxy must use its scaled local centre");
  assert(polygon?.scale.join() === "4,0.01,6", "polygon proxy must retain both in-plane dimensions");
}
