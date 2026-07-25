import scriptApiSource from "../../../../packages/xrift-studio-runtime/src/script/api.ts?raw";
import scriptHostSource from "../../../../packages/xrift-studio-runtime/src/script/host.tsx?raw";
import scriptLifecycleSource from "../../../../packages/xrift-studio-runtime/src/script/lifecycle.ts?raw";
import scriptParticleSource from "../../../../packages/xrift-studio-runtime/src/script/particle.tsx?raw";

import type { AssetManifest, ScriptAsset } from "../asset-manifest";
import type { JsonObject, ScriptComponent } from "../scene-document";
import { stripCommentsAndStrings } from "../scripting/script-contract";
import {
  collectDynamicScriptImports,
  collectScriptSpecifiers,
  collectUnsupportedUseFrameImports,
  isAllowedScriptSpecifier,
  isRelativeScriptSpecifier,
  isRemoteScriptSpecifier,
  rewriteScriptSpecifiers,
} from "../scripting/specifiers";
import { sha256Utf8 } from "./hash";
import type { CompilerDiagnostic, CompilerOverlayFile } from "./types";

/**
 * Emits Script Assets into the staging project.
 *
 * The published world only ever contains static imports: the authoring API and
 * host are inlined from the runtime package as overlay source, and each script
 * becomes its own module that the generated entry imports by name. No `eval`,
 * no `Function`, no dynamic import reaches generated code.
 * See docs/SCRIPTING.md and VISUAL_EDITOR_ARCHITECTURE.md 4.8.
 */

export const SCRIPT_RUNTIME_DIRECTORY = "src/xrift-studio";
export const SCRIPT_MODULE_DIRECTORY = "src/scripts";

export const SCRIPT_API_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/script-api.ts`;
export const SCRIPT_HOST_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/script-host.tsx`;
export const SCRIPT_LIFECYCLE_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/script-lifecycle.ts`;
export const SCRIPT_PARTICLE_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/particle-runtime.tsx`;

export type EmittedScriptModule = {
  assetId: string;
  /** Identifier used in the generated entry file. */
  importName: string;
  /** Identifier for an optional named `Render` export. */
  renderImportName?: string;
  /** Path relative to the staging project root. */
  relativePath: string;
  /** Import specifier used from the generated entry file. */
  importSpecifier: string;
};

export type ScriptEmitPlan = {
  modules: Map<string, EmittedScriptModule>;
  overlayFiles: CompilerOverlayFile[];
};

/**
 * Rewrites `xrift:script` to the emitted API module and rejects anything the
 * published build could not resolve. Remote modules are rejected here rather
 * than shipping a world that fails to build, or worse, builds and fetches at
 * runtime.
 */
export function planScriptEmission(
  scriptAssetIds: readonly string[],
  assets: AssetManifest,
  readSource: (asset: ScriptAsset) => string | null,
  diagnostics: CompilerDiagnostic[],
): ScriptEmitPlan {
  const modules = new Map<string, EmittedScriptModule>();
  const overlayFiles: CompilerOverlayFile[] = [];
  if (scriptAssetIds.length === 0) return { modules, overlayFiles };

  const usedNames = new Set<string>();
  // Sorted so the emitted file set and import order are input-order-independent.
  for (const assetId of [...scriptAssetIds].sort()) {
    const asset = assets.assets[assetId];
    if (!asset || asset.kind !== "script") {
      diagnostics.push({
        severity: "blocking",
        code: "script-asset-missing",
        message: "Script Componentが参照するScript Assetがありません",
        assetId,
      });
      continue;
    }
    const source = readSource(asset);
    if (source === null) {
      diagnostics.push({
        severity: "blocking",
        code: "script-source-unreadable",
        message: `Script source を読み込めませんでした: ${asset.source.relativePath}`,
        assetId,
      });
      continue;
    }

    const rejected = collectRejectedSpecifiers(source);
    if (rejected.length > 0) {
      for (const entry of rejected) {
        diagnostics.push({
          severity: "blocking",
          code:
            entry.reason === "remote"
              ? "script-remote-import-unsupported"
              : entry.reason === "dynamic"
                ? "script-dynamic-import-unsupported"
                : entry.reason === "frame-hook"
                  ? "script-use-frame-unsupported"
                  : "script-import-unsupported",
          message:
            entry.reason === "remote"
              ? `${entry.specifier} はネットワークからのmoduleです。公開ワールドへは出力できません。`
              : entry.reason === "dynamic"
                ? "動的 import(...) はPlayと公開で使用できません。許可されたmoduleを静的importしてください。"
                : entry.reason === "frame-hook"
                  ? "useFrameなどR3F frame callback APIはScript単位で例外を隔離できません。defineScript(...).start()が返すupdate(delta)を使用し、@react-three/fiberはnamed importしてください。"
                  : `${entry.specifier} は公開ワールドで解決できないmoduleです。`,
          assetId,
        });
      }
      continue;
    }

    const importName = uniqueImportName(asset, usedNames);
    const renderImportName = exportsScriptRender(source)
      ? uniqueIdentifier(`${importName}Render`, asset.id, usedNames)
      : undefined;
    const fileStem = importName;
    const extension = asset.language === "tsx" ? "tsx" : "ts";
    const relativePath = `${SCRIPT_MODULE_DIRECTORY}/${fileStem}.${extension}`;
    modules.set(assetId, {
      assetId,
      importName,
      ...(renderImportName ? { renderImportName } : {}),
      relativePath,
      importSpecifier: `./scripts/${fileStem}`,
    });
    overlayFiles.push({
      relativePath,
      content: rewriteScriptApiImports(source),
      kind: "source",
      owner: "xrift-studio-compiler",
    });
  }

  if (modules.size > 0) {
    overlayFiles.push(
      {
        relativePath: SCRIPT_API_OVERLAY_PATH,
        content: scriptApiSource,
        kind: "source",
        owner: "xrift-studio-compiler",
      },
      {
        relativePath: SCRIPT_LIFECYCLE_OVERLAY_PATH,
        content: rewriteRuntimeLocalImports(scriptLifecycleSource),
        kind: "source",
        owner: "xrift-studio-compiler",
      },
      {
        ...createScriptParticleOverlayFile(),
      },
      {
        relativePath: SCRIPT_HOST_OVERLAY_PATH,
        content: rewriteRuntimeLocalImports(scriptHostSource),
        kind: "source",
        owner: "xrift-studio-compiler",
      },
    );
  }

  return { modules, overlayFiles };
}

