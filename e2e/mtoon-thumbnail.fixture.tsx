import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
import { MaterialThumbnail } from "../src/components/visual-editor/AssetQuickEditor";
import { MaterialThumbnailGenerationQueue } from "../src/components/visual-editor/MaterialThumbnailGenerationQueue";
import { createDefaultMaterialAsset, ASSET_MANIFEST_SCHEMA_VERSION, type AssetManifest, type AssetThumbnailDescriptor, type MaterialAsset } from "../src/lib/visual-editor/asset-manifest";
import { createMaterialThumbnailSourceHash, materialThumbnailDerivedPath, materialThumbnailNeedsRefresh } from "../src/lib/visual-editor/material-thumbnail";
import { tauri } from "../src/lib/tauri";
import "../src/index.css";

type ThumbnailMetadata = {
  legacy: boolean;
  geometry: unknown;
  baseColor: number[];
  shadeColor: number[];
  lights: Array<{ type: string; intensity: number; position: number[] }>;
};

let root: Root | undefined;
const metadata = new Map<string, ThumbnailMetadata>();
const captures = new Map<string, string>();
const cachedResults = new Map<string, { thumbnail: AssetThumbnailDescriptor; propertiesUnchanged: boolean; needsRefresh: boolean }>();
const cacheFailures: string[] = [];
let cacheWriteCount = 0;
let queueManifest: AssetManifest;
const originalCommit = tauri.commitVisualAssetImport;
const originalBeforeRender = THREE.Mesh.prototype.onBeforeRender;
THREE.Mesh.prototype.onBeforeRender = function (renderer, scene, camera, geometry, inputMaterial, group) {
  const lights: ThumbnailMetadata["lights"] = [];
  scene.traverse(object => {
    if (object instanceof THREE.Light) lights.push({ type: object.type, intensity: object.intensity, position: object.position.toArray() });
  });
  if (geometry.type === "SphereGeometry") {
    const material = inputMaterial as THREE.Material & {
      isMToonMaterial?: boolean; isOutline?: boolean; v0CompatShade?: boolean;
      color?: THREE.Color; shadeColorFactor?: THREE.Color;
    };
    if (material.isMToonMaterial && !material.isOutline && material.color && material.shadeColorFactor) {
      const legacy = material.v0CompatShade === true;
      const shade = material.shadeColorFactor.toArray();
      metadata.set(`${legacy ? "0.x" : "1.0"}-${shade[0]! > shade[2]! ? "red" : "blue"}`, {
        legacy, geometry: { ...(geometry as THREE.SphereGeometry).parameters }, baseColor: material.color.toArray(), shadeColor: shade, lights,
      });
    }
  }
  return originalBeforeRender.call(this, renderer, scene, camera, geometry, inputMaterial, group);
};

function material(version: "0.x" | "1.0", shade: "red" | "blue"): MaterialAsset {
  return createDefaultMaterialAsset({
    id: `${version}-${shade}`, name: `MToon ${version} / ${shade === "red" ? "赤い影" : "青い影"}`,
    properties: {
      pbrMetallicRoughness: { baseColorFactor: [.65, .65, .65, 1] },
      emissiveFactor: [0, 0, 0],
      extensions: { VRMC_materials_mtoon: {
        shadeColorFactor: shade === "red" ? [.65, .025, .025] : [.025, .025, .65],
        shadingShiftFactor: 0, shadingToonyFactor: .9, giEqualizationFactor: .9,
        outlineWidthMode: "none", extras: { xriftVrm0CompatShade: version === "0.x" },
      } },
    },
  })!;
}

