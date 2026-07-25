import type { AssetManifest, ScriptAsset } from "../asset-manifest";
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  SCRIPT_ASSET_CONTRACT_VERSION,
} from "../asset-manifest";

/**
 * Where Script sources live inside a visual project, and how a new one is
 * created. Kept free of IPC so the path rules can be exercised in fixtures.
 */

export const SCRIPT_DIRECTORY = "scripts";

const SAMPLE_SOURCE = `import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

export default defineScript({
  name: "NAME",
  props: {
    speed: prop.number({ label: "回転速度", default: 1, min: 0, max: 20 }),
    axis: prop.vec3({ label: "回転軸", default: [0, 1, 0] }),
  },
  start(ctx) {
    const axis = new Vector3(...ctx.props.axis).normalize();
    return {
      update(delta) {
        ctx.object3d.rotateOnAxis(axis, ctx.props.speed * delta);
      },
    };
  },
});
`;

export function createScriptSampleSource(name: string): string {
  return SAMPLE_SOURCE.replace("NAME", name.replace(/["\\]/g, ""));
}

/** Project-relative path for a new Script, avoiding collisions by suffixing. */
export function createScriptRelativePath(
  name: string,
  assets: AssetManifest,
): string {
  const stem = toFileStem(name);
  const taken = new Set(
    Object.values(assets.assets)
      .filter((asset): asset is ScriptAsset => asset.kind === "script")
      .map((asset) => asset.source.relativePath),
  );
  let candidate = `${SCRIPT_DIRECTORY}/${stem}.ts`;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${SCRIPT_DIRECTORY}/${stem}-${counter}.ts`;
    counter += 1;
  }
  return candidate;
}

function toFileStem(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "script";
}

export function createScriptAsset(
  id: string,
  name: string,
  relativePath: string,
): ScriptAsset {
  return {
    id,
    name,
    kind: "script",
    status: "ready",
    contractVersion: SCRIPT_ASSET_CONTRACT_VERSION,
    language: "ts",
    source: { kind: "project", relativePath },
  };
}

export function addScriptAsset(
  assets: AssetManifest,
  asset: ScriptAsset,
): AssetManifest {
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    ...(assets.folders ? { folders: assets.folders } : {}),
    assets: { ...assets.assets, [asset.id]: asset },
  };
}

export function listScriptAssets(assets: AssetManifest): ScriptAsset[] {
  return Object.values(assets.assets)
    .filter((asset): asset is ScriptAsset => asset.kind === "script")
    .sort((left, right) => left.name.localeCompare(right.name));
}