export function createScriptParticleOverlayFile(): CompilerOverlayFile {
  return {
    relativePath: SCRIPT_PARTICLE_OVERLAY_PATH,
    content: scriptParticleSource,
    kind: "source",
    owner: "xrift-studio-compiler",
  };
}

type RejectedSpecifier = {
  specifier: string;
  reason: "remote" | "dynamic" | "frame-hook" | "unsupported";
};

function collectRejectedSpecifiers(source: string): RejectedSpecifier[] {
  const rejected: RejectedSpecifier[] = [];
  if (collectUnsupportedUseFrameImports(source).length > 0) {
    rejected.push({ specifier: "useFrame", reason: "frame-hook" });
  }
  if (collectDynamicScriptImports(source).length > 0) {
    rejected.push({ specifier: "import(...)", reason: "dynamic" });
  }
  const seen = new Set<string>();
  for (const use of collectScriptSpecifiers(source)) {
    if (seen.has(use.specifier)) continue;
    seen.add(use.specifier);
    if (isAllowedScriptSpecifier(use.specifier)) continue;
    if (isRemoteScriptSpecifier(use.specifier)) {
      rejected.push({ specifier: use.specifier, reason: "remote" });
      continue;
    }
    if (isRelativeScriptSpecifier(use.specifier)) {
      rejected.push({ specifier: use.specifier, reason: "unsupported" });
      continue;
    }
    rejected.push({ specifier: use.specifier, reason: "unsupported" });
  }
  return rejected;
}

/** `xrift:script` only exists inside Studio; the staging build needs a path. */
function rewriteScriptApiImports(source: string): string {
  return rewriteScriptSpecifiers(source, (specifier) => ({
    kind: "resolved",
    url:
      specifier === "xrift:script"
        ? "../xrift-studio/script-api"
        : specifier,
  })).source;
}

/** Runtime overlays import sibling package modules by package-relative paths. */
function rewriteRuntimeLocalImports(source: string): string {
  return source.replace(
    /(\bfrom\s*)(["'])\.\/(api|lifecycle|particle)\.js\2/g,
    (_whole, prefix: string, quote: string, moduleName: string) =>
      `${prefix}${quote}./${
        moduleName === "api"
          ? "script-api"
          : moduleName === "lifecycle"
            ? "script-lifecycle"
            : "particle-runtime"
      }${quote}`,
  );
}

function uniqueImportName(asset: ScriptAsset, used: Set<string>): string {
  const base = toIdentifier(asset.name) || "Script";
  return uniqueIdentifier(base, asset.id, used);
}

function uniqueIdentifier(base: string, seed: string, used: Set<string>): string {
  let candidate = base;
  if (used.has(candidate)) {
    // Hash-derived rather than a counter so the name does not depend on the
    // order assets happen to be enumerated in.
    candidate = `${base}_${sha256Utf8(seed).slice(0, 8)}`;
  }
  used.add(candidate);
  return candidate;
}

function exportsScriptRender(source: string): boolean {
  const stripped = stripCommentsAndStrings(source);
  if (
    /\bexport\s+(?:(?:const|let|var|class)\s+Render\b|(?:async\s+)?function\s*\*?\s*Render\b)/.test(
      stripped,
    )
  ) {
    return true;
  }
  for (const match of stripped.matchAll(/\bexport\s*\{([^}]*)\}/gs)) {
    const entries = (match[1] ?? "").split(",").map((entry) => entry.trim());
    if (
      entries.some(
        (entry) => entry === "Render" || /\bas\s+Render$/.test(entry),
      )
    ) {
      return true;
    }
  }
  return false;
}

function toIdentifier(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z]/.test(cleaned) ? cleaned : "";
}

/** JSX for one Script Component on an Entity. */
export function renderScriptComponent(
  component: ScriptComponent,
  module: EmittedScriptModule,
  entityId: string,
  entityName: string,
  order: number,
  assetRuntimeUrls: Readonly<Record<string, string>> = {},
): string {
  const assetUrls = serializeStringRecord(assetRuntimeUrls);
  return [
    `<XriftScriptHost`,
    `  script={${module.importName}}`,
    ...(module.renderImportName
      ? [`  render={${module.renderImportName}}`]
      : []),
    `  properties={${serializeProperties(component.properties)}}`,
    `  entityId=${JSON.stringify(entityId)}`,
    `  entityName=${JSON.stringify(entityName)}`,
    `  componentId=${JSON.stringify(component.id)}`,
    `  order={${order}}`,
    `  assetReferences={${JSON.stringify([...component.assetReferences].sort())}}`,
    `  entityReferences={${JSON.stringify([...component.entityReferences].sort())}}`,
    `  resolveAssetUrl={(assetId) => (${assetUrls} as Record<string, string>)[assetId] ?? null}`,
    `/>`,
  ].join("\n");
}

/** Stable key order so two compiles of the same document are byte-identical. */
function serializeProperties(properties: JsonObject): string {
  return JSON.stringify(sortJson(properties));
}

function serializeStringRecord(value: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
}
