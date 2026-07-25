import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CompiledScript,
  ScriptRenderProps,
} from "../../../packages/xrift-studio-runtime/src/script/api";
import { isCompiledScript } from "../../../packages/xrift-studio-runtime/src/script/api";
import type { ScriptFailure, ScriptLogEntry } from "../../../packages/xrift-studio-runtime/src/script/host";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type { SceneDocument } from "../../lib/visual-editor/scene-document";
import {
  collectRequiredScriptAssetIds,
  collectScriptReferencedAssetIds,
  collectScheduledScripts,
} from "../../lib/visual-editor/scripting/script-schedule";
import {
  loadScriptModule,
  releaseAllScriptModules,
  releaseScriptModuleUrl,
} from "../../lib/script-modules";
import { tauri } from "../../lib/tauri";

/**
 * Compiles the Script Assets a scene needs, before Play starts.
 *
 * Compilation is deliberately a precondition of entering Play: MI-70 requires
 * that a scene with a broken script does not start rather than starting and
 * failing per frame.
 */

export type CompiledScriptEntry = {
  assetId: string;
  script: CompiledScript;
  render?: React.ComponentType<ScriptRenderProps>;
  objectUrl: string;
  /** Reuses the same module identity when another Script was the only edit. */
  cacheKey: string;
};

export type ScriptCompileError = {
  assetId: string;
  assetName: string;
  relativePath: string;
  message: string;
};

export type ScriptRuntimeState = {
  status: "idle" | "compiling" | "ready" | "error";
  scripts: ReadonlyMap<string, CompiledScriptEntry>;
  /** Pre-resolved so `ctx.getAssetUrl` can be synchronous. */
  assetUrls: ReadonlyMap<string, string>;
  /** Short per-Asset revisions used to restart only affected Script hosts. */
  assetUrlVersions: ReadonlyMap<string, number>;
  errors: readonly ScriptCompileError[];
  failures: readonly ScriptFailure[];
  /** Monotonic within one compiled runtime, even after the bounded list fills. */
  failureRevision: number;
  logs: readonly ScriptLogEntry[];
};

const EMPTY_SCRIPTS = new Map<string, CompiledScriptEntry>();
const EMPTY_ASSET_URLS = new Map<string, string>();
const EMPTY_ASSET_URL_VERSIONS = new Map<string, number>();
/** Keeps the console from growing without bound during a long Play run. */
const MAX_LOG_ENTRIES = 200;

export type UseScriptRuntimeOptions = {
  scene: SceneDocument;
  assets: AssetManifest;
  projectPath?: string;
  allowRemoteModules?: boolean;
};

