import * as THREE from "three";
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as Fiber from "@react-three/fiber";
import * as Drei from "@react-three/drei";
import * as Rapier from "@react-three/rapier";
import * as XriftWorldComponents from "@xrift/world-components";
import * as XriftScript from "../../packages/xrift-studio-runtime/src/script/api";

import { transpileTypeScriptModule } from "./monaco";
import { createScriptModuleBridgeSource } from "./script-module-bridge";
import {
  collectDynamicScriptImports,
  collectUnsupportedUseFrameImports,
  isAllowedScriptSpecifier,
  isRelativeScriptSpecifier,
  isRemoteScriptSpecifier,
  rewriteScriptSpecifiers,
  type ScriptSpecifierRejection,
  type ScriptSpecifierResolution,
} from "./visual-editor/scripting/specifiers";

/**
 * Evaluates Script Assets inside Play.
 *
 * Bare specifiers are rewritten to blob modules that re-export the instances
 * this app already holds, so a script shares one three.js with the viewport.
 * Pulling a second copy would break `instanceof` and R3F reconciliation.
 *
 * This is the one place the architecture permits dynamic evaluation, and only
 * of project script files. See docs/SCRIPTING.md.
 */

const LIVE_MODULES: Record<string, Record<string, unknown>> = {
  "xrift:script": XriftScript as unknown as Record<string, unknown>,
  three: THREE as unknown as Record<string, unknown>,
  react: React as unknown as Record<string, unknown>,
  "react/jsx-runtime": ReactJsxRuntime as unknown as Record<string, unknown>,
  "@react-three/fiber": Fiber as unknown as Record<string, unknown>,
  "@react-three/drei": Drei as unknown as Record<string, unknown>,
  "@react-three/rapier": Rapier as unknown as Record<string, unknown>,
  "@xrift/world-components":
    XriftWorldComponents as unknown as Record<string, unknown>,
};

const REGISTRY_GLOBAL = "__xriftScriptModules__";

const bridgeUrls = new Map<string, string>();
const createdUrls = new Set<string>();
const MAX_TRANSPILED_SCRIPT_CACHE_ENTRIES = 128;
const TRANSPILED_SCRIPT_CACHE_VERSION = 1;
const transpiledScriptCache = new Map<string, string>();
let transpiledScriptCacheHits = 0;
let transpiledScriptCacheMisses = 0;

function ensureRegistry(): Record<string, Record<string, unknown>> {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (!scope[REGISTRY_GLOBAL]) scope[REGISTRY_GLOBAL] = LIVE_MODULES;
  return scope[REGISTRY_GLOBAL] as Record<string, Record<string, unknown>>;
}

/**
 * Builds one blob module per allowed specifier that re-exports the live
 * namespace by name, so `import { Vector3 } from "three"` binds to the same
 * class the viewport uses.
 */
function bridgeUrlFor(specifier: string): string | null {
  const cached = bridgeUrls.get(specifier);
  if (cached) return cached;
  const namespace = ensureRegistry()[specifier];
  if (!namespace) return null;
  const url = URL.createObjectURL(
    new Blob(
      [createScriptModuleBridgeSource(REGISTRY_GLOBAL, specifier, namespace)],
      { type: "text/javascript" },
    ),
  );
  bridgeUrls.set(specifier, url);
  createdUrls.add(url);
  return url;
}

/**
 * Shadows ambient authority inside the module scope.
 *
 * Same-realm execution means a determined script can still reach these, so
 * this stops accidents and naive misuse, not an attacker. The limit is stated
 * in docs/SCRIPTING.md and must not be described as a sandbox.
 */
const SHADOWED_GLOBALS = [
  "window",
  "globalThis",
  "self",
  "document",
  "fetch",
  "XMLHttpRequest",
  "Function",
  "importScripts",
  "__TAURI__",
  "__TAURI_INTERNALS__",
];

function shadowPrelude(): string {
  // ECMAScript modules are always strict mode, where binding `eval` is a
  // syntax error. It cannot be shadowed with a lexical declaration; the
  // same-realm limitation is documented and this prelude only blocks
  // accidental ambient access.
  return `const {${SHADOWED_GLOBALS.join(", ")}} = {};\n`;
}

export type ScriptModuleLoadOptions = {
  allowRemoteModules?: boolean;
};

export type ScriptModuleLoadResult =
  | { ok: true; module: Record<string, unknown>; objectUrl: string }
  | { ok: false; message: string };

export type ScriptTranspileCacheStats = {
  hits: number;
  misses: number;
  size: number;
};

