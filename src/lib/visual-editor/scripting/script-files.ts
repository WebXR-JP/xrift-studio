import type {
  AssetManifest,
  ScriptAsset,
  ScriptAssetLanguage,
} from "../asset-manifest";
import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  SCRIPT_ASSET_CONTRACT_VERSION,
} from "../asset-manifest";
import {
  createScriptTemplateSource,
  DEFAULT_SCRIPT_TEMPLATE_ID,
} from "./script-templates";

/**
 * Where Script sources live inside a visual project, and how a new one is
 * created. Kept free of IPC so the path rules can be exercised in fixtures.
 */

export const SCRIPT_DIRECTORY = "scripts";

export function createScriptSampleSource(name: string): string {
  return (
    createScriptTemplateSource(DEFAULT_SCRIPT_TEMPLATE_ID, name) ??
    'import { defineScript } from "xrift:script";\nexport default defineScript({ name: "Script" });\n'
  );
}

/** Project-relative path for a new Script, avoiding collisions by suffixing. */
export function createScriptRelativePath(
  name: string,
  assets: AssetManifest,
  reservedPaths: Iterable<string> = [],
  language: ScriptAssetLanguage = "ts",
): string {
  const stem = toFileStem(name);
  const taken = new Set(
    [
      ...Object.values(assets.assets)
        .filter((asset): asset is ScriptAsset => asset.kind === "script")
        .map((asset) => asset.source.relativePath),
      ...reservedPaths,
    ],
  );
  let candidate = `${SCRIPT_DIRECTORY}/${stem}.${language}`;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${SCRIPT_DIRECTORY}/${stem}-${counter}.${language}`;
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
  folderId: string | null = null,
  language: ScriptAssetLanguage = "ts",
): ScriptAsset {
  return {
    id,
    name,
    kind: "script",
    status: "ready",
    folderId,
    contractVersion: SCRIPT_ASSET_CONTRACT_VERSION,
    language,
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
