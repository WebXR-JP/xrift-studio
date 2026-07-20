import {
  detectOpenBrushGltfDocument,
  extractOpenBrushMaterialSlots,
  prepareOpenBrushGltfSource,
} from "./open-brush";

export function runOpenBrushFixtureAssertions(): void {
  const document = {
    asset: { version: "2.0", generator: "Open Brush 2.8" },
    extensionsUsed: ["GOOGLE_tilt_brush_material"],
    images: [{ uri: "https://example.invalid/legacy-brush.png" }],
    materials: [
      {
        name: "brush_Light",
        extensions: { GOOGLE_tilt_brush_material: { guid: "fixture" } },
      },
    ],
    meshes: [{ primitives: [{ material: 0 }] }],
  };
  const metadata = detectOpenBrushGltfDocument(document);
  assert(metadata?.renderer === "three-icosa", "OpenBrush renderer was not detected");
  assert(metadata.brushNames[0] === "Light", "Brush name was not normalized");
  const slots = extractOpenBrushMaterialSlots(document);
  assert(slots.length === 1 && slots[0].sourceMaterialIndex === 0,
    "OpenBrush material slot was not extracted");

  const gltfBytes = new TextEncoder().encode(JSON.stringify(document));
  const preparedGltf = prepareOpenBrushGltfSource(gltfBytes, "gltf");
  assert(typeof preparedGltf === "string", "glTF importer source must stay JSON text");
  assert(!preparedGltf.includes("example.invalid"),
    "Legacy brush image URL must not be fetched during import parsing");
  assert(preparedGltf.includes("data:image/png;base64"),
    "Import parser placeholder image is missing");

  const glb = createFixtureGlb(document);
  const preparedGlb = prepareOpenBrushGltfSource(glb, "glb");
  assert(preparedGlb instanceof ArrayBuffer, "GLB importer source must stay binary");
  const preparedBytes = new Uint8Array(preparedGlb);
  const view = new DataView(preparedGlb);
  assert(view.getUint32(8, true) === preparedBytes.byteLength,
    "Sanitized GLB length header is stale");
  const jsonLength = view.getUint32(12, true);
  const json = new TextDecoder().decode(preparedBytes.subarray(20, 20 + jsonLength));
  assert(!json.includes("example.invalid"),
    "Sanitized GLB still contains the legacy image URL");
}

function createFixtureGlb(document: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  bytes.fill(0x20, 20 + json.byteLength);
  return bytes;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