function Preview({ asset }: { asset: MaterialAsset }) {
  const [capture, setCapture] = useState<string>();
  return <section aria-label={asset.name} style={{ width: 240 }}>
    <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{asset.name}</h2>
    <div style={{ width: 240, height: 240, border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
      {capture ? <img src={capture} alt={asset.name} style={{ width: "100%", height: "100%" }} /> :
        <MaterialThumbnail asset={asset} captureKey={asset.id}
          onCapture={dataUrl => { captures.set(asset.id, dataUrl); setCapture(dataUrl); }} />}
    </div>
  </section>;
}

export function mountThumbnailPreviews(single = false) {
  root?.unmount(); captures.clear(); metadata.clear();
  tauri.commitVisualAssetImport = originalCommit;
  const host = document.getElementById("root")!;
  root = createRoot(host);
  root.render(<main style={{ padding: 24, fontFamily: "sans-serif", background: "white", minHeight: "100vh" }}>
    <h1 style={{ fontSize: 22, margin: "0 0 20px" }}>Directional LightでMToonの明るい面と影を確認</h1>
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
      {(single ? [material("1.0", "blue")] : (["0.x", "1.0"] as const).flatMap(version => (["red", "blue"] as const).map(shade => material(version, shade))))
        .map(asset => <Preview key={asset.id} asset={asset} />)}
    </div>
  </main>);
}

function CachedThumbnailPreviews() {
  const [assets, setAssets] = useState(queueManifest);
  return <main style={{ padding: 24 }}>
    <h1>保存済みMToonプレビューの再生成</h1>
    <MaterialThumbnailGenerationQueue assets={assets} enabled projectPath="isolated-thumbnail-cache-fixture"
      onFailed={(_id, message) => cacheFailures.push(message)}
      onGenerated={(id, thumbnail) => {
        setAssets(current => {
          const source = current.assets[id] as MaterialAsset;
          const updated = { ...source, thumbnail };
          cachedResults.set(id, { thumbnail, propertiesUnchanged: JSON.stringify(source.properties) === JSON.stringify(queueManifest.assets[id]?.kind === "material" ? queueManifest.assets[id].properties : undefined),
            needsRefresh: materialThumbnailNeedsRefresh(updated, thumbnail.status === "missing" ? "" : thumbnail.sourceHash) });
          return { ...current, assets: { ...current.assets, [id]: updated } };
        });
      }} />
    <div style={{ display: "flex", gap: 20 }}>
      {[...cachedResults.keys()].map(id => <section key={id} aria-label={id}>
        <h2>{id}</h2><img src={captures.get(id)} alt={id} width={320} height={240} />
      </section>)}
    </div>
  </main>;
}

/** Keep the actual queue and renderer; record its isolated IPC write in memory. */
export async function mountCachedThumbnailPreviews() {
  root?.unmount(); captures.clear(); metadata.clear(); cachedResults.clear(); cacheFailures.length = 0; cacheWriteCount = 0;
  queueManifest = { schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, assets: Object.fromEntries((["0.x", "1.0"] as const).map(version => {
    const asset = material(version, "blue"); return [asset.id, asset];
  })) };
  for (const asset of Object.values(queueManifest.assets) as MaterialAsset[]) {
    asset.thumbnail = { status: "generated", derivedPath: `assets/.derived/${asset.id}-old.webp`,
      sourceHash: await createMaterialThumbnailSourceHash(asset, queueManifest), rendererVersion: "xrift-studio-material-thumbnail@1" };
  }
  tauri.commitVisualAssetImport = async (_projectPath, _transactionId, writes) => {
    cacheWriteCount++;
    for (const write of writes) {
      const id = Object.keys(queueManifest.assets).find(value => {
        const thumbnail = queueManifest.assets[value]!.thumbnail;
        return thumbnail && thumbnail.status !== "missing" && write.relativePath === materialThumbnailDerivedPath(value, thumbnail.sourceHash, write.dataUrl.startsWith("data:image/webp;") ? "webp" : "png");
      });
      if (id) captures.set(id, write.dataUrl);
    }
  };
  root = createRoot(document.getElementById("root")!);
  root.render(<CachedThumbnailPreviews />);
}

export function readCachedThumbnailResults() {
  return { writes: cacheWriteCount, failures: cacheFailures, results: [...cachedResults.entries()] };
}

export async function readThumbnailShadeContrast() {
  const pixels = async (id: string) => {
    const image = new Image(); image.src = captures.get(id)!; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
  };
  return Promise.all((["0.x", "1.0"] as const).map(async version => {
    const [red, blue] = await Promise.all([pixels(`${version}-red`), pixels(`${version}-blue`)]);
    let samples = 0, coloredShade = 0, stableLit = 0, delta = 0;
    for (let y = Math.floor(red.height * .1); y < red.height * .75; y++) {
      for (let x = Math.floor(red.width * .15); x < red.width * .85; x++) {
        const index = (y * red.width + x) * 4;
        const r = red.data[index]!, g = red.data[index + 1]!, b = red.data[index + 2]!;
        const otherR = blue.data[index]!, otherG = blue.data[index + 1]!, otherB = blue.data[index + 2]!;
        const difference = (Math.abs(r - otherR) + Math.abs(g - otherG) + Math.abs(b - otherB)) / 3;
        if (r - b > 20 && r - g > 20 && otherB - otherR > 20 && otherB - otherG > 20) coloredShade++;
        if (difference < 6 && Math.min(r, g, b) > 90) stableLit++;
        delta += difference; samples++;
      }
    }
    return { version, coloredShadeRatio: coloredShade / samples, stableLitRatio: stableLit / samples,
      meanDifference: delta / samples, red: metadata.get(`${version}-red`), blue: metadata.get(`${version}-blue`) };
  }));
}