export function useScriptRuntime({
  scene,
  assets,
  projectPath,
  allowRemoteModules,
}: UseScriptRuntimeOptions) {
  const [state, setState] = useState<ScriptRuntimeState>({
    status: "idle",
    scripts: EMPTY_SCRIPTS,
    assetUrls: EMPTY_ASSET_URLS,
    assetUrlVersions: EMPTY_ASSET_URL_VERSIONS,
    errors: [],
    failures: [],
    failureRevision: 0,
    logs: [],
  });
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const stateRef = useRef(state);
  stateRef.current = state;
  const compileGenerationRef = useRef(0);
  const componentRuntimeKeysRef = useRef(new Map<string, string>());

  const reset = useCallback(() => {
    compileGenerationRef.current += 1;
    componentRuntimeKeysRef.current.clear();
    releaseAllScriptModules();
    setState({
      status: "idle",
      scripts: EMPTY_SCRIPTS,
      assetUrls: EMPTY_ASSET_URLS,
      assetUrlVersions: EMPTY_ASSET_URL_VERSIONS,
      errors: [],
      failures: [],
      failureRevision: 0,
      logs: [],
    });
  }, []);

  /**
   * Reads and compiles every referenced Script Asset. Returns the errors so
   * the caller can refuse to start Play instead of inspecting state later.
  */
  const compile = useCallback(async (
    input: { scene?: SceneDocument; assets?: AssetManifest } = {},
  ): Promise<ScriptCompileError[]> => {
    const generation = compileGenerationRef.current + 1;
    compileGenerationRef.current = generation;
    const currentScene = input.scene ?? sceneRef.current;
    const currentAssets = input.assets ?? assetsRef.current;
    const previousState = stateRef.current;
    const previousScripts = previousState.scripts;
    const assetIds = collectRequiredScriptAssetIds(currentScene);
    if (assetIds.length === 0) {
      if (compileGenerationRef.current !== generation) return [];
      for (const entry of previousScripts.values()) {
        releaseScriptModuleUrl(entry.objectUrl);
      }
      componentRuntimeKeysRef.current.clear();
      setState({
        status: "ready",
        scripts: EMPTY_SCRIPTS,
        assetUrls: EMPTY_ASSET_URLS,
        assetUrlVersions: EMPTY_ASSET_URL_VERSIONS,
        errors: [],
        failures: [],
        failureRevision: 0,
        logs: [],
      });
      return [];
    }
    if (!projectPath) {
      const errors = assetIds.map((assetId) => ({
        assetId,
        assetName: currentAssets.assets[assetId]?.name ?? assetId,
        relativePath: "",
        message: "プロジェクトのpathが未確定のためScriptを読み込めません",
      }));
      if (compileGenerationRef.current === generation) {
        setState((previous) => ({ ...previous, status: "error", errors }));
      }
      return errors;
    }

    setState((previous) => ({ ...previous, status: "compiling", errors: [] }));
    const compiled = new Map<string, CompiledScriptEntry>();
    const errors: ScriptCompileError[] = [];

    for (const assetId of assetIds) {
      const asset = currentAssets.assets[assetId];
      if (!asset || asset.kind !== "script") {
        errors.push({
          assetId,
          assetName: asset?.name ?? assetId,
          relativePath: "",
          message: "参照しているScript Assetが見つかりません",
        });
        continue;
      }
      const relativePath = asset.source.relativePath;
      let source: string;
      try {
        source = await tauri.readTextFile(projectPath, relativePath);
      } catch (error) {
        errors.push({
          assetId,
          assetName: asset.name,
          relativePath,
          message:
            error instanceof Error
              ? error.message
              : "Script fileを読み込めませんでした",
        });
        continue;
      }
      const cacheKey = JSON.stringify([
        relativePath,
        Boolean(allowRemoteModules),
        source,
      ]);
      const previousEntry = previousScripts.get(assetId);
      if (previousEntry?.cacheKey === cacheKey) {
        compiled.set(assetId, previousEntry);
        continue;
      }
      const result = await loadScriptModule(source, relativePath, {
        allowRemoteModules,
      });
      if (!result.ok) {
        errors.push({
          assetId,
          assetName: asset.name,
          relativePath,
          message: result.message,
        });
        continue;
      }
      const exported = result.module.default;
      if (!isCompiledScript(exported)) {
        releaseScriptModuleUrl(result.objectUrl);
        errors.push({
          assetId,
          assetName: asset.name,
          relativePath,
          message:
            "default export が defineScript(...) ではありません",
        });
        continue;
      }
      const render = result.module.Render;
      compiled.set(assetId, {
        assetId,
        script: exported,
        ...(typeof render === "function"
          ? {
              render: render as React.ComponentType<ScriptRenderProps>,
            }
          : {}),
        objectUrl: result.objectUrl,
        cacheKey,
      });
    }

    // Asset props are resolved up front: the read is asynchronous IPC but
    // ctx.getAssetUrl must answer synchronously inside a frame.
    const assetUrls = new Map<string, string>();
    const assetUrlVersions = new Map<string, number>();
    for (const assetId of collectScriptReferencedAssetIds(currentScene)) {
      const asset = currentAssets.assets[assetId];
      if (!asset || asset.source.kind !== "project") continue;
      try {
        const url = await tauri.readProjectFileDataUrl(
          projectPath,
          asset.source.relativePath,
        );
        assetUrls.set(assetId, url);
        const previousVersion =
          previousState.assetUrlVersions.get(assetId) ?? 0;
        assetUrlVersions.set(
          assetId,
          previousState.assetUrls.get(assetId) === url
            ? Math.max(1, previousVersion)
            : previousVersion + 1,
        );
      } catch {
        // A missing Asset URL is reported by the script when it reads null,
        // not by refusing to start the whole scene.
      }
    }

    if (compileGenerationRef.current !== generation) {
      for (const entry of compiled.values()) {
        if (previousScripts.get(entry.assetId) !== entry) {
          releaseScriptModuleUrl(entry.objectUrl);
        }
      }
      return errors;
    }

    if (errors.length > 0) {
      for (const entry of compiled.values()) {
        if (previousScripts.get(entry.assetId) !== entry) {
          releaseScriptModuleUrl(entry.objectUrl);
        }
      }
      setState((previous) => ({
        ...previous,
        status: "error",
        errors,
      }));
    } else {
      const nextComponentRuntimeKeys = createComponentRuntimeKeys(
        currentScene,
        compiled,
        assetUrlVersions,
      );
      const unchangedComponentIds = new Set(
        [...nextComponentRuntimeKeys].flatMap(([componentId, key]) =>
          componentRuntimeKeysRef.current.get(componentId) === key
            ? [componentId]
            : [],
        ),
      );
      componentRuntimeKeysRef.current = nextComponentRuntimeKeys;
      for (const entry of previousScripts.values()) {
        if (compiled.get(entry.assetId) !== entry) {
          releaseScriptModuleUrl(entry.objectUrl);
        }
      }
      setState((previous) => ({
        status: "ready",
        scripts: compiled,
        assetUrls,
        assetUrlVersions,
        errors: [],
        failures: previous.failures.filter((entry) =>
          unchangedComponentIds.has(entry.componentId),
        ),
        failureRevision: previous.failureRevision,
        logs: previous.logs.filter((entry) =>
          unchangedComponentIds.has(entry.componentId),
        ),
      }));
    }
    return errors;
  }, [allowRemoteModules, projectPath]);

  const handleFailure = useCallback((failure: ScriptFailure) => {
    setState((previous) => ({
      ...previous,
      failures: [...previous.failures, failure].slice(-MAX_LOG_ENTRIES),
      failureRevision: previous.failureRevision + 1,
    }));
  }, []);

  const handleLog = useCallback((entry: ScriptLogEntry) => {
    setState((previous) => ({
      ...previous,
      logs: [...previous.logs, entry].slice(-MAX_LOG_ENTRIES),
    }));
  }, []);

  useEffect(
    () => () => {
      compileGenerationRef.current += 1;
      componentRuntimeKeysRef.current.clear();
      releaseAllScriptModules();
    },
    [],
  );

  return useMemo(
    () => ({ state, compile, reset, handleFailure, handleLog }),
    [state, compile, reset, handleFailure, handleLog],
  );
}

export type ScriptRuntime = ReturnType<typeof useScriptRuntime>;

function createComponentRuntimeKeys(
  scene: SceneDocument,
  scripts: ReadonlyMap<string, CompiledScriptEntry>,
  assetUrlVersions: ReadonlyMap<string, number>,
): Map<string, string> {
  const keys = new Map<string, string>();
  for (const scheduled of collectScheduledScripts(scene)) {
    const entity = scene.entities[scheduled.entityId];
    const component = entity?.components.find(
      (candidate) =>
        candidate.id === scheduled.componentId &&
        candidate.type === "script",
    );
    const entry = scripts.get(scheduled.scriptAssetId);
    if (!entity || !component || component.type !== "script" || !entry) {
      continue;
    }
    keys.set(
      component.id,
      JSON.stringify([
        entity.id,
        entity.name,
        scheduled.order,
        entry.cacheKey,
        component.assetReferences,
        component.entityReferences,
        [...component.assetReferences]
          .sort()
          .map((assetId) => [
            assetId,
            assetUrlVersions.get(assetId) ?? null,
          ]),
      ]),
    );
  }
  return keys;
}