export async function loadScriptModule(
  source: string,
  fileName: string,
  options: ScriptModuleLoadOptions = {},
): Promise<ScriptModuleLoadResult> {
  if (collectUnsupportedUseFrameImports(source).length > 0) {
    return {
      ok: false,
      message:
        "ScriptではuseFrameなどR3F frame callback APIを使用できません。フレーム更新はdefineScript(...).start()が返すupdate(delta)へ記述してください。@react-three/fiberはnamed importを使用してください。",
    };
  }
  const transpiled = await transpileScriptModuleCached(source, fileName);
  if (!transpiled.ok) return transpiled;
  if (collectDynamicScriptImports(transpiled.javaScript).length > 0) {
    return {
      ok: false,
      message:
        "動的 import(...) は使用できません。許可されたmoduleを静的importしてください。",
    };
  }

  const { source: rewritten, rejected } = rewriteScriptSpecifiers(
    transpiled.javaScript,
    (specifier) => resolveSpecifier(specifier, options),
  );
  if (rejected.length > 0) {
    return {
      ok: false,
      message: rejected
        .map((entry) => describeRejection(entry.specifier, entry.reason))
        .join("\n"),
    };
  }

  const objectUrl = URL.createObjectURL(
    new Blob([shadowPrelude(), rewritten], { type: "text/javascript" }),
  );
  createdUrls.add(objectUrl);
  try {
    const module = (await import(/* @vite-ignore */ objectUrl)) as Record<
      string,
      unknown
    >;
    return { ok: true, module, objectUrl };
  } catch (error) {
    releaseScriptModuleUrl(objectUrl);
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function transpileScriptModuleCached(
  source: string,
  fileName: string,
): Promise<
  { ok: true; javaScript: string } | { ok: false; message: string }
> {
  const cacheKey = JSON.stringify([
    TRANSPILED_SCRIPT_CACHE_VERSION,
    fileName,
    source,
  ]);
  const cached = transpiledScriptCache.get(cacheKey);
  if (cached !== undefined) {
    transpiledScriptCacheHits += 1;
    // Refresh insertion order so frequently reused Scripts survive the bound.
    transpiledScriptCache.delete(cacheKey);
    transpiledScriptCache.set(cacheKey, cached);
    return { ok: true, javaScript: cached };
  }

  transpiledScriptCacheMisses += 1;
  const transpiled = await transpileTypeScriptModule(source, fileName);
  if (!transpiled.ok) return transpiled;
  transpiledScriptCache.set(cacheKey, transpiled.javaScript);
  while (
    transpiledScriptCache.size > MAX_TRANSPILED_SCRIPT_CACHE_ENTRIES
  ) {
    const oldestKey = transpiledScriptCache.keys().next().value;
    if (oldestKey === undefined) break;
    transpiledScriptCache.delete(oldestKey);
  }
  return transpiled;
}

/** @internal Exposed for the browser contract fixture. */
export function getScriptTranspileCacheStats(): ScriptTranspileCacheStats {
  return {
    hits: transpiledScriptCacheHits,
    misses: transpiledScriptCacheMisses,
    size: transpiledScriptCache.size,
  };
}

/** @internal Exposed for the browser contract fixture. */
export function clearScriptTranspileCache(): void {
  transpiledScriptCache.clear();
  transpiledScriptCacheHits = 0;
  transpiledScriptCacheMisses = 0;
}

function resolveSpecifier(
  specifier: string,
  options: ScriptModuleLoadOptions,
): ScriptSpecifierResolution {
  if (isAllowedScriptSpecifier(specifier)) {
    const url = bridgeUrlFor(specifier);
    return url
      ? { kind: "resolved", url }
      : { kind: "rejected", reason: "unknown-module" };
  }
  if (isRemoteScriptSpecifier(specifier)) {
    return options.allowRemoteModules
      ? { kind: "resolved", url: specifier }
      : { kind: "rejected", reason: "remote-not-allowed" };
  }
  if (isRelativeScriptSpecifier(specifier)) {
    return { kind: "rejected", reason: "relative-not-supported" };
  }
  return { kind: "rejected", reason: "unknown-module" };
}

function describeRejection(
  specifier: string,
  reason: ScriptSpecifierRejection,
): string {
  if (reason === "remote-not-allowed") {
    return `${specifier} を読み込むにはリモートimportの許可が必要です。`;
  }
  if (reason === "relative-not-supported") {
    return `${specifier} はScript間のimportです。まだ対応していません。`;
  }
  return `${specifier} は使用できないmoduleです。`;
}

export function releaseScriptModuleUrl(objectUrl: string): void {
  if (!createdUrls.has(objectUrl)) return;
  URL.revokeObjectURL(objectUrl);
  createdUrls.delete(objectUrl);
}

/**
 * Called on Stop. The editor previously relied on React unmount alone, which
 * left blob URLs alive across Play/Stop cycles.
 */
export function releaseAllScriptModules(): void {
  for (const url of createdUrls) URL.revokeObjectURL(url);
  createdUrls.clear();
  bridgeUrls.clear();
  // Keep the bounded TypeScript emit cache. Stop must dispose executable blob
  // modules and runtime resources, but unchanged source should not pay the
  // Monaco worker cost again on the next Play.
}
