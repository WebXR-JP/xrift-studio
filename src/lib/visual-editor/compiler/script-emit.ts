import scriptApiSource from "../../../../packages/xrift-studio-runtime/src/script/api.ts?raw";
import scriptAudioSource from "../../../../packages/xrift-studio-runtime/src/script/audio-source.tsx?raw";
import scriptHostSource from "../../../../packages/xrift-studio-runtime/src/script/host.tsx?raw";
import scriptLightSource from "../../../../packages/xrift-studio-runtime/src/script/light.tsx?raw";
import scriptLifecycleSource from "../../../../packages/xrift-studio-runtime/src/script/lifecycle.ts?raw";
import scriptInteractionTriggerSource from "../../../../packages/xrift-studio-runtime/src/script/interaction-trigger.ts?raw";
import scriptInteractionTriggerRuntimeSource from "../../../../packages/xrift-studio-runtime/src/script/interaction-trigger-runtime.tsx?raw";
import scriptParticleSource from "../../../../packages/xrift-studio-runtime/src/script/particle.tsx?raw";
import scriptAnimationSource from "../../../../packages/xrift-studio-runtime/src/script/animation.ts?raw";
import scriptAnimationMixerSource from "../../../../packages/xrift-studio-runtime/src/script/animation-mixer.ts?raw";
import sceneRuntimeSource from "../../../../packages/xrift-studio-runtime/src/script/scene-runtime.tsx?raw";
import interactivityGraphSource from "../../../../packages/xrift-studio-runtime/src/interactivity/graph.ts?raw";
import interactivityValueSource from "../../../../packages/xrift-studio-runtime/src/interactivity/value.ts?raw";
import interactivityHostSource from "../../../../packages/xrift-studio-runtime/src/interactivity/host.ts?raw";
import interactivityEngineSource from "../../../../packages/xrift-studio-runtime/src/interactivity/engine.ts?raw";
import textPanelRuntimeSource from "../../../../packages/xrift-studio-runtime/src/script/text-panel.tsx?raw";
import textPanelObjectSource from "../../../../packages/xrift-studio-runtime/src/text-panel.ts?raw";
import textPanelLayoutSource from "../../../../packages/xrift-studio-runtime/src/text-panel-layout.ts?raw";
import textFontCatalogSource from "../../../../packages/xrift-studio-runtime/src/text-font-catalog.ts?raw";
import textRuntimeSource from "../../../../packages/xrift-studio-runtime/src/script/text-runtime.ts?raw";
import troikaTextTypesSource from "../../../../packages/xrift-studio-runtime/src/troika-three-text.d.ts?raw";
import runtimePackageManifest from "../../../../packages/xrift-studio-runtime/package.json";

