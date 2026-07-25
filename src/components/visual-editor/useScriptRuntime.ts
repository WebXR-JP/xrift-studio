import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CompiledScript } from "../../../packages/xrift-studio-runtime/src/script/api";
import { isCompiledScript } from "../../../packages/xrift-studio-runtime/src/script/api";
import type { ScriptFailure, ScriptLogEntry } from "../../../packages/xrift-studio-runtime/src/script/host";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type { SceneDocument } from "../../lib/visual-editor/scene-document";
import {
  collectRequiredScriptAssetIds,
  collectScriptReferencedAssetIds,
} from "../../lib/visual-editor/scripting/script-schedule";
import {
  loadScriptModule,
  releaseAllScriptModules,
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
  render?: React.ComponentType;
  objectUrl: string;
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
  errors: readonly ScriptCompileError[];
  failures: readonly ScriptFailure[];
  logs: readonly ScriptLogEntry[];
};

const EMPTY_SCRIPTS = new Map<string, CompiledScriptEntry>();
const EMPTY_ASSET_URLS = new Map<string, string>();
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
    errors: [],
    failures: [],
    logs: [],
  });
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const reset = useCallback(() => {
    releaseAllScriptModules();
    setState({
      status: "idle",
      scripts: EMPTY_SCRIPTS,
      assetUrls: EMPTY_ASSET_URLS,
      errors: [],
      failures: [],
      logs: [],
    });
  }, []);

  /**
   * Reads and compiles every referenced Script Asset. Returns the errors so
   * the caller can refuse to start Play instead of inspecting state later.
   */
  const compile = useCallback(async (): Promise<ScriptCompileError[]> => {
    const currentScene = sceneRef.current;
    const currentAssets = assetsRef.current;
    const assetIds = collectRequiredScriptAssetIds(currentScene);
    if (assetIds.length === 0) {
      setState({
        status: "ready",
        scripts: EMPTY_SCRIPTS,
        assetUrls: EMPTY_ASSET_URLS,
        errors: [],
        failures: [],
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
      setState((previous) => ({ ...previous, status: "error", errors }));
      return errors;
    }

    setState((previous) => ({ ...previous, status: "compiling", errors: [] }));
    releaseAllScriptModules();

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
          ? { render: render as React.ComponentType }
          : {}),
        objectUrl: result.objectUrl,
      });
    }

    // Asset props are resolved up front: the read is asynchronous IPC but
    // ctx.getAssetUrl must answer synchronously inside a frame.
    const assetUrls = new Map<string, string>();
    for (const assetId of collectScriptReferencedAssetIds(currentScene)) {
      const asset = currentAssets.assets[assetId];
      if (!asset || asset.source.kind !== "project") continue;
      try {
        assetUrls.set(
          assetId,
          await tauri.readProjectFileDataUrl(
            projectPath,
            asset.source.relativePath,
          ),
        );
      } catch {
        // A missing Asset URL is reported by the script when it reads null,
        // not by refusing to start the whole scene.
      }
    }

    setState({
      status: errors.length > 0 ? "error" : "ready",
      scripts: compiled,
      assetUrls,
      errors,
      failures: [],
      logs: [],
    });
    return errors;
  }, [allowRemoteModules, projectPath]);

  const handleFailure = useCallback((failure: ScriptFailure) => {
    setState((previous) => ({
      ...previous,
      failures: [...previous.failures, failure].slice(-MAX_LOG_ENTRIES),
    }));
  }, []);

  const handleLog = useCallback((entry: ScriptLogEntry) => {
    setState((previous) => ({
      ...previous,
      logs: [...previous.logs, entry].slice(-MAX_LOG_ENTRIES),
    }));
  }, []);

  useEffect(() => () => releaseAllScriptModules(), []);

  return useMemo(
    () => ({ state, compile, reset, handleFailure, handleLog }),
    [state, compile, reset, handleFailure, handleLog],
  );
}

export type ScriptRuntime = ReturnType<typeof useScriptRuntime>;