import type { AssetManifest, ScriptAsset } from "../asset-manifest";
import type { JsonObject, ScriptComponent } from "../scene-document";
import type { ScriptAssetRuntimeDescriptor } from "../scripting/asset-runtime";
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
export const SCRIPT_AUDIO_SOURCE_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/audio-source-runtime.tsx`;
export const SCRIPT_HOST_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/script-host.tsx`;
export const SCRIPT_LIGHT_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/light-runtime.tsx`;
export const SCRIPT_LIFECYCLE_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/script-lifecycle.ts`;
export const SCRIPT_PARTICLE_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/particle-runtime.tsx`;
export const INTERACTION_TRIGGER_MODEL_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/interaction-trigger.ts`;
export const INTERACTION_TRIGGER_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/interaction-trigger-runtime.tsx`;
export const ANIMATION_RUNTIME_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/animation-runtime.ts`;
export const ANIMATION_MIXER_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/animation-mixer-runtime.ts`;
export const SCENE_RUNTIME_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/scene-runtime.tsx`;
export const INTERACTIVITY_GRAPH_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/interactivity-graph.ts`;
export const INTERACTIVITY_VALUE_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/interactivity-value.ts`;
export const INTERACTIVITY_HOST_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/interactivity-host.ts`;
export const INTERACTIVITY_ENGINE_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/interactivity-engine.ts`;
export const TEXT_PANEL_RUNTIME_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/text-panel-runtime.tsx`;
export const TEXT_RUNTIME_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/text-runtime.ts`;
export const TEXT_PANEL_OBJECT_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/text-panel.ts`;
export const TEXT_PANEL_LAYOUT_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/text-panel-layout.ts`;
export const TEXT_FONT_CATALOG_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/text-font-catalog.ts`;
export const TEXT_PANEL_TYPES_OVERLAY_PATH = `${SCRIPT_RUNTIME_DIRECTORY}/troika-three-text.d.ts`;

/**
 * npm spec installed into a staged Classic project that contains Text.
 *
 * The emitted panel builds troika's SDF `Text` itself instead of going through
 * drei, so the dependency has to be declared rather than inherited. Read from
 * the runtime package's own manifest so the staged world can never be built
 * against a different troika than the one Studio renders with.
 */
export const TEXT_PANEL_RUNTIME_PACKAGE = `troika-three-text@${runtimePackageManifest.dependencies["troika-three-text"]}`;


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
        ...createScriptAudioSourceOverlayFile(),
      },
      {
        ...createScriptLightOverlayFile(),
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

export function createScriptAudioSourceOverlayFile(): CompilerOverlayFile {
  return {
    relativePath: SCRIPT_AUDIO_SOURCE_OVERLAY_PATH,
    content: scriptAudioSource,
    kind: "source",
    owner: "xrift-studio-compiler",
  };
}

/**
 * The Text panel's runtime, emitted as a flat set of modules.
 *
 * The published world draws captions through the same object Studio does, so a
 * plate cannot be measured one way in the editor and another way once the world
 * is built. The runtime package writes `./x.js` specifiers for NodeNext
 * resolution; the staged project is a bundler-mode TypeScript project, so those
 * are rewritten to extensionless siblings in one flat directory.
 */
export function createTextPanelOverlayFiles(): CompilerOverlayFile[] {
  return [
    overlay(TEXT_PANEL_RUNTIME_OVERLAY_PATH, rewriteTextPanelImports(textPanelRuntimeSource)),
    overlay(TEXT_PANEL_OBJECT_OVERLAY_PATH, rewriteTextPanelImports(textPanelObjectSource)),
    overlay(TEXT_PANEL_LAYOUT_OVERLAY_PATH, rewriteTextPanelImports(textPanelLayoutSource)),
    overlay(TEXT_FONT_CATALOG_OVERLAY_PATH, rewriteTextPanelImports(textFontCatalogSource)),
    // The panel's runtime override bridge: a behavior graph re-letters a sign
    // through it, so it ships wherever the panel does.
    overlay(TEXT_RUNTIME_OVERLAY_PATH, rewriteTextPanelImports(textRuntimeSource)),
    // troika ships no types, so the staged project needs the same ambient
    // declaration Studio compiles against or `tsc` rejects the panel source.
    overlay(TEXT_PANEL_TYPES_OVERLAY_PATH, troikaTextTypesSource),
  ];
}

function overlay(relativePath: string, content: string): CompilerOverlayFile {
  return { relativePath, content, kind: "source", owner: "xrift-studio-compiler" };
}

function rewriteTextPanelImports(source: string): string {
  return source.replace(
    /(\bfrom\s*)(["'])\.{1,2}\/(text-panel|text-panel-layout|text-font-catalog|text-runtime)\.js\2/g,
    (_whole, prefix: string, quote: string, moduleName: string) =>
      `${prefix}${quote}./${moduleName}${quote}`,
  );
}

/**
 * The Interaction Trigger runtime, plus the graph model it reads.
 *
 * Emitted as the same source Studio Play imports, for the same reason the Audio
 * Source and Light runtimes are: a published trigger that behaved differently
 * from the one the author tested would make Play useless for behavior.
 */
export function createInteractionTriggerOverlayFiles(): CompilerOverlayFile[] {
  return [
    ...createInteractivityRuntimeOverlayFiles(),
    {
      relativePath: INTERACTION_TRIGGER_MODEL_OVERLAY_PATH,
      content: scriptInteractionTriggerSource,
      kind: "source",
      owner: "xrift-studio-compiler",
    },
    {
      relativePath: INTERACTION_TRIGGER_OVERLAY_PATH,
      content: rewriteRuntimeLocalImports(scriptInteractionTriggerRuntimeSource),
      kind: "source",
      owner: "xrift-studio-compiler",
    },
  ];
}

export function createScriptLightOverlayFile(): CompilerOverlayFile {
  return {
    relativePath: SCRIPT_LIGHT_OVERLAY_PATH,
    content: scriptLightSource,
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
/**
 * Overlay file names, keyed by the module name the runtime package uses.
 *
 * The package resolves siblings as `./x.js` and the interpreter as
 * `../interactivity/x.js`; a staged project has neither layout, so every local
 * specifier is rewritten to the flat overlay it was emitted as. The two tables
 * are separate because `host` means one thing beside a Script and another
 * beside the interpreter.
 */
const RUNTIME_SIBLING_OVERLAY_MODULES: Readonly<Record<string, string>> = {
  api: "script-api",
  "audio-source": "audio-source-runtime",
  light: "light-runtime",
  lifecycle: "script-lifecycle",
  particle: "particle-runtime",
  "interaction-trigger": "interaction-trigger",
  animation: "animation-runtime",
  "animation-mixer": "animation-mixer-runtime",
  "scene-runtime": "scene-runtime",
  "text-runtime": "text-runtime",
  host: "script-host",
};

const INTERACTIVITY_OVERLAY_MODULES: Readonly<Record<string, string>> = {
  graph: "interactivity-graph",
  value: "interactivity-value",
  host: "interactivity-host",
  engine: "interactivity-engine",
};

/**
 * Rewrites a runtime module's local imports to the flat overlay names.
 *
 * `scope` says which directory the file came from, because a sibling `host.js`
 * means the Script host beside a Script module and the interpreter's host
 * beside the interpreter. Guessing from the name alone silently emitted the
 * wrong module.
 */
export function rewriteRuntimeLocalImports(
  source: string,
  scope: "script" | "interactivity" = "script",
): string {
  const siblings =
    scope === "interactivity"
      ? INTERACTIVITY_OVERLAY_MODULES
      : RUNTIME_SIBLING_OVERLAY_MODULES;
  return source.replace(
    /(\bfrom\s*)(["'])(\.{1,2}\/)((?:interactivity|script)\/)?([a-z-]+)\.js\2/g,
    (
      whole,
      prefix: string,
      quote: string,
      _relative: string,
      directory: string | undefined,
      moduleName: string,
    ) => {
      // A named directory answers for itself; only a bare sibling depends on
      // where the file being rewritten came from.
      const overlay =
        directory === "interactivity/"
          ? INTERACTIVITY_OVERLAY_MODULES[moduleName]
          : directory === "script/"
            ? RUNTIME_SIBLING_OVERLAY_MODULES[moduleName]
            : siblings[moduleName];
      return overlay ? `${prefix}${quote}./${overlay}${quote}` : whole;
    },
  );
}

/**
 * The interpreter and the Animation bridge, for a world that carries a graph.
 *
 * Emitted as the same source Studio Play imports so a published graph waits,
 * repeats and animates exactly as the author saw it.
 */
export function createInteractivityRuntimeOverlayFiles(): CompilerOverlayFile[] {
  const entries: readonly [string, string, "script" | "interactivity"][] = [
    [INTERACTIVITY_GRAPH_OVERLAY_PATH, interactivityGraphSource, "interactivity"],
    [INTERACTIVITY_VALUE_OVERLAY_PATH, interactivityValueSource, "interactivity"],
    [INTERACTIVITY_HOST_OVERLAY_PATH, interactivityHostSource, "interactivity"],
    [INTERACTIVITY_ENGINE_OVERLAY_PATH, interactivityEngineSource, "interactivity"],
    [ANIMATION_RUNTIME_OVERLAY_PATH, scriptAnimationSource, "script"],
    [ANIMATION_MIXER_OVERLAY_PATH, scriptAnimationMixerSource, "script"],
    [SCENE_RUNTIME_OVERLAY_PATH, sceneRuntimeSource, "script"],
  ];
  return entries.map(([relativePath, content, scope]) => ({
    relativePath,
    content: rewriteRuntimeLocalImports(content, scope),
    kind: "source" as const,
    owner: "xrift-studio-compiler" as const,
  }));
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
  assetRuntimeDescriptors: Readonly<
    Record<string, ScriptAssetRuntimeDescriptor>
  > = {},
): string {
  const assetDescriptors = serializeAssetDescriptorRecord(
    assetRuntimeDescriptors,
  );
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
    `  resolveAsset={(assetId) => (${assetDescriptors} as Record<string, { url: string }>)[assetId] ?? null}`,
    `  resolveAssetUrl={(assetId) => (${assetDescriptors} as Record<string, { url: string }>)[assetId]?.url ?? null}`,
    `/>`,
  ].join("\n");
}

/** Stable key order so two compiles of the same document are byte-identical. */
function serializeProperties(properties: JsonObject): string {
  return JSON.stringify(sortJson(properties));
}

function serializeAssetDescriptorRecord(
  value: Readonly<Record<string, ScriptAssetRuntimeDescriptor>>,
): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([assetId, descriptor]) => [
          assetId,
          {
            url: descriptor.url,
            ...(descriptor.textureDefaults
              ? {
                  textureDefaults: {
                    ...(descriptor.textureDefaults.colorSpace !== undefined
                      ? {
                          colorSpace:
                            descriptor.textureDefaults.colorSpace,
                        }
                      : {}),
                    ...(descriptor.textureDefaults.wrapS !== undefined
                      ? { wrapS: descriptor.textureDefaults.wrapS }
                      : {}),
                    ...(descriptor.textureDefaults.wrapT !== undefined
                      ? { wrapT: descriptor.textureDefaults.wrapT }
                      : {}),
                    ...(descriptor.textureDefaults.magFilter !== undefined
                      ? {
                          magFilter:
                            descriptor.textureDefaults.magFilter,
                        }
                      : {}),
                    ...(descriptor.textureDefaults.minFilter !== undefined
                      ? {
                          minFilter:
                            descriptor.textureDefaults.minFilter,
                        }
                      : {}),
                    ...(descriptor.textureDefaults.flipY !== undefined
                      ? { flipY: descriptor.textureDefaults.flipY }
                      : {}),
                    ...(descriptor.textureDefaults.generateMipmaps !==
                    undefined
                      ? {
                          generateMipmaps:
                            descriptor.textureDefaults.generateMipmaps,
                        }
                      : {}),
                  },
                }
              : {}),
          },
        ]),
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
